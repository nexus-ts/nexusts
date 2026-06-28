# 17 · Config

Type-safe env/config access with `@nexusts/config`.

## What it shows

- `ConfigModule.forRoot({ schema })` for typed env access
- Zod schema → typed `ConfigService.get(key)`
- Env-aware loading: `.env.{NODE_ENV}` auto-detected

## How to run

```bash
cd examples/17-config
bun main.ts
```

## Code

```ts
// main.ts
import "reflect-metadata";
import { z } from "zod";
import { Application, Module, Controller, Get, Inject, Injectable } from "@nexusts/core";
import { ConfigService, ConfigModule } from "@nexusts/config";

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  APP_NAME: z.string().default("my-app"),
  DEBUG: z.coerce.boolean().default(false),
  DATABASE_URL: z.string().optional(),
});

@Injectable()
@Controller("/")
class AppController {
  @Inject(ConfigService) declare private config: ConfigService;

  @Get("/info")
  info() {
    return {
      appName: this.config.get("APP_NAME"),
      debug: this.config.get("DEBUG"),
      port: this.config.get("PORT"),
    };
  }
}

@Module({
  imports: [ConfigModule.forRoot({ schema })],
  controllers: [AppController],
})
class AppModule {}

const app = new Application(AppModule);
await app.listen(3000);
```

Create a `.env` file:

```bash
# .env
APP_NAME=my-cool-app
DEBUG=true
DATABASE_URL=postgres://localhost/mydb
```

## Env priority (highest → lowest)

1. `process.env` (set in shell or runtime)
2. `.env.{NODE_ENV}` (e.g. `.env.production`)
3. `.env.local` (gitignored)
4. `.env`

## Runtime changes

```ts
config.set("FEATURE_X", true);    // updates in-memory
const all = config.all();          // snapshot
```
