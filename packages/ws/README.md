# @nexusts/ws

> **NexusTS WebSockets** — WebSocket gateways with Bun's built-in `Bun.serve` websocket. Rooms, broadcast, and lifecycle decorators.

## Features

- **Bun native** — uses `Bun.serve` websocket (no ws package needed)
- **Decorators** — `@WebSocketGateway(path)`, `@OnWebSocketOpen`, `@OnWebSocketMessage`, `@OnWebSocketClose`
- **Rooms** — `joinRoom`, `leaveRoom`, `broadcastToRoom`
- **Cloudflare Workers** — compatible via adapter

## Install

This module is part of the NexusTS monorepo. Each module is published as its own npm package under the `@nexusts/` scope.

Most apps start with just the core:

```bash
bun add @nexusts/core
```

Then add this module only if you need it:

```bash
bun add @nexusts/ws
```

## Peer dependencies

**None.** Bun's WebSocket runtime is built in — no `ws` package needed.

## Quick start

```typescript
import { WebSocketModule, WebSocketGateway, OnWebSocketMessage } from "@nexusts/ws";
import { Module, Injectable } from "@nexusts/core";

@Injectable()
@WebSocketGateway("/chat")
class ChatGateway {
  @OnWebSocketMessage("message")
  onMessage(client: any, data: { text: string }) {
    client.send(`Echo: ${data.text}`);
  }
}

@Module({
  imports: [WebSocketModule.forRoot({ gateways: [ChatGateway] })],
})
class AppModule {}
```

See the [user guide](../../docs/user-guide/ws.md) and the [example app](../../examples/) for a working demo.

## License

MIT — see the root [LICENSE](../../LICENSE).
