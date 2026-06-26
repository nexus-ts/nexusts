/**
 * 11-sse — Server-Sent Events with type-safe streaming.
 *
 *   GET /                       → Interactive SSE dashboard (HTML)
 *   GET /events/timeseries      → SSE: tick every second
 *   GET /events/notify          → SSE: random notifications
 *   GET /events/last-id         → Echo the Last-Event-ID header (JSON)
 *
 * Run: bun main.ts
 * Then open: http://localhost:3000
 *
 * Decorators:
 *   @SseEventMeta({ name, description }) — SSE endpoint metadata
 *   getLastEventId(ctx)                  — read Last-Event-ID header
 */
import { Application, Module, Controller, Get, Injectable } from "@nexusts/core";
import { sse, SseEventMeta, getLastEventId } from "@nexusts/sse";
import type { Context } from "hono";

@Injectable()
@Controller("/")
class AppController {
  @Get("/")
  index(ctx: Context) {
    return ctx.html(`<!doctype html>
<html><head><title>SSE Demo</title><style>
body{font-family:system-ui;background:#111;color:#eee;max-width:800px;margin:2em auto;padding:0 1em}
h1{color:#8af}
.endpoint{background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:1em;margin:1em 0}
.endpoint h2{margin:0 0 .5em;font-size:1rem;color:#8af}
pre{background:#000;padding:.5em;border-radius:4px;min-height:2em;max-height:200px;overflow:auto;font-size:.85rem}
.meta{font-size:.8rem;color:#888;margin-bottom:.5em}
.btn{padding:.3em .8em;background:#3a3a6e;color:#fff;border:none;border-radius:4px;cursor:pointer}
.btn:hover{background:#5a5aae}
</style></head><body>
<h1>\u{1F4E1} SSE Decorator Demo</h1>

<div class="endpoint">
  <h2>\u{1F550} /events/timeseries <span class="meta">@SseEventMeta({name:"tick",description:"Server tick"})</span></h2>
  <pre id="tickLog"><em>Waiting...</em></pre>
</div>

<div class="endpoint">
  <h2>\u{1F514} /events/notify <span class="meta">@SseEventMeta({name:"notify",description:"Random notifications"})</span></h2>
  <button class="btn" id="startNotify">Connect</button>
  <pre id="notifyLog"><em>Click Connect</em></pre>
</div>

<div class="endpoint">
  <h2>\u{1F4CB} /events/last-id <span class="meta">getLastEventId(ctx)</span></h2>
  <button class="btn" id="testLastId">Test with Last-Event-ID: abc123</button>
  <button class="btn" id="testLastIdNull">Test without header</button>
  <pre id="lastIdLog"><em>Click a button</em></pre>
</div>

<script>
new EventSource("/events/timeseries").onmessage = (e) => {
  const el = document.getElementById("tickLog");
  el.textContent += e.data + "\\n";
  el.scrollTop = el.scrollHeight;
};

document.getElementById("startNotify").onclick = () => {
  const el = document.getElementById("notifyLog");
  el.textContent = "";
  new EventSource("/events/notify").onmessage = (e) => {
    el.textContent += e.data + "\\n";
    el.scrollTop = el.scrollHeight;
  };
  document.getElementById("startNotify").textContent = "Connected";
  document.getElementById("startNotify").disabled = true;
};

document.getElementById("testLastId").onclick = async () => {
  const r = await fetch("/events/last-id", { headers: { "Last-Event-ID": "abc123" } });
  const j = await r.json();
  document.getElementById("lastIdLog").textContent = JSON.stringify(j, null, 2);
};

document.getElementById("testLastIdNull").onclick = async () => {
  const r = await fetch("/events/last-id");
  const j = await r.json();
  document.getElementById("lastIdLog").textContent = JSON.stringify(j, null, 2);
};
</script></body></html>`);
  }

  @Get("/events/timeseries")
  @SseEventMeta({ name: "tick", description: "Server tick every second" })
  timeseries(ctx: Context) {
    return sse(ctx, (stream) => {
      let n = 0;
      stream.send({ event: "tick", data: { n } });
      const id = setInterval(() => {
        n += 1;
        stream.send({ event: "tick", data: { n, ts: Date.now() } });
      }, 1000);
      stream.onAbort(() => clearInterval(id));
    });
  }

  @Get("/events/notify")
  @SseEventMeta({ name: "notify", description: "Random notifications" })
  notify(ctx: Context) {
    return sse(ctx, (stream) => {
      const messages = ["Server CPU 72%", "Cache hit 94%", "New order #1024", "Backup complete"];
      let n = 0;
      stream.send({ event: "notify", data: { msg: messages[0], ts: Date.now() } });
      const id = setInterval(() => {
        n = (n + 1) % messages.length;
        stream.send({ event: "notify", data: { msg: messages[n], ts: Date.now() } });
      }, 3000);
      stream.onAbort(() => clearInterval(id));
    });
  }

  @Get("/events/last-id")
  lastId(ctx: Context) {
    const id = getLastEventId(ctx);
    return ctx.json({ lastEventId: id, note: "Send Last-Event-ID header to test reconnection" });
  }
}

@Module({
  controllers: [AppController],
})
class AppModule {}

const app = new Application(AppModule);
const port = Number(process.env.PORT ?? 3000);
await app.listen(port);
