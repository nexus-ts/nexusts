# Structured Logging · `@nexusts/logger`

> 한국어 버전: [`logger.ko.md`](./logger.ko.md)

`@nexusts/logger` provides structured, level-based logging with
Pino-powered transports. It pretty-prints in development, emits
compact JSON in production, and is request-scoped via
`AsyncLocalStorage` so every log inside a request automatically
includes `requestId`, `userId`, or any other context you set.

---

## Features at a glance

- **Six log levels:** `trace`, `debug`, `info`, `warn`, `error`, `fatal`
- **Structured metadata:** pass objects alongside your message
- **Pretty-print** (dev) / **JSON** (prod) — auto-detected via `NODE_ENV`
- **Request-scoped context:** every log in a request is auto-tagged
- **Child loggers:** derive scoped loggers with permanent bindings
- **Pluggable transports:** Pino, Pretty, Null, or custom
- **Silent mode:** suppress all output in tests
- **Zero-config defaults:** sensible defaults for every environment

---

## Quick start

```ts
import { Module } from '@nexusts/core';
import { LoggerModule } from '@nexusts/logger';

@Module({
  imports: [
    LoggerModule.forRoot({
      level: 'info',         // minimum level to emit
      pretty: process.env.NODE_ENV !== 'production',
      base: { service: 'my-app' },
    }),
  ],
})
export class AppModule {}
```

Import the entry point:

```ts
import { Logger, LoggerModule } from '@nexusts/logger';
```

No additional npm install is needed for production — `pino` is bundled
as a direct dependency of `@nexusts/logger`. For colorized pretty-print
output in development, optionally install `pino-pretty`.

---

## Usage in services

### Option 1: Direct instantiation (no DI)

The simplest way — no injection needed:

```ts
import { Injectable } from '@nexusts/core';
import { Logger } from '@nexusts/logger';

@Injectable()
class UserService {
  private logger = new Logger();

  async signUp(email: string) {
    this.logger.info({ email }, 'user signed up');
    // ...
  }
}
```

`Logger` internally shares a single Pino instance, so calling `new Logger()`
multiple times is lightweight. Request-scoped context (`AsyncLocalStorage`)
works automatically without injection.

### Option 2: Field injection (standard decorators)

```ts
import { Inject, Injectable } from '@nexusts/core';
import { Logger } from '@nexusts/logger';

@Injectable()
class UserService {
  @Inject(Logger.TOKEN) declare logger: Logger;

  async signUp(email: string) {
    this.logger.info({ email }, 'user signed up');
    // ...
  }
}
```

### Log methods

Every level has two call signatures:

```ts
// With structured metadata
logger.info({ userId: 42, role: 'admin' }, 'user logged in');

// Simple string-only
logger.info('server started');

// All levels follow the same pattern
logger.trace({ step: 'init' }, 'beginning');
logger.debug({ query }, 'SQL executed');
logger.info({ event: 'purchase' }, 'order placed');
logger.warn({ key: 'homepage' }, 'cache miss');
logger.error({ err, orderId: 99 }, 'payment failed');
logger.fatal({ reason: 'OOM' }, 'out of memory, shutting down');
```

---

## Configuration

### `LoggerModule.forRoot(options)`

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `level` | `LogLevel` | `'info'` (prod), `'debug'` (dev) | Minimum level to emit |
| `pretty` | `boolean` | `NODE_ENV !== 'production'` | Pretty-print output |
| `transports` | `LogTransport[]` | Auto (Pino or Pretty) | Custom transports |
| `base` | `Record<string, unknown>` | `{}` | Static fields on every record |
| `silent` | `boolean` | `false` | Suppress all output |

```ts
// Full production config
LoggerModule.forRoot({
  level: 'info',
  pretty: false,                    // JSON for log aggregators
  base: { service: 'payment-api', region: 'us-east-1' },
});

// Full development config
LoggerModule.forRoot({
  level: 'debug',
  pretty: true,                     // colorized terminal output
  base: { service: 'payment-api' },
});

// Testing — no output at all
LoggerModule.forRoot({
  silent: true,
});
```

