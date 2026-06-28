# API Reference

> 한국어 버전: [`api-reference.ko.md`](./api-reference.ko.md)

This is a flat reference of every public export. For narrative
documentation, see the guides.

---

## `Application`

```ts
class Application {
  readonly container: ApplicationContainer;
  readonly server: NexusServer;
  readonly inertia: Inertia | null;

  constructor(rootModule: Type<any>, options?: ApplicationOptions);

  setViewAdapter(adapter: ViewAdapter): this;
  render(view: string, data?: Record<string, any>): Promise<string>;
  listen(port?: number): Promise<any>;
  get fetch(): (req: Request, env?: any, ctx?: any) => Promise<Response>;

  static bootstrap(rootModule: Type<any>, options?: ApplicationOptions): Application;
}

interface ApplicationOptions extends NexusServerOptions {
  viewAdapter?: ViewAdapter;
  inertia?: InertiaConfig;
}
```

---

## `Module`

```ts
function Module(options: ModuleOptions): ClassDecorator;

interface ModuleOptions {
  imports?: Type[];
  controllers?: Type[];
  providers?: Provider[];
  exports?: InjectionToken[];
}
```

---

## `Controller` & HTTP methods

```ts
function Controller(prefix: string): ClassDecorator;

const Get:    (path?: string) => MethodDecorator;
const Post:   (path?: string) => MethodDecorator;
const Put:    (path?: string) => MethodDecorator;
const Delete: (path?: string) => MethodDecorator;
const Patch:  (path?: string) => MethodDecorator;
const Options:(path?: string) => MethodDecorator;
const Head:   (path?: string) => MethodDecorator;
```

---

## `Injectable`, `Inject`, `Repository`

```ts
function Injectable(): ClassDecorator;
function Repository(): ClassDecorator;

function Inject<T = any>(token: InjectionToken<T>): ParameterDecorator & PropertyDecorator;
```

---

## `Global`

```ts
function Global(): ClassDecorator;
```

