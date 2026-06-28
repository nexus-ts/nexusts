# API 레퍼런스

> English version: [`api-reference.md`](./api-reference.md)

이 문서는 모든 공개 export의 평면 참조입니다. 서사적 문서는 가이드를 참조하세요.

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

## `Controller` & HTTP 메서드

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

## 파라미터 데코레이터

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

## DI 타입

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

## 뷰 어댑터

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

  // 렌더링
  render(component: string, props: Record<string, any>): InertiaResponse;
  render(component: string, deferred: Record<string, DeferredProp>, props: Record<string, any>): InertiaResponse;
  form(component: string, initialProps?: Record<string, any>): InertiaFormBuilder;

  // 네비게이션
  location(url: string): Response;
  redirect(url: string, status?: number): Response;     // 기본값 302
  back(): Response;

  // 설정
  setVersion(version: InertiaVersion): this;
  setSsrAdapter(adapter: SsrAdapter | null): this;
  setTitle(title: string): this;
  setEncryptHistory(encrypt?: boolean): this;
  setSharedProps(shared: InertiaConfig['sharedProps']): this;

  // 공유 데이터
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

### 지연 헬퍼

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

### `<Form>` 헬퍼

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
  validateCsrf?: boolean;     // 기본값 true
  csrfHeader?: string;        // 기본값 'X-CSRF-Token'
  csrfField?: string;         // 기본값 '_token'
  csrfSharedKey?: string;     // 기본값 'csrfToken'
}
```

### SSR 어댑터

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

## 라우터 (raw API)

```ts
class Router {
  // Adonis 스타일
  add(method: HttpMethod, path: string, controller: Type, methodName: string): void;

  // Functional 스타일
  raw(method: HttpMethod, path: string, handler: HonoHandler): void;

  // 데코레이터 기반
  registerController(controller: Type, container: DIContainer): void;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
```

---

## 상수 & 타입

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

## 런타임 어댑터

```ts
function detectRuntime(): 'bun' | 'cloudflare';

class BunRuntime       { serve(handler: (req: Request) => Promise<Response>, options?: { port?: number }): unknown; }
class BunRuntime      { serve(handler: (req: Request) => Promise<Response>, options?: { port?: number }): unknown; }
class CloudflareRuntime{ fetch: (req: Request, env?: any, ctx?: any) => Promise<Response>; }
```

---

## ORM (Drizzle 어댑터)

```ts
interface DrizzleAdapterConfig {
  schema: Record<string, any>;
  driver: 'sqlite' | 'postgres' | 'mysql';
}

class DrizzleAdapter {
  constructor(config: DrizzleAdapterConfig);
  // underlying drizzle 인스턴스를 쿼리에 노출.
}
```

---

## `@nexusts/openapi` (v0.4)

```ts
import { OpenAPIService, OpenAPIModule } from "@nexusts/openapi";
import { ApiTags, ApiOperation, ApiResponse } from "@nexusts/openapi";

@Module({
  imports: [OpenAPIModule.forRoot({ title: "My App", version: "1.0.0", path: "/docs" })],
})
class AppModule {}

@Controller("/users")
@ApiTags("Users")
class UserController {
  @Get("/:id")
  @ApiOperation({ summary: "사용자 조회" })
  findById(@Param("id") id: number) { /* ... */ }
}

// GET /openapi.json  — OpenAPI 3.1 스펙
// GET /docs         — Scalar UI
```

---

## `@nexusts/upload` (v0.4)

```ts
import { UploadModule, Upload, UploadedFile } from "@nexusts/upload";

@Module({
  imports: [UploadModule.forRoot({ maxFileSize: 10 * 1024 * 1024 })],
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

---

## `@nexusts/sse` (v0.4)

```ts
import { sse } from "@nexusts/sse";

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

`SseStream`은 `close()` 전에 호출된 모든 `send()`가 클라이언트에 도달함을 보장.

---

## `@nexusts/tracing` (v0.4)

```ts
import { TracingModule, Trace, withSpan } from "@nexusts/tracing";

@Module({
  imports: [TracingModule.forRoot({
    serviceName: "my-app",
    exporter: "otlp-http",
    endpoint: "http://otel-collector:4318",
  })],
})
class AppModule {}

class UserService {
  @Trace()
  findById(id: string) { /* ... */ }
}

await withSpan("nightly.cleanup", async (span) => {
  span.setAttribute("target", "sessions");
  await cleanupSessions();
});
```

`@opentelemetry/api`만 필수 의존성. SDK 패키지는 optional peer dep.

---

## `@nexusts/metrics` (v0.4)

```ts
import { MetricsModule, Counted, Timed } from "@nexusts/metrics";

@Module({
  imports: [MetricsModule.forRoot({ path: "/metrics", enableDefaultMetrics: true })],
})
class AppModule {}

class UserService {
  @Counted("user_requests_total", { labels: () => ({ method: "GET" }) })
  @Timed("user_request_duration_seconds", { labels: () => ({ method: "GET" }) })
  async findById(id: string) { /* ... */ }
}
```

`GET /metrics`는 Prometheus 0.0.4 반환 (또는 클라이언트가 요청 시 OpenMetrics 1.0.0). 기본 Bun 프로세스 메트릭 자동 등록.

---

## Request-scoped DI (v0.4)

```ts
import { Inject, Injectable, REQUEST, getRequest } from "@nexusts/core";

@Injectable({ scope: "request" })
class RequestContext {
  id = crypto.randomUUID();
  @Inject(REQUEST) declare req: any;
  constructor() { /* ... */ }
}

@Injectable()
class AuditService {
  @Inject(RequestContext) declare ctx: RequestContext;
  log(event: string) { console.log(`[${this.ctx.id}] ${event}`); }
}
```

프레임워크가 `AsyncLocalStorage`로 요청별 scope를 활성화하는 Hono 미들웨어 자동 설치.

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
await grpc.start();   // 0.0.0.0:50051에 bind

// Typed client (camelCase: FindById → findById)
type UserClient = { findById(req: { id: number }): Promise<{ name: string; email: string }> };
const users = grpc.client<UserClient>("UserService", { url: "internal:50051" });
const u = await users.findById({ id: 1 });

await grpc.stop();  // graceful shutdown (1s timeout, then force)
```

Optional peer deps: `@grpc/grpc-js` (^1.10), `@grpc/proto-loader` (^0.7).
gRPC 모듈을 실제로 사용할 때만 설치.

자세한 내용: [user-guide/grpc.ko.md](./user-guide/grpc.ko.md).

---

## 참고

- [시작하기](./user-guide/getting-started.ko.md)
- [컨트롤러 & 데코레이터](./user-guide/controllers.ko.md)
- [의존성 주입](./user-guide/dependency-injection.ko.md)
- [검증](./user-guide/validation.ko.md)
- [뷰 엔진](./user-guide/view-engines.ko.md)
- [Inertia.js 어댑터](./user-guide/inertia.ko.md)
- [런타임 & 배포](./user-guide/runtime-deployment.ko.md)
