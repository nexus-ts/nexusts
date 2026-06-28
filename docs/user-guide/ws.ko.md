# WebSockets · `@nexusts/ws` (v0.5)

> English: [`ws.md`](./ws.md)
> v0.5 신규. Hono의 런타임별 WebSocket 지원을 단일 관용적 API로 통합.

`@nexusts/ws`가 제공하는 것:

- **`@WebSocketGateway(path)`** — 클래스 데코레이터. 프레임워크가 `<path>`에 Hono `upgradeWebSocket` 핸들러 설치.
- **`@OnWebSocketOpen()`, `@OnWebSocketMessage()`, `@OnWebSocketClose()`, `@OnWebSocketError()`** — 메서드 데코레이터. 라이프사이클 이벤트를 특정 메서드에 바인딩.
- **`WebSocketService`** — DI 친화적 서비스. 연결 추적, rooms, broadcasting.
- **`WebSocketClient`** — 연결별 래퍼. `id`, `rooms`, `data`, `send()`, `close()`, `joinRoom()` / `leaveRoom()` 보유.

---

## 1. 빠른 시작 (Bun)

```ts
import { Module, Inject } from "@nexusts/core";
import {
  WebSocketModule,
  WebSocketService,
  WEBSOCKET_SERVICE_TOKEN,
  WebSocketGateway,
  OnWebSocketOpen,
  OnWebSocketMessage,
  OnWebSocketClose,
} from "@nexusts/ws";

@Injectable()
@WebSocketGateway("/ws")
class ChatGateway {
  @Inject(WEBSOCKET_SERVICE_TOKEN) declare ws: WebSocketService;

  @OnWebSocketOpen()
  onOpen(client: WebSocketClient) {
    this.ws.joinRoom(client, "lobby");
  }

  @OnWebSocketMessage()
  onMessage(client: WebSocketClient, data: { text: string }) {
    this.ws.broadcastToRoom("lobby", { user: client.id, text: data.text });
  }

  @OnWebSocketClose()
  onClose(client: WebSocketClient) {
    this.ws.leaveAllRooms(client);
  }
}

@Module({
  imports: [WebSocketModule.forRoot({ gateways: [ChatGateway] })],
})
class AppModule {}
```

부팅 시 wiring:

```ts
import { Application } from "@nexusts/core";
import { BunWsAdapter } from "@nexusts/ws";

const app = new Application(AppModule);
const adapter = new BunWsAdapter(app.container.resolve(WebSocketService));
const { websocket } = await adapter.install(app.server.app, [ChatGateway]);

Bun.serve({
  port: 3000,
  fetch: app.fetch,
  websocket,
});
```

이게 전부. `ws://localhost:3000/ws`에 연결하는 클라이언트는 이제 `ChatGateway`를 통해 라우팅됨.

---


```ts
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const app = new Application(AppModule);
const service = app.container.resolve(WebSocketService);
const { handleUpgrade } = await adapter.bind([ChatGateway]);

const wss = new WebSocketServer({ noServer: true });
const server = createServer((req, res) => app.fetch(new Request(...)));

server.on("upgrade", (req, socket, head) => {
  handleUpgrade(req, socket, head);
});

server.listen(3000);
```

`ws` 패키지는 **optional peer dep** — Node를 타겟으로 할 때만 설치:

```bash
bun add ws
```

---

## 3. `WebSocketService` API

```ts
class WebSocketService {
  // Registry
  get size: number;
  getConnections(): WebSocketClient[];
  getConnection(id: string): WebSocketClient | undefined;

  // Rooms
  joinRoom(client, room): void;
  leaveRoom(client, room): void;
  leaveAllRooms(client): void;
  getRoomMembers(room): WebSocketClient[];
  getRooms(): string[];
  hasRoom(room): boolean;

  // Broadcast
  broadcast(data, filter?): void;
  broadcastToRoom(room, data): void;
  sendTo(id, data): boolean;
  closeAll(code?, reason?): void;

  // Lifecycle
  onConnect(cb): void;
  onDisconnect(cb): void;
}
```

`data`는 자동 JSON-encoding. 문자열, ArrayBuffer, Uint8Array는 그대로 통과.

---

## 4. `WebSocketClient` 래퍼

각 연결은 래핑됨:

```ts
interface WebSocketClient {
  readonly id: string;            // 고유 연결 id
  readonly rooms: ReadonlySet<string>;
  readonly data: WsClientData;    // 자유 형태 per-connection 데이터
  readonly url: string | null;
  readonly protocol: string | null;
  readonly readyState: WsReadyState;
  send(data: WsMessage): void;
  close(code?: number, reason?: string): void;
  setData(data: Partial<WsClientData>): void;
  joinRoom(room: string): void;
  leaveRoom(room: string): void;
}
```

연결 시 임의의 데이터를 부착 — 일반적으로 인증된 사용자:

