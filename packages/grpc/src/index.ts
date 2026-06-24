/**
 * `nexusjs/grpc` — gRPC integration for the Bun-native stack.
 *
 * Public API:
 * - `GrpcService` — the main service. Owns the @grpc/grpc-js server
 *   and the loaded proto definition.
 * - `GrpcModule.forRoot(config)` — wires the service into the DI
 *   container, registers service implementations, and prepares the
 *   handlers. The user calls `start()` to bind the server to a
 *   port.
 * - `@GrpcService(name)` — class decorator marking an impl class.
 * - `@GrpcMethod(name)` — method decorator binding a method to a
 *   gRPC method declared in the `.proto` file.
 * - `client<T>(name, { url })` — build a typed client for a gRPC
 *   service. Methods return Promises.
 *
 * Optional peer dependencies:
 *   - `@grpc/grpc-js` (^1.10.0)  — the server runtime
 *   - `@grpc/proto-loader` (^0.7.0) — loads `.proto` files
 *
 * Install with:
 *   bun add @grpc/grpc-js @grpc/proto-loader
 *
 * Quick start:
 *
 *   // user.proto
 *   syntax = "proto3";
 *   package user;
 *   service UserService {
 *     rpc FindById (UserRequest) returns (UserResponse);
 *   }
 *   message UserRequest { int32 id = 1; }
 *   message UserResponse { string name = 1; string email = 2; }
 *
 *   // user.grpc.ts
 *   @Injectable()
 *   @GrpcService("UserService")
 *   class UserServiceImpl {
 *     @GrpcMethod("FindById")
 *     async findById(req: { id: number }) {
 *       return { name: "Alice", email: "alice@example.com" };
 *     }
 *   }
 *
 *   // app.module.ts
 *   @Module({
 *     imports: [GrpcModule.forRoot({
 *       protoPath: "./proto/user.proto",
 *       services: [UserServiceImpl],
 *     })],
 *   })
 *   class AppModule {}
 *
 *   // main.ts
 *   const app = new Application(AppModule);
 *   const grpc = app.container.resolve(GrpcService);
 *   await grpc.start();  // binds to 0.0.0.0:50051
 *
 *   // client usage (e.g. in another service)
 *   const userClient = grpc.client<{ findById(req: { id: number }): Promise<{ name: string; email: string }> }>("UserService");
 *   const user = await userClient.findById({ id: 1 });
 *
 * v2: All four gRPC call types are supported — unary, server streaming,
 * client streaming, and bidirectional streaming.
 */

export { GrpcService, GRPC_SERVICE_TOKEN } from "./service.js";
export { GrpcModule } from "./module.js";
export {
	GrpcService as GrpcServiceDecorator,
	GrpcMethod,
	GrpcServerStream,
	GrpcClientStream,
	GrpcBidiStream,
	getGrpcServiceName,
	getGrpcMethodNames,
	getGrpcMethodEntries,
} from "./decorators.js";
export type {
	GrpcConfig,
	GrpcMethodMeta,
	GrpcMethodEntry,
	GrpcStreamType,
	GrpcClient,
	GrpcClientOptions,
} from "./types.js";