Marks a module as global. Its exported providers are available to all
modules without explicit import. See [DI user guide](./user-guide/dependency-injection.md#10-global-modules-global).

---

## Lifecycle Hooks

```ts
interface OnModuleInit        { onModuleInit(): Promise<void> | void; }
interface OnApplicationInit   { onApplicationInit(): Promise<void> | void; }
interface OnModuleDestroy     { onModuleDestroy(): Promise<void> | void; }
interface BeforeApplicationDestroy { beforeApplicationDestroy(signal?: string): Promise<void> | void; }
interface OnApplicationDestroy { onApplicationDestroy(signal?: string): Promise<void> | void; }
```

See [DI user guide §11](./user-guide/dependency-injection.md#11-lifecycle-hooks).

---

## Guards

```ts
function UseGuards(...guards: (Function | HttpGuard)[]): ClassDecorator & MethodDecorator;

class AuthGuard implements HttpGuard;
class RolesGuard implements HttpGuard {
  constructor(roles: string[], rolesExtractor?: (ctx: HttpExecutionContext) => string[]);
}

function createHttpGuard(
  fn: (context: HttpExecutionContext) => boolean | Promise<boolean>
): new () => HttpGuard;
```

See [Controllers user guide §12](./user-guide/controllers.md#12-guards-useguards).

---

## Interceptors

```ts
function UseInterceptors(...interceptors: (Function | Interceptor)[]): ClassDecorator & MethodDecorator;

class LoggingInterceptor implements Interceptor;
class TimeoutInterceptor implements Interceptor {
  constructor(timeoutMs: number);
}

function createInterceptor(
  fn: (ctx: ExecutionContext, next: () => Promise<unknown>) => Promise<unknown>
): new () => Interceptor;
```

See [Controllers user guide §13](./user-guide/controllers.md#13-interceptors-useinterceptors).

---

## Exception Filters & HttpException

```ts
function UseFilters(...filters: ExceptionFilter[]): ClassDecorator & MethodDecorator;

class HttpException extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message?: string);

  // Static factories
  static badRequest(msg?: string): HttpException;        // 400
  static unauthorized(msg?: string): HttpException;      // 401
  static forbidden(msg?: string): HttpException;         // 403
  static notFound(msg?: string): HttpException;          // 404
  static conflict(msg?: string): HttpException;          // 409
  static unprocessable(msg?: string): HttpException;     // 422
  static tooManyRequests(msg?: string): HttpException;   // 429
  static internalServerError(msg?: string): HttpException; // 500
  static serviceUnavailable(msg?: string): HttpException; // 503

  toJSON(): Record<string, unknown>;
}

function createExceptionFilter(
  fn: (error: unknown, ctx: HttpExecutionContext) => Response | Promise<Response>
): ExceptionFilter;
```

See [Controllers user guide §14](./user-guide/controllers.md#14-exception-filters-usefilters).

---

## Parameter decorators

```ts
const Req:     () => ParameterDecorator;
const Res:     () => ParameterDecorator;
const Next:    () => ParameterDecorator;
const Ctx:     () => ParameterDecorator;
const User:    () => ParameterDecorator;

const Body:    (key?: string) => ParameterDecorator;
const Query:   (key?: string) => ParameterDecorator;
const Param:   (key?: string) => ParameterDecorator;
const Headers: (key?: string) => ParameterDecorator;
```

---

## `Validate`

```ts
function Validate(config: ValidationConfig): MethodDecorator;

interface ValidationConfig {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  headers?: ZodSchema;
}
```

---

## DI types

```ts
type InjectionToken<T = any> = Type<T> | string | symbol;

interface Provider<T = any> {
  provide: InjectionToken<T>;
  useClass?: Type<T>;
  useValue?: T;
  useFactory?: (...args: any[]) => T | Promise<T>;
  useExisting?: InjectionToken<T>;
  scope?: 'singleton' | 'transient';
}

type ProviderScope = 'singleton' | 'transient';

class DIContainer {
  createChild(): DIContainer;
  register(providers: Provider | Provider[]): void;
  resolve<T = any>(token: InjectionToken<T>): T;
  has(token: InjectionToken): boolean;
  list(): string[];
}

class ApplicationContainer extends DIContainer {
  registerModule(moduleClass: Type, container: DIContainer): void;
}

class ModuleScanner {
  scan(rootModule: Type): { root: ScanResult; modules: ScanResult[] };
  get(moduleClass: Type): ScanResult | undefined;
}
```

---

## View adapters

```ts
interface ViewAdapter {
  readonly name: string;
  render(
    template: string,
    data: Record<string, any>,
    context?: ViewContext,
    options?: ViewOptions,
  ): Promise<string>;
  compile?(template: string, options?: ViewOptions): (data: Record<string, any>) => Promise<string>;
}

interface ViewContext {
  request?: { url?: string; method?: string; headers?: Record<string, string|string[]>; cookies?: Record<string, string> };
  response?: { cookies?: Array<{ name: string; value: string; options?: any }>; redirect?: string; status?: number };
  globals?: Record<string, any>;
}

interface ViewOptions {
  stream?: boolean;
  raw?: boolean;
  layout?: string;
}

class RenduAdapter implements ViewAdapter {
  readonly name: 'rendu';
}

class EdgeAdapter implements ViewAdapter {
  readonly name: 'edge';
}
```

---

## `Inertia`

```ts
class Inertia implements InertiaAdapter {
  static readonly TOKEN: symbol;

  constructor(config?: InertiaConfig);

  // Rendering
  render(component: string, props: Record<string, any>): InertiaResponse;
  render(component: string, deferred: Record<string, DeferredProp>, props: Record<string, any>): InertiaResponse;
  form(component: string, initialProps?: Record<string, any>): InertiaFormBuilder;

  // Navigation
  location(url: string): Response;
  redirect(url: string, status?: number): Response;     // default 302
  back(): Response;

  // Configuration
  setVersion(version: InertiaVersion): this;
  setSsrAdapter(adapter: SsrAdapter | null): this;
  setTitle(title: string): this;
  setEncryptHistory(encrypt?: boolean): this;
  setSharedProps(shared: InertiaConfig['sharedProps']): this;

  // Shared data
  share(key: string, value: any): void;
  share(values: Record<string, any>): void;
  unshare(key: string): void;
  getShared(): Record<string, any>;

  // InertiaAdapter
  title(): string;
  encryptHistory(): boolean;
  ssr(): SsrAdapter | null;
  resolveVersion(): Promise<string | undefined>;
  getSharedFor(c: Context): Promise<Record<string, any>>;
}

type InertiaVersion = string | (() => string | Promise<string>);

interface InertiaConfig {
  ssr?: SsrAdapter;
  version?: InertiaVersion;
  encryptHistory?: boolean;
  title?: string;
  sharedProps?: Record<string, any> | (() => Record<string, any> | Promise<Record<string, any>>);
}
```

### Lazy helpers

```ts
function defer<T>(fn: () => T | Promise<T>, group?: string): DeferredProp<T>;
function always<T>(fn: () => T | Promise<T>): AlwaysProp<T>;
function optional<T>(fn: () => T | Promise<T>, threshold?: number): OptionalProp<T>;
function merge<T>(fn: () => T | Promise<T>, matchPropsOn?: string[][]): MergeProp<T>;
function deepMerge<T>(fn: () => T | Promise<T>): DeepMergeProp<T>;
function once<T>(fn: () => T | Promise<T>): OnceProp<T>;
function lazy<T>(fn: () => T | Promise<T>, tag?: string): LazyProp<T>;

class DeferredProp<T> { readonly __inertiaKind = 'deferred'; readonly group: string; resolve(): T | Promise<T>; }
class AlwaysProp<T>   { readonly __inertiaKind = 'always'; resolve(): T | Promise<T>; }
class OptionalProp<T> { readonly __inertiaKind = 'optional'; readonly threshold: number; resolve(): T | Promise<T>; }
class MergeProp<T>    { readonly __inertiaKind = 'merge'; readonly matchPropsOn: string[][]; resolve(): T | Promise<T>; }
class DeepMergeProp<T>{ readonly __inertiaKind = 'deepMerge'; resolve(): T | Promise<T>; }
class OnceProp<T>     { readonly __inertiaKind = 'once'; resolve(): T | Promise<T>; }
class LazyProp<T>     { readonly __inertiaKind = 'lazy'; readonly tag: string; invocations: number; resolve(): T | Promise<T>; }

function isInertiaHelper(value: unknown): value is InertiaHelper;
```

### `<Form>` helper

```ts
class InertiaFormBuilder {
  withProps(props: Record<string, any>): this;
  with(key: string, value: any): this;
  withErrors(errors: Record<string, string | string[]>): this;
  withError(field: string, message: string): this;
  withErrorBag(name: string): this;
  withValues(values: Record<string, any>): this;
  render(): InertiaResponse;
  redirect(url: string): Response;
  back(to?: string): Response;
}

const INERTIA_RESPONSE_TAG: unique symbol;

function inertiaFormMiddleware(options?: FormMiddlewareOptions): MiddlewareHandler;

interface FormMiddlewareOptions {
  validateCsrf?: boolean;     // default true
  csrfHeader?: string;        // default 'X-CSRF-Token'
  csrfField?: string;         // default '_token'
  csrfSharedKey?: string;     // default 'csrfToken'
}
```

### SSR adapters

```ts
interface SsrAdapter {
  readonly name: string;
  render(component: string, props: Record<string, any>): Promise<SsrRenderResult>;
  head?(): Promise<string[]> | string[];
}

interface SsrRenderResult {
  html: string;
  head?: string[];
  data?: Record<string, any>;
}

class ComponentRegistry {
  register(name: string, component: any): this;
}

function createReactAdapter(opts: { components: ComponentRegistry }): SsrAdapter;
function createVueAdapter(opts:   { components: ComponentRegistry }): SsrAdapter;
function createSvelteAdapter(opts:{ components: ComponentRegistry }): SsrAdapter;
function createSolidAdapter(opts: { components: ComponentRegistry }): SsrAdapter;
```

---

## `@nexusts/auth` (`better-auth`)

```ts
import {
  AuthModule, AuthService, AuthController,
  CurrentUser, authMiddleware,
} from '@nexusts/auth';

class AuthModule {
  static forRoot(config: AuthConfig): Type;
}

class AuthService {
  static readonly TOKEN: symbol;
  signIn(email: string, password: string): Promise<Session>;
  signOut(sessionId: string): Promise<void>;
  getUser(id: string): Promise<User | null>;
  // wraps better-auth — extend via the underlying client
}

function CurrentUser(options?: { required?: boolean }): ParameterDecorator;

function authMiddleware(options?: { required?: boolean }): HonoMiddleware;
```

---

## `@nexusts/queue`

```ts
import {
  QueueModule, QueueService,
  MemoryQueueBackend, BullMQBackend, CloudflareQueueBackend,
  OnQueueReady,
} from '@nexusts/queue';

class QueueModule { static forRoot(config: QueueConfig): Type; }
class QueueService {
  static readonly TOKEN: symbol;
  add<T>(name: string, data: T, options?: AddOptions): Promise<AddedJob>;
  addBatch(jobs: Array<{ name: string; data: any; options?: AddOptions }>): Promise<AddedJob[]>;
  process<T>(name: string, handler: JobHandler<T>): Promise<WorkerHandle>;
  on(listener: QueueEventListener): () => void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

function OnQueueReady(name: string): MethodDecorator;
```

---

## `@nexusts/schedule`

```ts
import {
  ScheduleModule, ScheduleService,
  Cron, Interval, Timeout,
  durationToMs, // '1s' | '1m' | '1h' | '1d' | number -> ms
} from '@nexusts/schedule';

class ScheduleModule { static forRoot(config?: ScheduleConfig): Type; }
class ScheduleService {
  static readonly TOKEN: symbol;
  register(name: string, cron: string, fn: () => Promise<any> | any): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  list(): RegisteredTask[];
}

function Cron(expression: string): MethodDecorator;
function Interval(ms: number): MethodDecorator;
function Timeout(ms: number): MethodDecorator;
```

---

## `@nexusts/events`

```ts
import {
  EventsModule, EventsService,
  NexusEventEmitter, OnEvent,
} from '@nexusts/events';

class EventsModule { static forRoot(): Type; }
class EventsService extends NexusEventEmitter {
  static readonly TOKEN: symbol;
  emit(event: string, payload?: any): Promise<void>;
  on(pattern: string, listener: (payload: any) => void | Promise<void>): () => void;
  onAny(listener: (event: string, payload: any) => void | Promise<void>): () => void;
}

function OnEvent(pattern: string, opts?: { priority?: number; guard?: (payload: any) => boolean }): MethodDecorator;
```

---

## `@nexusts/session`

```ts
import {
  SessionModule, SessionService,
  MemorySessionStorage, CookieSessionStorage, DrizzleSessionStorage,
  RedisSessionStorage, CloudflareKVSessionStorage,
  type RedisSessionStorageConfig,
  Session,
} from '@nexusts/session';

class SessionModule { static forRoot(config: SessionConfig): Type; }
class SessionService {
  static readonly TOKEN: symbol;
  create<T = SessionData>(opts?: CreateSessionOptions<T>): Promise<SessionRecord<T>>;
  read(id: string): Promise<SessionRecord | null>;
  readMany(query?: SessionQuery): Promise<SessionRecord[]>;
  update<T = SessionData>(id: string, opts: UpdateSessionOptions<T>): Promise<SessionRecord<T> | null>;
  destroy(id: string, reason?: 'logout' | 'expired' | 'admin' | 'unknown'): Promise<boolean>;
  rotate(id: string): Promise<SessionRecord | null>;
  gc(): Promise<number>;
  on(listener: SessionEventListener): () => void;
}

function Session(options?: { required?: boolean }): ParameterDecorator;
```

---

## `@nexusts/health`

```ts
import {
  HealthModule, HealthCheckService, HealthController,
  MemoryHealthIndicator, DiskHealthIndicator, HttpHealthIndicator,
  DrizzleHealthIndicator, CustomPingIndicator,
} from '@nexusts/health';

class HealthModule { static forRoot(config?: HealthConfig): Type; }
class HealthCheckService {
  static readonly TOKEN: symbol;
  register(indicator: HealthIndicator): void;
  unregister(name: string): boolean;
  list(): string[];
  check(kind?: 'liveness' | 'readiness' | 'startup'): Promise<HealthCheckResult>;
}
```

---

## `@nexusts/config`

```ts
import { ConfigModule, ConfigService } from '@nexusts/config';

class ConfigModule { static forRoot(config: ConfigConfig): Type; }
class ConfigService<S extends ZodSchema> {
  static readonly TOKEN: symbol;
  get<K extends keyof InferConfig<S>>(key: K): InferConfig<S>[K];
  get<K extends string>(key: K, opts: { default: any }): any;
  require<K extends keyof InferConfig<S>>(key: K): InferConfig<S>[K];
  env(key: string): string | undefined;
  reload(): Promise<void>;
}
```

---

## `@nexusts/logger`

```ts
import { LoggerModule, Logger, NullTransport, PrettyTransport, PinoTransport } from '@nexusts/logger';

class LoggerModule { static forRoot(options?: LoggerOptions): Type; }
class Logger {
  static readonly TOKEN: symbol;
  trace(msg: string, ctx?: object): void;
  debug(msg: string, ctx?: object): void;
  info(msg: string, ctx?: object): void;
  warn(msg: string, ctx?: object): void;
  error(msg: string, ctx?: object): void;
  fatal(msg: string, ctx?: object): void;
  with(ctx: object, fn: () => Promise<any>): Promise<any>;
  child(ctx: object): Logger;
  attachLogger(fn: (q: string, p: unknown[]) => void): void;
}
```

---

## `@nexusts/static`

```ts
import { StaticModule, StaticService, ServeStaticOptions } from '@nexusts/static';

class StaticModule { static forRoot(config: ServeStaticOptions): Type; }
class StaticService {
  static readonly TOKEN: symbol;
  middleware(): HonoMiddleware;
}
```

---

## `@nexusts/limiter`

```ts
import {
  LimiterModule, LimiterService, LimiterMiddleware,
  MemoryRateLimitStorage, DrizzleRateLimitStorage,
  RateLimit, durationToMs,
} from '@nexusts/limiter';

class LimiterModule { static forRoot(config?: LimiterConfig): Type; }
class LimiterService {
  static readonly TOKEN: symbol;
  rules: RateLimitRule[];
  check(key: string, rule: RateLimitRule): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

function RateLimit(rule: RateLimitRule): MethodDecorator;
```

---

## `@nexusts/shield`

```ts
import { ShieldModule, ShieldService, CsrfGuard, HeadersGuard } from '@nexusts/shield';

class ShieldModule { static forRoot(config?: ShieldConfig): Type; }
class ShieldService {
  static readonly TOKEN: symbol;
  middleware(): HonoMiddleware;
  issueToken(headers: Headers): { token: string; html: string };
}
```

---

## `@nexusts/cache`

```ts
import {
  CacheModule, CacheService,
  MemoryStore, DrizzleCacheStore,
  Cacheable, CacheInvalidate,
} from '@nexusts/cache';

class CacheModule { static forRoot(config?: CacheConfig): Type; }
class CacheService {
  static readonly TOKEN: symbol;
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(pattern?: string): Promise<number>;
  wrap<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T>;
  invalidateByTag(tag: string): Promise<number>;
  gc(): Promise<number>;
  applyDecorators(instance: any): void;
}

function Cacheable(prefix: string, keyFn: (...args: any[]) => string, ttlSeconds?: number): MethodDecorator;
function CacheInvalidate(prefix: string, keyFn: (...args: any[]) => string): MethodDecorator;
```

---

## `@nexusts/drive`

```ts
import {
  DriveModule, DriveService,
  MemoryDriver, LocalDriver, S3Driver,
} from '@nexusts/drive';

class DriveModule { static forRoot(config?: DriveConfig): Type; }
class DriveService {
  static readonly TOKEN: symbol;
  driver: StorageDriver;
  put(key: string, body: FileContent, opts?: PutOptions): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  head(key: string): Promise<FileMetadata>;
  list(opts?: ListOptions): Promise<ListResult>;
  getSignedUrl(key: string, opts?: SignedUrlOptions): Promise<string>;
  copy(src: string, dest: string): Promise<void>;
  move(src: string, dest: string): Promise<void>;
}
```

---

## `@nexusts/mail`

```ts
import {
  MailModule, MailService,
  NullTransport, FileTransport, SmtpTransport,
} from '@nexusts/mail';

class MailModule { static forRoot(config?: MailConfig): Type; }
class MailService {
  static readonly TOKEN: symbol;
  send(msg: MailMessage): Promise<MailSendResult>;
  sendBatch(msg: Omit<MailMessage, 'to'>, recipients: string[]): Promise<MailSendResult[]>;
  renderMjml(template: string, vars?: Record<string, unknown>): Promise<string>;
}
```

---

## `@nexusts/drizzle` (default ORM)

```ts
import {
  DrizzleModule, DrizzleService,
  DrizzleModel, DrizzleRepository,
  Table, Column, PrimaryKey,
  resolveDriver, postgresDriver, mysqlDriver, sqliteDriver, bunSqliteDriver, d1Driver,
  RawQuery,
  Entity, getEntityTable,
  generateMigrations, pushSchema,
  // drizzle-orm operators (re-exported for convenience)
  eq, ne, gt, gte, lt, lte,
  and, or, not,
  like, ilike, notLike, notIlike,
  inArray, notInArray,
  isNull, isNotNull,
  between, notBetween,
  count, sum, avg, min, max,
  sql, asc, desc,
  relations,
} from '@nexusts/drizzle';

// Validation schemas (subpath import)
import { createSelectSchema, createInsertSchema, createUpdateSchema }
  from '@nexusts/drizzle/validation';

class DrizzleModule { static forRoot(config: DrizzleConfig): Type; }
class DrizzleService {
  static readonly TOKEN: symbol;
  dialect: string;
  client: any;  // the underlying Drizzle client (type depends on dialect)

  open(): Promise<void>;
  close(): Promise<void>;

  // Drizzle passthroughs (typed via dialect-specific generics)
  select(): any;
  insert(table: any): any;
  update(table: any): any;
  delete(table: any): any;

  // ACID transactions
  transaction<T>(fn: (tx: DrizzleService) => Promise<T>): Promise<T>;

  // SQL-injection-safe raw queries
  raw: (strings: TemplateStringsArray, ...values: unknown[]) => RawQuery;
  rawQuery<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;

  // Migrations
  migrate(folder: string): Promise<MigrateResult>;
  appliedMigrations(): Promise<MigrationRecord[]>;
}

class DrizzleRepository<TTable = any, TRow = Record<string, unknown>> {
  constructor(db: DrizzleService, table: TTable);
  findAll(opts?: FindAllOptions): Promise<TRow[]>;
  findOne(where: any): Promise<TRow | undefined>;
  create(values: Partial<TRow> | Array<Partial<TRow>>): Promise<TRow | TRow[]>;
  update(where: any, patch: Partial<TRow>): Promise<TRow[]>;
  delete(where: any): Promise<number>;
  transaction<T>(fn: (tx: DrizzleRepository<TTable, TRow>) => Promise<T>): Promise<T>;
}

function Table(name: string): ClassDecorator;
function Column(opts?: Partial<ColumnMetadata>): PropertyDecorator;
function PrimaryKey(opts?: Partial<ColumnMetadata>): PropertyDecorator;

function Entity<TTable>(table: TTable): ClassDecorator;
function getEntityTable(target: Function): any | undefined;

function generateMigrations(opts?: { schema?: string | string[]; out?: string; dialect?: string }): Promise<void>;
function pushSchema(opts?: { schema?: string | string[]; dialect?: string; url?: string }): Promise<void>;

// Subpath: @nexusts/drizzle/validation
function createSelectSchema(table: any): ZodObject;
function createInsertSchema(table: any): ZodObject;
function createUpdateSchema(table: any): ZodObject;
```

### Drizzle dialects (5 supported)

```ts
type DrizzleDialect = 'postgres' | 'mysql' | 'sqlite' | 'd1';
```

| Dialect | Driver | Optional peer dep |
| ------- | ------ | ----------------- |
| `postgres` | `postgres.js` (default) → `pg` fallback | `postgres` or `pg` |
| `mysql` | `mysql2` | `mysql2` |
| 'sqlite' | `better-sqlite3` | `better-sqlite3` |
| `sqlite` | `bun:sqlite` (built-in) | none (Bun only) |
| `d1` | Cloudflare D1 binding | none (Workers only) |

See [user-guide/drizzle.md](./user-guide/drizzle.md) for the full guide.

---

## `@nexusts/openapi` (v0.4)

```ts
import { OpenAPIService, OpenAPIModule } from "@nexusts/openapi";
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiProperty, ApiSchema } from "@nexusts/openapi";

@Module({
  imports: [OpenAPIModule.forRoot({ title: "My App", version: "1.0.0", path: "/docs" })],
})
class AppModule {}

// Decorators auto-derive from @Validate Zod schemas
@Controller("/users")
@ApiTags("Users")
class UserController {
  @Get("/:id")
  @ApiOperation({ summary: "Find a user" })
  @ApiResponse(200, { schema: UserSchema })
  findById(@Param("id") id: number) { /* ... */ }
}

// GET /openapi.json  — OpenAPI 3.1 spec
// GET /docs         — Scalar UI
```

See [user-guide/openapi.md](./user-guide/openapi.md).

---

## `@nexusts/upload` (v0.4)

```ts
import { UploadService, UploadModule, Upload, UploadedFile, UploadedFiles } from "@nexusts/upload";

@Module({
  imports: [UploadModule.forRoot({ maxFileSize: 10 * 1024 * 1024, allowedMimeTypes: ["image/*"] })],
})
class AppModule {}

@Controller("/users")
class UserController {
  @Post("/avatar")
  @Upload("avatar", { maxFiles: 1, required: true })
  uploadAvatar(@UploadedFile("avatar") file: UploadedFile) {
    return { url: `/files/${(file as any).storedKey}` };
  }
}
```

See [user-guide/upload.md](./user-guide/upload.md).

---

## `@nexusts/sse` (v0.4)

```ts
import { sse, SseStream, getLastEventId } from "@nexusts/sse";

@Controller("/events")
class EventController {
  @Get("/")
  events(@Req() c: any) {
    return sse(c, (stream) => {
      const t = setInterval(() => stream.send({ event: "tick", data: Date.now() }), 1000);
      stream.onClose(() => clearInterval(t));
    });
  }
}
```

`SseStream` guarantees that every `send()` before `close()` reaches
the client (pending writes are awaited on close).

See [user-guide/sse.md](./user-guide/sse.md).

---

## `@nexusts/tracing` (v0.4)

```ts
import { TracingService, TracingModule, Trace, withSpan } from "@nexusts/tracing";

@Module({
  imports: [TracingModule.forRoot({
    serviceName: "my-app",
    exporter: "otlp-http",
    endpoint: "http://otel-collector:4318",
    sampleRatio: 0.1,
  })],
})
class AppModule {}

class UserService {
  @Trace()                       // span name = "UserService.findById"
  findById(id: string) { /* ... */ }

  @Trace("user.lookup", { attributes: { cache: "lru" } })
  async lookup(name: string) { /* ... */ }
}

await withSpan("nightly.cleanup", async (span) => {
  span.setAttribute("target", "sessions");
  await cleanupSessions();
});
```

`@opentelemetry/api` is the only required dependency. The SDK
packages are optional peer deps.

See [user-guide/tracing.md](./user-guide/tracing.md).

---

## `@nexusts/metrics` (v0.4)

```ts
import { MetricsService, MetricsModule, Counted, Timed } from "@nexusts/metrics";

@Module({
  imports: [MetricsModule.forRoot({ path: "/metrics", enableDefaultMetrics: true })],
})
class AppModule {}

@Injectable()
class UserService {
  constructor(private metrics: MetricsService) {
    this.requests = this.metrics.counter({
      name: "user_requests_total",
      labelNames: ["method", "status"],
    });
    this.duration = this.metrics.histogram({
      name: "user_request_duration_seconds",
      labelNames: ["method"],
    });
  }

  @Counted("user_requests_total", { labels: () => ({ method: "GET" }) })
  @Timed("user_request_duration_seconds", { labels: () => ({ method: "GET" }) })
  async findById(id: string) { /* ... */ }
}
```

`GET /metrics` returns Prometheus 0.0.4 (or OpenMetrics 1.0.0 if
the client requests it). Default Bun process metrics are
registered automatically.

See [user-guide/metrics.md](./user-guide/metrics.md).

---

## `@nexusts/redis` (v0.5)

```ts
import { createRedisClient, RedisModule, REDIS_CLIENT_TOKEN } from "@nexusts/redis";

// Auto-detect runtime adapter
const redis = createRedisClient({ url: "redis://localhost:6379" });
await redis.set("user:42", "alice", { ex: 60 });

// Used internally by session / cache backends.
@Module({ imports: [RedisModule.forRoot({ adapter: "bun" })] })
class AppModule {}
```

Three runtime adapters:

- `bun` — uses `Bun.redis` (built-in, no extra dep)
- `node` — uses `ioredis` (Bun native Redis planned)
- `cloudflare` — uses Workers KV (no dep; for Cloudflare Workers)
- `memory` — in-process (for tests / single-process dev)

See [user-guide/redis.md](./user-guide/redis.md).

---

## `@nexusts/i18n` (v0.5)

```ts
import { I18nModule, I18nService, I18N_SERVICE_TOKEN, i18nMiddleware, CurrentLocale } from "@nexusts/i18n";

@Module({
  imports: [I18nModule.forRoot({
    defaultLocale: "en",
    messages: { en: { hello: "Hello, :name!" }, ko: { hello: "안녕하세요, :name님!" } },
  })],
})
class AppModule {}

const svc = new I18nService({ messages: { en: { hi: "hi" } } });
svc.t("hi");                                          // → "hi" (default)
svc.t("hi", undefined, "ko");                          // → (or default fallback)
svc.t("items", { count: 5 });                          // pluralization

svc.formatDate(new Date());
svc.formatCurrency(1234.56, { currency: "USD" });
svc.formatNumber(1234.56, { locale: "de-DE" });

app.use("*", i18nMiddleware(svc));  // sets c.var.locale

class Ctrl {
  @Get("/")
  index(@CurrentLocale() locale: string) { return { locale }; }
}
```

Pluralization uses `|` separator with `Intl.PluralRules`. Date /
number / currency formatting uses the built-in `Intl` API.

See [user-guide/i18n.md](./user-guide/i18n.md).

---

## `@nexusts/crypto` (v0.5)

```ts
import { CryptoModule, EncryptionService, HashService } from "@nexusts/crypto";

@Module({ imports: [CryptoModule.forRoot({ key: process.env.APP_KEY! })] })
class AppModule {}

// Symmetric encryption
const enc = new EncryptionService(key);
const ciphertext = enc.encrypt("secret", { expiresAt: 60 * 60, purpose: "session" });
const plain = enc.decrypt<string>(ciphertext);

// HMAC sign / unsign
const signed = enc.sign("userId=42", "api-token");
const value = enc.unsign(signed, "api-token");

// Password hashing (scrypt default)
const hash = new HashService();
const stored = await hash.hash("hunter2");
const ok = await hash.verify(stored, "hunter2");
const needsUpgrade = hash.needsRehash(stored);
```

`EncryptionService` uses AES-256-GCM with HKDF-derived AES + HMAC
keys. `HashService` defaults to scrypt; argon2 is available via the
optional `@node-rs/argon2` peer.

See [user-guide/crypto.md](./user-guide/crypto.md).

---

## `@nexusts/ws` (v0.5)

```ts
import { WebSocketModule, WebSocketService, WebSocketGateway, OnWebSocketOpen, OnWebSocketMessage, OnWebSocketClose, WEBSOCKET_SERVICE_TOKEN, BunWsAdapter, NodeWsAdapter } from "@nexusts/ws";

@Injectable()
@WebSocketGateway("/ws")
class ChatGateway {
  @Inject(WEBSOCKET_SERVICE_TOKEN) declare private ws: WebSocketService;

  @OnWebSocketOpen()
  onOpen(client: WebSocketClient) { this.ws.joinRoom(client, "lobby"); }
  @OnWebSocketMessage()
  onMessage(client: WebSocketClient, data: { text: string }) {
    this.ws.broadcastToRoom("lobby", { user: client.id, text: data.text });
  }
  @OnWebSocketClose()
  onClose(client: WebSocketClient) { this.ws.leaveAllRooms(client); }
}

@Module({ imports: [WebSocketModule.forRoot({ gateways: [ChatGateway] })] })
class AppModule {}

// Bun
const adapter = new BunWsAdapter(service);
const { websocket } = await adapter.install(app, [ChatGateway]);
Bun.serve({ port: 3000, fetch: app.fetch, websocket });

// Bun (primary)
const adapter = new BunWsAdapter(service);
const { handleUpgrade } = await adapter.bind([ChatGateway]);
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => handleUpgrade(req, socket, head));
```

See [user-guide/ws.md](./user-guide/ws.md).

---

## `@nexusts/grpc` (v0.6)

```ts
import { GrpcModule, GrpcService, GrpcService as GrpcServiceDecorator, GrpcMethod, GRPC_SERVICE_TOKEN } from "@nexusts/grpc";
import { Inject, Injectable, Module } from "@nexusts/core";

@Injectable()
@GrpcServiceDecorator("UserService")
class UserServiceImpl {
  @GrpcMethod("FindById")
  async findById(req: { id: number }) { return { name: "Alice", email: "a@x.io" }; }
}

@Module({
  imports: [GrpcModule.forRoot({
    protoPath: "./proto/user.proto",
    services: [UserServiceImpl],
    port: 50051,
  })],
})
class AppModule {}

const app = new Application(AppModule);
const grpc = app.container.resolve(GrpcService);
grpc.setResolver((t) => app.container.resolve(t as any));
await grpc.start();   // binds to 0.0.0.0:50051

// Typed client (camelCase: FindById → findById)
type UserClient = { findById(req: { id: number }): Promise<{ name: string; email: string }> };
const users = grpc.client<UserClient>("UserService", { url: "internal:50051" });
const u = await users.findById({ id: 1 });

await grpc.stop();  // graceful shutdown (1s timeout, then force)
```

Optional peer deps: `@grpc/grpc-js` (^1.10), `@grpc/proto-loader` (^0.7).
Install only if you use the gRPC module.

See [user-guide/grpc.md](./user-guide/grpc.md).

---

## Request-scoped DI (v0.4)

```ts
import { Inject, Injectable, REQUEST, getRequest, getRequestScope } from "@nexusts/core";

@Injectable({ scope: "request" })
class RequestContext {
  id = crypto.randomUUID();
  userId: string | null = null;
  @Inject(REQUEST) declare req: any;
  constructor() { /* ... */ }
}

@Injectable()
class AuditService {
  // Same RequestContext instance shared across every consumer
  // in this request, including deep in the call tree.
  @Inject(RequestContext) declare ctx: RequestContext;

  log(event: string) { console.log(`[${this.ctx.id}] ${event}`); }
}

// Deep in the call tree (no DI plumbing):
function audit() {
  const ctx = getRequestScope();
  if (!ctx) return;
  // ...
}
```

The framework installs a Hono middleware that activates a
per-request scope via `AsyncLocalStorage` automatically.

See [user-guide/request-scope.md](./user-guide/request-scope.md).

---

## `@nexusts/cli` (`nx`)

```ts
import { commands, findCommand } from "@nexusts/cli";

// 18 commands (v0.3, unchanged in v0.4):
  // (unchanged in v0.4)


```ts
import { commands, findCommand } from '@nexusts/cli';

// 20 commands (v0.4 + v0.5):
//   new, init, make:crud, make:controller, make:service, make:module,
//   make:model, make:migration, make:middleware, make:validator,
//   make:auth, make:queue, make:schedule, make:listener, make:session,
//   db:migrate (alias: migrate), db:seed (alias: seed),
//   route:list, info
```

CLI usage (from a project):

```bash
nx init --orm drizzle --db postgres      # initialise nx.config.ts + drizzle.config.ts
nx make:model User --columns 'email:text,age:int' --dialect postgres
nx make:migration create_users_table --dialect postgres
nx db:migrate                            # apply pending migrations (alias: nx migrate)
nx db:migrate --status                   # show applied migrations
nx db:migrate --generate "add_email_to_users"
nx db:seed                                # run all seeds in db/seeds/
nx db:seed --create users                 # scaffold a new seed file
nx db:seed --file 01_users                # run a single seed
nx db:seed --reset                        # truncate all tables, then seed
nx route:list                             # list registered routes
nx repl                                   # interactive REPL with services
nx info                                   # show resolved config
```

See [user-guide/cli.md](./user-guide/cli.md) for the full guide.

---

## Constants & types

```ts
const METADATA_KEY: {
  MODULE:    string;
  CONTROLLER:string;
  ROUTES:    string;
  PARAMS:    string;
  INJECTABLE:string;
  REPOSITORY:string;
};

const PARAM_TYPES: {
  REQUEST:   number;
  RESPONSE:  number;
  NEXT:      number;
  BODY:      number;
  QUERY:     number;
  PARAM:     number;
  HEADERS:   number;
  CTX:       number;
  USER:      number;
};

const HTTP_METHODS: readonly HttpMethod[];

type MetadataKey = typeof METADATA_KEY[keyof typeof METADATA_KEY];
type ParamType   = typeof PARAM_TYPES[keyof typeof PARAM_TYPES];
```

---

## Runtime adapters

```ts
function detectRuntime(): 'bun' | 'cloudflare';

class BunRuntime       { serve(handler: (req: Request) => Promise<Response>, options?: { port?: number }): unknown; }
class BunRuntime      { serve(handler: (req: Request) => Promise<Response>, options?: { port?: number }): unknown; }
class CloudflareRuntime{ fetch: (req: Request, env?: any, ctx?: any) => Promise<Response>; }
```

---

## ORM (Drizzle)

The full Drizzle integration lives in `@nexusts/drizzle`. See the
[user guide](./user-guide/drizzle.md) and the [Drizzle section
above](#nexusdrizzle-default-orm).

```ts
import {
  DrizzleModule, DrizzleService,
  DrizzleRepository, DrizzleModel,
  Table, Column, PrimaryKey,
} from '@nexusts/drizzle';

class DrizzleModule { static forRoot(config: DrizzleConfig): Type; }
// ... see full API above
```

Quick example:

```ts
const db = new DrizzleService({
  dialect: 'postgres',
  connection: { url: process.env.DATABASE_URL! },
});
await db.open();

const user = await db
  .select()
  .from(users)
  .where(eq(users.id, 42))
  .get();

const rows = await db.raw`SELECT * FROM users WHERE email = ${email}`.all();
```

---

## See also

- [Getting started](./user-guide/getting-started.md)
- [Controllers & decorators](./user-guide/controllers.md)
- [Dependency injection](./user-guide/dependency-injection.md)
- [Validation](./user-guide/validation.md)
- [View engines](./user-guide/view-engines.md)
- [Inertia.js adapter](./user-guide/inertia.md)
- [Runtime & deployment](./user-guide/runtime-deployment.md)
- [Production basics (health / config / logger / static)](./user-guide/production-basics.md)
- [Cross-cutting features (limiter / shield / cache / drive / mail)](./user-guide/cross-cutting-features.md)
- [Drizzle ORM (default)](./user-guide/drizzle.md)
- [CLI (`nx` command runner)](./user-guide/cli.md)
- [gRPC (server + typed client)](./user-guide/grpc.md)
- [Testing the published package](./user-guide/testing-published-package.md)
- [Changelog](../CHANGELOG.md)
