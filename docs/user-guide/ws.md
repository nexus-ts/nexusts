# WebSockets · `@nexusts/ws` (v0.5)

> New in v0.5. Unifies Hono's runtime-specific WebSocket support
> behind a single, ergonomic API. Works on **Bun** (primary) and
> **Bun** (primary, via `Bun.serve` websocket). Cloudflare Workers is out of
> scope — see the [Cloudflare section](#8-cloudflare-workers) below.

`@nexusts/ws` gives you:

- **`@WebSocketGateway(path)`** — class-level decorator. The
  framework installs a Hono `upgradeWebSocket` handler at `<path>`.
- **`@OnWebSocketOpen()`, `@OnWebSocketMessage()`,
  `@OnWebSocketClose()`, `@OnWebSocketError()`** — method-level
  decorators. Bind lifecycle events to specific methods.
- **`WebSocketService`** — DI-friendly service for connection
  tracking, rooms, broadcasting.
- **`WebSocketClient`** — per-connection wrapper. Has `id`, `rooms`,
  `data`, `send()`, `close()`, `joinRoom()` / `leaveRoom()`.
- **Runtime auto-detection** — Bun is detected automatically. On
  Node, the framework lazy-imports the `ws` package.

---

## 1. Quick start (Bun)

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

Wiring up at boot time:

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

That's it. A client connecting to `ws://localhost:3000/ws` is
now routed through `ChatGateway`.

---

## 2. Quick start

```ts
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { BunWsAdapter } from "@nexusts/ws";

const app = new Application(AppModule);
const service = app.container.resolve(WebSocketService);
const adapter = new BunWsAdapter(service);
const { handleUpgrade } = await adapter.bind([ChatGateway]);

const wss = new WebSocketServer({ noServer: true });
const server = createServer((req, res) => app.fetch(new Request(...)) /* or Hono fetch */);

server.on("upgrade", (req, socket, head) => {
  handleUpgrade(req, socket, head);
});

server.listen(3000);
```

The `ws` package is an **optional peer dep** — install it only if
you target Node:

```bash
bun add ws
```

---

## 3. The `WebSocketService` API

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

`data` is auto JSON-encoded. Strings, ArrayBuffers, and Uint8Arrays
are passed through.

---

## 4. The `WebSocketClient` wrapper

Each connection is wrapped:

```ts
interface WebSocketClient {
  readonly id: string;            // unique connection id
  readonly rooms: ReadonlySet<string>;
  readonly data: WsClientData;    // free-form per-connection data
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

Attach arbitrary data on connect — typically the authenticated user:

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

## 5. Authentication

WebSocket connections don't carry HTTP headers in the same way as
REST requests. For auth, use one of:

1. **Sub-protocol token** — pass a JWT in the `Sec-WebSocket-Protocol`
   header. It's available on `client.protocol` (Hono parses it).

   ```ts
   // Client
   const ws = new WebSocket("ws://localhost:3000/ws", [
     "jwt",                                  // protocol name
     `token.${accessToken}`,                 // actual token
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

2. **Cookie** — if your app already has session middleware
   (`@nexusts/session`), the upgrade request carries the cookie.
   Use a Hono middleware on the upgrade path to verify.

3. **First-message handshake** — accept all upgrades, require the
   client to send an `{type: "auth", token: "..."}` message as
   its first frame. Close on auth failure.

---

## 6. Heartbeats / keep-alive

The framework doesn't ship a built-in heartbeat (the runtime
manages TCP keep-alive). If you need application-level heartbeats
to detect dead connections, send periodic pings:

```ts
@OnWebSocketOpen()
onOpen(client: WebSocketClient) {
  const heartbeat = setInterval(() => {
    if (client.readyState === WsReadyState.OPEN) {
      // ws package / Bun both support ping natively — here we send
      // an app-level ping for visibility.
      client.send({ type: "ping", ts: Date.now() });
    } else {
      clearInterval(heartbeat);
    }
  }, 30_000);
}
```

---

## 7. Decorator metadata storage

Internally, `@WebSocketGateway` and the lifecycle decorators share
metadata via a `Symbol.for` key. The `@WebSocketGateway` walks
the prototype to collect the lifecycle handlers at class-decoration
time. This makes the framework robust to TS transform quirks.

---

## 8. Cloudflare Workers

Cloudflare Workers WebSockets require a **Durable Objects**
context. The framework can't auto-install them from outside the
Worker. The recommended pattern:

```ts
// In your Durable Object
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
    // Bridge WebSocketDurableObject's native WS to @nexusts/ws's lifecycle.
    const client = new WebSocketClientImpl(adaptDurableObjectWs(ws));
    this.service.register(client);
    // ... wire @OnWebSocketMessage / @OnWebSocketClose
  }
}

// In the Worker
export default {
  async fetch(req: Request, env: any) {
    if (req.headers.get("Upgrade") === "websocket") {
      const id = env.WS_DO.idFromName("default");
      const stub = env.WS_DO.get(id);
      return stub.fetch(req);
    }
    // ... regular Hono app
  },
};
```

This integration is documented but not auto-installed by the
framework — it requires a `wrangler.toml` Durable Object binding
that the user wires up themselves.

---

## 9. Configuration

```ts
interface WebSocketConfig {
  path?: string;              // default: "/ws"
  json?: boolean;             // auto-parse JSON messages (default: true)
  heartbeatSeconds?: number;  // reserved for future use (default: 30)
  onUnknownRuntime?: "throw" | "noop";  // default: "throw"
}
```

---

## 10. See also

- [`./sse.md`](./sse.md) — the unidirectional counterpart
- [`./tracing.md`](./tracing.md) — distributed tracing pairs well
  with WebSocket span instrumentation
- [`./metrics.md`](./metrics.md) — `@Counted` works on WebSocket
  lifecycle methods too
- [Hono Bun WebSocket adapter](https://hono.dev/docs/helpers/websocket#bun)
- [Bun WebSocket docs](https://bun.sh/docs/api/websockets)
- [`ws` package on npm](https://www.npmjs.com/package/ws)