---

## Request-scoped context

The logger uses `AsyncLocalStorage` to propagate context across
async boundaries. Every `logger.info()` call inside a `logger.with()`
block automatically merges the context into the log record.

### Basic usage

```ts
import { Logger } from '@nexusts/logger';
import { randomUUID } from 'node:crypto';

class RequestHandler {
  private logger = new Logger();

  async handle(request: Request) {
    await this.logger.with(
      { requestId: randomUUID(), userId: request.headers.get('x-user-id') ?? 'anon' },
      async () => {
        this.logger.info('processing request');     // ← tagged with requestId + userId
        // nested async calls also inherit the context
        await this.process();
      },
    );
  }

  private async process() {
    this.logger.info('inside nested call');         // ← same requestId + userId
  }
}
```

### Middleware pattern

Set up request-scoped logging in a middleware:

```ts
import { MiddlewareConsumer, Injectable, NestMiddleware } from '@nexusts/core';
import { Logger } from '@nexusts/logger';
import { randomUUID } from 'node:crypto';

@Injectable()
class RequestLoggerMiddleware implements NestMiddleware {
  private logger = new Logger();

  use(req: any, _res: any, next: () => void) {
    this.logger.with(
      {
        requestId: randomUUID(),
        method: req.method,
        url: req.url,
      },
      () => next(),
    );
  }
}
```

### Read the current context

```ts
const ctx = logger.context;
// { requestId: '...', userId: '...' }
```

---

## Child loggers

Derive a child logger that permanently attaches bindings:

```ts
class OrderService {
  private logger: Logger;

  constructor(@Inject(Logger.TOKEN) base: Logger) {
    this.logger = base.child({ service: 'order', version: 'v2' });
  }

  async createOrder(data: OrderData) {
    this.logger.info({ data }, 'creating order');
    // Output: { "service": "order", "version": "v2", "data": {...}, "msg": "creating order" }
  }
}
```

Child loggers share the same transports and `AsyncLocalStorage`
instance as the parent, so request-scoped context still applies
on top of the child's permanent bindings.

---

## Transports

### Built-in transports

| Transport | When it's used | Output |
| --------- | -------------- | ------ |
| `PinoTransport` | Production (`pretty: false`) | Compact JSON via `pino` |
| `PrettyTransport` | Development (`pretty: true`) | Colorized output via `pino-pretty` |
| `NullTransport` | Tests / silent mode | Discards every record |

Transports are auto-selected when you use the `level` / `pretty`
shortcut. You can also configure them explicitly:

```ts
import { LoggerModule, PinoTransport, PrettyTransport } from '@nexusts/logger';

LoggerModule.forRoot({
  transports: [
    new PinoTransport('info', { service: 'my-app' }),
  ],
});
```

### Custom transports

Implement the `LogTransport` interface:

```ts
import { LogTransport, LogRecord } from '@nexusts/logger';

class FileTransport implements LogTransport {
  readonly name = 'file';
  readonly isDefault = false;

  constructor(private filePath: string) {}

  write(record: LogRecord): void {
    // Write record to a file, database, external service, etc.
    // The write method is called synchronously; queue async work internally.
    const line = JSON.stringify(record) + '\n';
    // append to file …
  }
}
```

Then pass it in:

```ts
LoggerModule.forRoot({
  transports: [new FileTransport('/var/log/app.log')],
});
```

### Lazy-loaded peer dependencies

Pino is loaded lazily at runtime via dynamic `import()`. If you
use `PrettyTransport` and `pino-pretty` is not installed, the
logger falls back gracefully to plain JSON. To install the pretty-print
helper:

```bash
# For colorized output in development
bun add pino-pretty
```

pino itself is bundled with `@nexusts/logger` — no manual install needed.

---

## Silent mode (testing)

Suppress all log output during tests:

```ts
LoggerModule.forRoot({
  silent: true,
});
```

Or swap in the `NullTransport`:

