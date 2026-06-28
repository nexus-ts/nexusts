# 18 · Logger

Structured JSON logs and pretty terminal output with `@nexusts/logger`.

## What it shows

- `LoggerService` injection
- `logger.info()`, `.warn()`, `.error()`, `.debug()` with metadata
- Pretty-print in dev, JSON in prod (auto-detected by `NODE_ENV`)

## How to run

```bash
cd examples/18-logger
bun main.ts
```

## Code

```ts
import "reflect-metadata";
import { Application, Module, Controller, Get, Inject, Injectable } from "@nexusts/core";
import { Logger, LoggerModule } from "@nexusts/logger";

@Injectable()
@Controller("/")
class AppController {
  @Inject(Logger.TOKEN) declare private logger: Logger;

  @Get("/log")
  log() {
    this.logger.info({ userId: 42 }, "user logged in");
    this.logger.warn({ key: "homepage" }, "cache miss");
    this.logger.error(new Error("card declined"), { orderId: 99 });
    return { ok: true };
  }
}

@Module({
  imports: [LoggerModule.forRoot({ level: "debug" })],
  controllers: [AppController],
})
class AppModule {}

const app = new Application(AppModule);
await app.listen(3000);
```

## Output (dev mode, pretty)

```
[INFO ] user logged in                      { userId: 42 }
[WARN ] cache miss                          { key: 'homepage' }
[ERROR] payment failed                      { orderId: 99, error: 'card declined' }
```

## Output (prod mode, JSON)

```json
{"level":"info","msg":"user logged in","ts":1700000000000,"meta":{"userId":42}}
```

## Transport customization

```ts
import { PinoTransport, FileTransport } from "@nexusts/logger";

LoggerModule.forRoot({
  level: "info",
  transports: [new PinoTransport()],
})
```
