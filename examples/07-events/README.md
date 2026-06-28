# 07 · Events

Type-safe event emitter with wildcards, priorities, and guard conditions.

## What it shows

- `EventService.forRoot()` for DI
- `@OnEvent('pattern')` decorator on listener methods
- Wildcards: `user.*` (single segment) and `user.**` (multi segment)
- `priority` (lower runs first), `if` predicate, `once` flag

## How to run

```bash
cd examples/07-events
bun main.ts
```

Then:

```bash
# Emit a single event
curl -X POST http://localhost:3000/emit/user.created

# Emit multiple via a wildcard match
curl -X POST http://localhost:3000/emit-all/user

# List current listeners
curl http://localhost:3000/listeners
```

## Code

```ts
// main.ts
import "reflect-metadata";
import { Application, Controller, Get, Post, Body, Module, Inject, Injectable } from "@nexusts/core";
import { EventService, OnEvent } from "@nexusts/events";

@Injectable()
class UserListener {
  // Exact match — runs first (priority 1)
  @OnEvent("user.created", { priority: 1 })
  onUserCreated(payload: { id: string; email: string }) {
    console.log("[1] user.created:", payload);
  }

  // Wildcard — runs on any user.* event
  @OnEvent("user.*", { priority: 5 })
  onAnyUserEvent(payload: any) {
    console.log("[5] user.*:", payload);
  }

  // Conditional listener — only fires if payload.email includes '@'
  @OnEvent("user.*", { priority: 10, if: (p: any) => p?.email?.includes("@") })
  onValidEmail(payload: any) {
    console.log("[10] valid email:", payload.email);
  }
}

@Controller("/")
class EventController {
  @Inject(EventService) declare private events: EventService;

  @Post("/emit/:type")
  async emit(@Body() body: any, @Param() params: any) {
    const event = `${params.type}.created`;
    const results = await this.events.emit(event, body);
    return { event, results };
  }

  @Get("/listeners")
  listeners() {
    return this.events.eventNames();
  }
}

@Module({
  imports: [EventService.forRoot()],
  controllers: [EventController],
  providers: [UserListener],
})
class AppModule {}

const app = new Application(AppModule);
await app.listen(3000);
```

## Wildcards

| Pattern | Matches |
|---------|---------|
| `user.created` | exactly `user.created` |
| `user.*` | `user.created`, `user.deleted` — but not `user.profile.changed` |
| `user.**` | `user.created`, `user.profile.changed` — any depth |

## Priority

Listeners with **lower** priority run first. Same priority = registration order.

## Guards (`if`)

```ts
@OnEvent("user.*", { if: (payload) => payload.email?.endsWith("@admin.com") })
adminEvent(payload: any) { ... }
```

The listener is skipped if `if()` returns `false` or a Promise resolving to `false`.

## One-shot

```ts
@OnEvent("user.welcome", { once: true })
welcomeOnce(payload: any) { ... }   // runs once then auto-removed
```
