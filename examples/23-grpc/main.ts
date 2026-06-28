import path from "node:path";
import { Application, Module, Injectable, Controller, Get, Inject } from "@nexusts/core";
import {
  GrpcModule, GrpcService, GRPC_SERVICE_TOKEN,
  GrpcServiceDecorator, GrpcMethod,
} from "@nexusts/grpc";

/**
 * 23-grpc — gRPC server with reflection-based discovery.
 *
 *   Run: bun main.ts
 *   The server listens on 0.0.0.0:50051.
 *   The HTTP server at :3000 exposes GET /hello to invoke gRPC.
 */

@Injectable()
@GrpcServiceDecorator("GreeterService")
class GreeterServiceImpl {
  @GrpcMethod("SayHello")
  sayHello(request: { name: string }) {
    return { message: `Hello, ${request.name}!` };
  }
}

@Injectable()
class GreeterClient {
  @Inject(GRPC_SERVICE_TOKEN) declare grpc: GrpcService;
  private client: any;

  constructor() {
    this.client = this.grpc.client("GreeterService", { url: "localhost:50051" });
  }

  async sayHello(name: string) {
    return this.client.SayHello({ name });
  }
}

@Injectable()
@Controller("/")
class GreeterController {
  @Inject(GreeterClient) declare client: GreeterClient;

  @Get("/hello")
  async hello() {
    return await this.client.sayHello("world");
  }
}

@Module({
  imports: [
    GrpcModule.forRoot({
      protoPath: path.join(import.meta.dir, "proto/greeter.proto"),
      host: "0.0.0.0",
      port: 50051,
      services: [GreeterServiceImpl],
    }),
  ],
  controllers: [GreeterController],
  providers: [GreeterServiceImpl, GreeterClient],
})
class AppModule {}

const app = new Application(AppModule);
const port = Number(process.env.PORT ?? 3000);
await app.listen(port);

// Start gRPC server (port comes from forRoot config).
const grpc = app.container.resolve(GrpcService);
await grpc.start();
