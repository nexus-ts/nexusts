# 10 · WebSocket

Real-time bidirectional communication with `@nexusts/ws`.

## What it shows

- `@WebSocketGateway('/path')` decorator
- `@OnWebSocketMessage(event)` handler
- `WebSocketService.broadcast()` for fan-out
- Per-connection rooms

## How to run

```bash
cd examples/10-websocket
bun main.ts
```

Open `examples/10-websocket/client.html` in a browser to test.

## Code (server)

```ts
// main.ts
import "reflect-metadata";
import { Application, Module, Controller, Get, Injectable, Inject } from "@nexusts/core";
import { WebSocketService, WebSocketGateway, OnWebSocketMessage, OnWebSocketOpen, OnWebSocketClose } from "@nexusts/ws";

@Injectable()
@Controller("/")
class AppController {
  @Get("/")
  status() { return { ok: true }; }
}

@Injectable()
@WebSocketGateway("/chat")
class ChatGateway {
  @Inject(WebSocketService) declare private ws: WebSocketService;

  @OnWebSocketOpen()
  onOpen(socket: any) {
    console.log(`[ws] client connected: ${socket.id}`);
  }

  @OnWebSocketMessage("message")
  onMessage(socket: any, message: { user: string; text: string }) {
    console.log(`[ws] ${message.user}: ${message.text}`);
    this.ws.broadcast("/chat", "message", { ...message, ts: Date.now() });
  }

  @OnWebSocketClose()
  onClose(socket: any) {
    console.log(`[ws] client disconnected: ${socket.id}`);
  }
}

@Module({
  imports: [WebSocketService.forRoot()],
  controllers: [AppController],
  providers: [ChatGateway],
})
class AppModule {}

const app = new Application(AppModule);
await app.listen(3000);
```

## Client (browser)

```html
<!-- client.html -->
<script>
const ws = new WebSocket("ws://localhost:3000/chat");
ws.onmessage = (e) => console.log(JSON.parse(e.data));
ws.send(JSON.stringify({
  type: "message",
  data: { user: "alice", text: "hi" }
}));
</script>
```

## Rooms

```ts
this.ws.joinRoom(socket.id, "general");
this.ws.broadcastToRoom("general", "message", payload);
```