```ts
@OnWebSocketOpen()
async onOpen(client: WebSocketClient) {
  const user = await this.auth.verifyHandshake(client);
  if (!user) {
    client.close(4401, "Unauthorized");
    return;
  }
  client.setData({ userId: user.id });
  this.ws.joinRoom(client, `user:${user.id}`);
}
```

---

## 5. 인증

WebSocket 연결은 REST 요청과 동일한 방식으로 HTTP 헤더를 전달하지 않음. 다음 옵션 중 하나 사용:

1. **Sub-protocol 토큰** — `Sec-WebSocket-Protocol` 헤더에 JWT 전달. `client.protocol`에서 사용 가능 (Hono 파싱).

   ```ts
   // Client
   const ws = new WebSocket("ws://localhost:3000/ws", [
     "jwt",                                  // 프로토콜 이름
     `token.${accessToken}`,                 // 실제 토큰
   ]);
   ```

   ```ts
   // Server
   @OnWebSocketOpen()
   onOpen(client: WebSocketClient) {
     const token = client.protocol?.startsWith("token.")
       ? client.protocol.slice("token.".length)
       : null;
     const user = token ? this.auth.verifyJwt(token) : null;
     if (!user) return client.close(4401, "Unauthorized");
     client.setData({ userId: user.id });
   }
   ```

2. **Cookie** — 앱에 이미 session 미들웨어(`@nexusts/session`)가 있으면 upgrade 요청이 쿠키를 전달. Upgrade 경로에 Hono 미들웨어를 사용해 검증.

3. **First-message handshake** — 모든 upgrade를 수락, 클라이언트가 첫 프레임으로 `{type: "auth", token: "..."}` 메시지를 보내도록 요구. 인증 실패 시 close.

---

## 6. Heartbeats / keep-alive

프레임워크는 내장 heartbeat를 제공하지 않음 (런타임이 TCP keep-alive를 관리). 데드 연결 감지를 위해 application-level heartbeat가 필요하면 주기적 ping 전송:

```ts
@OnWebSocketOpen()
onOpen(client: WebSocketClient) {
  const heartbeat = setInterval(() => {
    if (client.readyState === WsReadyState.OPEN) {
      client.send({ type: "ping", ts: Date.now() });
    } else {
      clearInterval(heartbeat);
    }
  }, 30_000);
}
```

---

## 7. 데코레이터 메타데이터 저장

내부적으로 `@WebSocketGateway`와 라이프사이클 데코레이터는 `Symbol.for` 키를 통해 메타데이터를 공유. `@WebSocketGateway`는 클래스 decoration 시점에 프로토타입을 순회하여 라이프사이클 핸들러를 수집. 이로써 프레임워크는 TS transform quirks에 robust.

---

## 8. Cloudflare Workers

Cloudflare Workers WebSocket은 **Durable Objects** 컨텍스트가 필요. 프레임워크는 Worker 외부에서 자동 설치 불가. 권장 패턴:

```ts
// Durable Object에서
export class WebSocketDurableObject implements DurableObject {
  state: DurableObjectState;
  env: any;
  service: WebSocketService;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
    this.service = new WebSocketService();
  }

  async fetch(req: Request) {
    if (req.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      this.handleConnection(pair[0]);
      return new Response(null, { status: 101, webSocket: pair[1] });
    }
    return new Response("Expected websocket", { status: 400 });
  }

  handleConnection(ws: WebSocket) {
    const client = new WebSocketClientImpl(adaptDurableObjectWs(ws));
    this.service.register(client);
    // ... @OnWebSocketMessage / @OnWebSocketClose 연결
  }
}

// Worker에서
export default {
  async fetch(req: Request, env: any) {
    if (req.headers.get("Upgrade") === "websocket") {
      const id = env.WS_DO.idFromName("default");
      const stub = env.WS_DO.get(id);
      return stub.fetch(req);
    }
    // ... 일반 Hono app
  },
};
```

이 통합은 문서화되어 있지만 프레임워크가 자동 설치하지는 않음 — 사용자가 직접 wiring하는 `wrangler.toml` Durable Object 바인딩이 필요.

---

## 9. 설정

```ts
interface WebSocketConfig {
  path?: string;              // default: "/ws"
  json?: boolean;             // 메시지 자동 JSON 파싱 (default: true)
  heartbeatSeconds?: number;  // 미래용 예약 (default: 30)
  onUnknownRuntime?: "throw" | "noop";  // default: "throw"
}
```

---

## 10. 참고

- [`./sse.md`](./sse.md) — 단방향 대응 모듈
- [`./tracing.md`](./tracing.md) — 분산 추적 (WebSocket span 계측과 잘 어울림)
- [`./metrics.md`](./metrics.md) — `@Counted`도 WebSocket 라이프사이클 메서드에서 작동
- [Hono Bun WebSocket 어댑터](https://hono.dev/docs/helpers/websocket#bun)
- [Bun WebSocket 문서](https://bun.sh/docs/api/websockets)
- [npm의 `ws` 패키지](https://www.npmjs.com/package/ws)
