/**
 * 34 · gRPC Streaming
 *
 * Demonstrates all three gRPC streaming patterns:
 *   - Server streaming  (@GrpcServerStream)
 *   - Client streaming  (@GrpcClientStream)
 *   - Bidirectional     (@GrpcBidiStream)
 *
 * Run with: bun main.ts
 */

import "reflect-metadata";
import {
  Application,
  Controller,
  Get,
  Injectable,
  Module,
} from "@nexusts/core";
import {
  GrpcModule,
  GrpcService as GrpcSvcClass,
  GrpcServiceDecorator,
  GrpcMethod,
  GrpcServerStream,
  GrpcClientStream,
  GrpcBidiStream,
} from "@nexusts/grpc";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ── Proto definition ──────────────────────────────────────────────────────────

const PROTO = `
syntax = "proto3";
package demo;

// Unary + streaming mix
service DemoService {
  // Unary
  rpc Ping   (PingRequest)   returns (PingResponse);
  // Server streaming — server streams N numbers
  rpc Count  (CountRequest)  returns (stream NumberMsg);
  // Client streaming — client streams numbers, server returns sum
  rpc Sum    (stream NumberMsg) returns (SumResponse);
  // Bidirectional — echo service
  rpc Echo   (stream EchoMsg) returns (stream EchoMsg);
}

message PingRequest  { string name = 1; }
message PingResponse { string pong = 1; }
message CountRequest { int32  up_to = 1; }
message NumberMsg    { int32  n     = 1; }
message SumResponse  { int32  total = 1; }
message EchoMsg      { string text  = 1; }
`;

// ── Service implementation ────────────────────────────────────────────────────

@Injectable()
@GrpcServiceDecorator("DemoService")
class DemoServiceImpl {
  // ── Unary ─────────────────────────────────────────────────────────────────
  @GrpcMethod("Ping")
  async ping(req: { name: string }) {
    return { pong: `Hello, ${req.name}!` };
  }

  // ── Server streaming ──────────────────────────────────────────────────────
  @GrpcServerStream("Count")
  async *count(req: { upTo: number }): AsyncIterable<{ n: number }> {
    for (let i = 1; i <= req.upTo; i++) {
      yield { n: i };
    }
  }

  // ── Client streaming ──────────────────────────────────────────────────────
  @GrpcClientStream("Sum")
  async sum(
    reqs: AsyncIterable<{ n: number }>,
  ): Promise<{ total: number }> {
    let total = 0;
    for await (const { n } of reqs) {
      total += n;
    }
    return { total };
  }

  // ── Bidirectional ─────────────────────────────────────────────────────────
  @GrpcBidiStream("Echo")
  async *echo(
    reqs: AsyncIterable<{ text: string }>,
  ): AsyncIterable<{ text: string }> {
    for await (const { text } of reqs) {
      yield { text: `[echo] ${text}` };
    }
  }
}

// ── NexusTS HTTP controller — drives the demo ────────────────────────────────

@Controller("/demo")
@Injectable()
class DemoController {
  constructor(private readonly grpc: GrpcSvcClass) {}

  @Get("/ping")
  async ping() {
    const client = this.grpc.client<{
      ping(req: { name: string }): Promise<{ pong: string }>;
    }>("DemoService");
    return client.ping({ name: "world" });
  }

  @Get("/count")
  async count() {
    const client = this.grpc.client<{
      count(req: { upTo: number }): AsyncIterable<{ n: number }>;
    }>("DemoService");
    const numbers: number[] = [];
    for await (const { n } of client.count({ upTo: 5 })) {
      numbers.push(n);
    }
    return { numbers };
  }

  @Get("/sum")
  async sum() {
    const client = this.grpc.client<{
      sum(src: AsyncIterable<{ n: number }>): Promise<{ total: number }>;
    }>("DemoService");
    async function* nums() {
      for (const n of [1, 2, 3, 4, 5]) yield { n };
    }
    return client.sum(nums());
  }

  @Get("/echo")
  async echo() {
    const client = this.grpc.client<{
      echo(src: AsyncIterable<{ text: string }>): AsyncIterable<{ text: string }>;
    }>("DemoService");
    async function* msgs() {
      for (const text of ["hello", "world"]) yield { text };
    }
    const replies: string[] = [];
    for await (const { text } of client.echo(msgs())) {
      replies.push(text);
    }
    return { replies };
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

// Write the proto to a temp file for this example
const tmpDir = await mkdtemp(join(tmpdir(), "grpc-streaming-"));
const protoPath = join(tmpDir, "demo.proto");
await writeFile(protoPath, PROTO, "utf-8");

@Module({
  controllers: [DemoController],
  imports: [
    GrpcModule.forRoot({
      protoPath,
      package: "demo",
      services: [DemoServiceImpl],
      port: 50051,
    }),
  ],
})
class AppModule {}

const app = new Application(AppModule);
await app.listen(3000);

// Start the gRPC server
const grpc = app.container.resolve(GrpcSvcClass);
await grpc.start();

console.log(`
✓ HTTP server: http://localhost:3000
✓ gRPC server: localhost:50051

Try:
  curl http://localhost:3000/demo/ping   # unary
  curl http://localhost:3000/demo/count  # server streaming
  curl http://localhost:3000/demo/sum    # client streaming
  curl http://localhost:3000/demo/echo   # bidirectional

Press Ctrl+C to stop.
`);

// Cleanup temp dir on exit
process.on("SIGINT", async () => {
  await grpc.stop();
  await rm(tmpDir, { recursive: true, force: true });
  process.exit(0);
});
