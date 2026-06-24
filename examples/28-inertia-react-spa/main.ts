import "reflect-metadata";
import path from "node:path";
import { Application, Module, Controller, Get, Post, Body, Inject, Ctx, Injectable } from "@nexusts/core";
import { StaticModule } from "@nexusts/static";
import { Inertia } from "@nexusts/view";

/**
 * 28-inertia-react-spa — Inertia.js v3 with React (client-side only).
 *
 *   GET  /            → Inertia page "Home" with greeting + count
 *   POST /counter     → increment the counter (Inertia action, returns 303)
 *   POST /greet       → form action with validation (Inertia errors)
 *
 *   Run: bun main.ts
 *   Open: http://localhost:3000
 *
 *   The client is bundled from `frontend/app.tsx` at boot by Bun
 *   and served at /static/app.js. There is NO SSR — the server
 *   emits an HTML shell with the page object embedded as
 *   `<script data-page="app" type="application/json">` and the React
 *   client hydrates from there.
 *
 *   This matches the Laravel + Inertia (CSR) recipe:
 *     - Controller returns an Inertia page
 *     - Inertia middleware auto-detects XHR / browser requests
 *     - 303 redirects on POST are followed transparently
 */

// In-memory counter (single-process, just for the demo).
let _count = 0;
function readCount() { return _count; }
function bumpCount() { _count += 1; }

@Injectable()
@Controller("/")
class HomeController {
  constructor(@Inject(Inertia.TOKEN) private inertia: Inertia) {}

  @Get("/")
  home() {
    return this.inertia.render("Home", {
      greeting: "Hello from Inertia + React!",
      count: readCount(),
    });
  }

  @Post("/counter")
  counter() {
    bumpCount();
    // 303 See Other — Inertia's standard redirect for non-GET actions.
    return this.inertia.location("/");
  }

  @Post("/greet")
  greet(@Ctx() c: any, @Body() body: { name?: string }) {
    // Inertia v3 form errors: 422 with `{ errors: {...} }` in props.
    if (!body?.name || body.name.trim().length === 0) {
      c.status(422);
      return this.inertia.render("Home", {
        greeting: "Hello from Inertia + React!",
        count: readCount(),
        errors: { name: "Please tell us your name." },
      });
    }
    return this.inertia.render("Home", {
      greeting: `Welcome, ${body.name}!`,
      count: readCount(),
    });
  }
}

@Module({
  providers: [{ provide: Inertia.TOKEN, useValue: new Inertia() }],
  controllers: [HomeController],
})
class AppModule {}

const app = new Application(AppModule);

// Serve the bundled React client at /static/app.js
const staticMw = StaticModule.mount({
  root: path.join(import.meta.dir, "public"),
  prefix: "/static",
});
app.server.app.use("/static/*", staticMw);

// Read PORT from env so the smoke test runner (which sets PORT=14027)
// can pick a free port automatically. Default 3000 for `bun main.ts`.
const port = Number(process.env.PORT ?? 3000);
await app.listen(port);