```ts
import { LoggerModule, NullTransport } from '@nexusts/logger';

LoggerModule.forRoot({
  transports: [new NullTransport()],
});
```

---

## Lifecycle: `await logger.ready()`

Pino transports are initialized asynchronously. If you want to
ensure the transport is fully ready before emitting the first log
(e.g. in integration tests), call `ready()`:

```ts
@Injectable()
class AppBootstrap {
  private logger = new Logger();

  async onStart() {
    await this.logger.ready();
    this.logger.info('logger is fully initialized');
  }
}
```

In practice, the transport writes to a fallback (`console.log`)
until it's ready, so you don't need to await `ready()` in normal
application code.

---

## Examples

### Basic controller

```ts
import { Controller, Get, Inject } from '@nexusts/core';
import { Logger } from '@nexusts/logger';

@Controller('/users')
class UserController {
  private logger = new Logger();

  @Get()
  list() {
    this.logger.info({ path: '/users' }, 'listing users');
    return { users: [] };
  }
}
```

### Error logging with stack traces

```ts
try {
  await this.processOrder(orderId);
} catch (err) {
  this.logger.error(
    { err, orderId, userId: this.userId },
    'order processing failed',
  );
  throw err;
}
```

### Logging in cron jobs

```ts
import { Cron } from '@nexusts/schedule';
import { Inject } from '@nexusts/core';
import { Logger } from '@nexusts/logger';

class CleanupJob {
  private logger = new Logger();

  @Cron('0 3 * * *')
  async nightlyCleanup() {
    this.logger.info('starting nightly cleanup');
    // …
    this.logger.info('nightly cleanup complete');
  }
}
```

---

## API Reference

### `Logger` class

| Method / Property | Description |
| ----------------- | ----------- |
| `trace(meta, msg)` / `trace(msg)` | Log at `trace` level |
| `debug(meta, msg)` / `debug(msg)` | Log at `debug` level |
| `info(meta, msg)` / `info(msg)` | Log at `info` level |
| `warn(meta, msg)` / `warn(msg)` | Log at `warn` level |
| `error(meta, msg)` / `error(msg)` | Log at `error` level |
| `fatal(meta, msg)` / `fatal(msg)` | Log at `fatal` level |
| `with(context, fn)` | Run `fn` inside a request-scoped context |
| `child(bindings)` | Derive a child logger with permanent bindings |
| `ready()` | Wait for transports to initialise |
| `context` (getter) | Read the current `AsyncLocalStorage` context |
| `transports` | Array of active `LogTransport` instances |
| `silent` | Whether logging is suppressed |
| `level` | Current minimum level |
| `TOKEN` (static) | DI injection token: `Symbol.for('nexus:Logger')` |

### `LoggerModule`

| Method | Description |
| ------ | ----------- |
| `forRoot(options)` | Register the logger with global configuration |

### Types

```ts
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LoggerOptions {
  level?: LogLevel;
  pretty?: boolean;
  transports?: LogTransport[];
  base?: Record<string, unknown>;
  silent?: boolean;
}

interface LogRecord {
  level: LogLevel;
  time: number;
  msg: string;
  [key: string]: unknown;
}

interface LogTransport {
  readonly name: string;
  readonly isDefault?: boolean;
  write(record: LogRecord): void;
}

interface LogContext {
  requestId?: string;
  userId?: string;
  tenantId?: string;
  [key: string]: unknown;
}
```

---

## See also

- [`../design/logger.md`](../design/logger.md) — design document
- [`production-basics.md`](./production-basics.md) — health, config, logger, and static in one place
- [`common-pitfalls.md`](./common-pitfalls.md) — debugging recipes
- [`tracing.md`](./tracing.md) — distributed tracing from log correlation
- [`cross-cutting-features.md`](./cross-cutting-features.md) — overview of all cross-cutting modules
- [Pino documentation](https://getpino.io/) — logger backend
- [pino-pretty](https://github.com/pinojs/pino-pretty) — pretty-print transport
