/**
 * 04-session-auth — cookie-based session demonstration.
 *
 *   POST /login     { "user": "alice" }     → stores in session
 *   GET  /profile                           → reads session.user
 *   GET  /logout                            → clears session
 *
 * Run: bun main.ts
 * Test:
 *   curl -c /tmp/c.txt -b /tmp/c.txt -X POST -d "user=alice" http://localhost:3000/login
 *   curl -c /tmp/c.txt -b /tmp/c.txt http://localhost:3000/profile
 *   curl -c /tmp/c.txt -b /tmp/c.txt http://localhost:3000/logout
 */

// The example runs in legacy decorator mode (see tsconfig.json written by the smoke test).
// In this mode, the @Session() parameter decorator works.
//
// For standard decorator mode (Bun default), use ctx.session instead:
//   ctx.session.get("user") / ctx.session.set("key", val)

import {
  Application, Controller, Get, Post, Module, Injectable,
} from "@nexusts/core";
import { SessionService, SessionModule } from "@nexusts/session";
import type { Context } from "hono";

@Injectable()
@Controller("/")
class AuthController {
  declare sessions: SessionService;

  @Post("/login")
  async login(ctx: Context) {
    const body = await ctx.req.parseBody() as { user?: string };
    if (!body.user || body.user.length === 0) {
      return ctx.text("Invalid", 400);
    }
    // Create session record
    const sid = await this.sessions.create({ data: { user: body.user } });
    ctx.header("Set-Cookie", `sid=${sid.id}; HttpOnly; Path=/; Max-Age=86400`);
    return { ok: true, user: body.user };
  }

  @Get("/profile")
  profile(ctx: Context) {
    // Access via c.var.nexus.user (populated by sessionMiddleware)
    const nexus = (ctx as any).var?.nexus;
    return { user: nexus?.session?.data?.user ?? null };
  }

  @Get("/logout")
  logout(ctx: Context) {
    ctx.header("Set-Cookie", "sid=; HttpOnly; Path=/; Max-Age=0");
    return { ok: true };
  }
}

@Module({
  imports: [
    SessionModule.forRoot({
      backend: "cookie",
      cookie: { secret: "x".repeat(64) },
    }),
  ],
  controllers: [AuthController],
})
class AppModule {}

const app = new Application(AppModule);
const sessions = app.container.resolve(SessionService.TOKEN) as SessionService;
app.server.app.use("*", async (c: any, next: any) => {
  const cookie = c.req.header("cookie") ?? "";
  const match = cookie.match(/sid=([^;]+)/);
  if (match) {
    try {
      const record = sessions.decodeCookie(decodeURIComponent(match[1]));
      if (record) {
        c.set("nexus", { user: record });
        c.set("session", record);
      }
    } catch { /* ignore */ }
  }
  await next();
});

const port = Number(process.env.PORT ?? 3000);
await app.listen(port);
