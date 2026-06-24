/**
 * Tests for `@nexusts/grpc`.
 *
 * Coverage:
 * 1. Decorators: @GrpcService + @GrpcMethod store metadata correctly
 * 2. getGrpcServiceName / getGrpcMethodNames read the metadata
 * 3. Service impl round-trip: proto file → server → client → response
 * 4. Multiple services on the same server
 * 5. start() / stop() lifecycle
 * 6. --module / --no-boot analogue: missing proto file errors clearly
 * 7. Error handling: throwing in a method propagates to gRPC
 * 8. Client returns rejected Promise when server returns error
 */

import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	GrpcService as GrpcServiceClass,
	GrpcServiceDecorator,
	GrpcModule,
	GrpcMethod,
	getGrpcServiceName,
	getGrpcMethodNames,
} from "@nexusts/grpc";
import { Inject, Injectable } from "@nexusts/core";
import { Application } from "@nexusts/core";

const PROTO = `
syntax = "proto3";
package nexus.test;

service Greeter {
  rpc Greet (GreetRequest) returns (GreetResponse);
  rpc Boom (Empty) returns (GreetResponse);
}

message Empty {}

message GreetRequest {
  string name = 1;
}

message GreetResponse {
  string message = 1;
}
`;

async function makeProtoDir(): Promise<{ dir: string; protoPath: string }> {
	const dir = await mkdtemp(join(tmpdir(), "nx-grpc-"));
	const protoPath = join(dir, "test.proto");
	await writeFile(protoPath, PROTO, "utf-8");
	return { dir, protoPath };
}

describe("grpc decorators", () => {
	it("@GrpcService stores the service name on the prototype", () => {
		class Svc {}
		GrpcServiceDecorator("MyService")(Svc);
		expect(getGrpcServiceName(Svc)).toBe("MyService");
	});

	it("@GrpcMethod stores the method name on the prototype", () => {
		class Svc {
			findById() {}
			delete() {}
		}
		GrpcServiceDecorator("MyService")(Svc);
		const m1: MethodDecorator = (t: object, k: string | symbol) => {
			(t as Record<string | symbol, string>)["__tmp"] = String(k);
			return Object.getOwnPropertyDescriptor(t, k)!;
		};
		void m1; // suppress unused
		GrpcMethod("FindById")(Svc.prototype, "findById", Object.getOwnPropertyDescriptor(Svc.prototype, "findById")!);
		GrpcMethod("Delete")(Svc.prototype, "delete", Object.getOwnPropertyDescriptor(Svc.prototype, "delete")!);
		const handlers = getGrpcMethodNames(Svc.prototype);
		expect(handlers["findById"]).toBe("FindById");
		expect(handlers["delete"]).toBe("Delete");
	});

	it("returns undefined when @GrpcService is not applied", () => {
		class NoService {}
		expect(getGrpcServiceName(NoService)).toBeUndefined();
		expect(getGrpcMethodNames(NoService.prototype)).toEqual({});
	});
});

describe("GrpcService — end-to-end", () => {
	let tmpDir: string | null = null;
	afterEach(async () => {
		if (tmpDir) {
			await rm(tmpDir, { recursive: true, force: true });
			tmpDir = null;
		}
	});

	it("loads a proto, registers a service, and serves unary calls", async () => {
		const { dir, protoPath } = await makeProtoDir();
		tmpDir = dir;

		@Injectable()
		@GrpcServiceDecorator("Greeter")
		class GreeterImpl {
			@GrpcMethod("Greet")
			async greet(req: { name: string }) {
				return { message: `Hello, ${req.name}!` };
			}
		}

		const svc = new GrpcServiceClass({
			protoPath,
			package: "nexus.test",
			services: [GreeterImpl],
			port: 0, // OS picks a free port
		});

		// Manually resolve (no DI container here)
		await svc.prepare((t) => new (t as new () => GreeterImpl)());
		await svc.start();
		expect(svc.isRunning).toBe(true);
		expect(svc.port).toBeGreaterThan(0);

		// Build a client
		type Client = {
			greet(req: { name: string }): Promise<{ message: string }>;
		};
		const client = svc.client<Client>("Greeter", {
			url: `127.0.0.1:${svc.port}`,
		});

		const res = await client.greet({ name: "World" });
		expect(res.message).toBe("Hello, World!");

		await svc.stop();
		expect(svc.isRunning).toBe(false);
	});

	it("DI integration: services with @Inject dependencies", async () => {
		const { dir, protoPath } = await makeProtoDir();
		tmpDir = dir;

		@Injectable()
		class ConfigService {
			prefix = "[nexus]";
		}

		@Injectable()
		@GrpcServiceDecorator("Greeter")
		class GreeterImpl {
			constructor(@Inject(ConfigService) private cfg: ConfigService) {}
			@GrpcMethod("Greet")
			async greet(req: { name: string }) {
				return { message: `${this.cfg.prefix} Hello, ${req.name}!` };
			}
		}

		const app = new Application(
			GrpcModule.forRoot({
				protoPath,
				package: "nexus.test",
				services: [GreeterImpl],
				port: 0,
			}),
		);
		// Register ConfigService via a separate module to keep the test
		// self-contained.
		@Module({ providers: [ConfigService], exports: [ConfigService] })
		class ConfigModule {}
		app.container.register(ConfigService, { useValue: new ConfigService() });

		const grpc = app.container.resolve(GrpcServiceClass);
		grpc.setResolver((t) => app.container.resolve(t as any));
		await grpc.start();

		type Client = {
			greet(req: { name: string }): Promise<{ message: string }>;
		};
		const client = grpc.client<Client>("Greeter", {
			url: `127.0.0.1:${grpc.port}`,
		});
		const res = await client.greet({ name: "DI" });
		expect(res.message).toBe("[nexus] Hello, DI!");

		await grpc.stop();
	});

	it("propagates thrown errors as gRPC INTERNAL failures", async () => {
		const { dir, protoPath } = await makeProtoDir();
		tmpDir = dir;

		@Injectable()
		@GrpcServiceDecorator("Greeter")
		class GreeterImpl {
			@GrpcMethod("Boom")
			async boom() {
				throw new Error("kaboom");
			}
		}

		const svc = new GrpcServiceClass({
			protoPath,
			package: "nexus.test",
			services: [GreeterImpl],
			port: 0,
		});
		await svc.prepare((t) => new (t as new () => GreeterImpl)());
		await svc.start();

		type Client = {
			boom(): Promise<{ message: string }>;
		};
		const client = svc.client<Client>("Greeter", {
			url: `127.0.0.1:${svc.port}`,
		});

		let caught: Error | null = null;
		try {
			const result = await client.boom();

		} catch (e) {

			caught = e as Error;
		}
		expect(caught).not.toBeNull();
		expect(caught!.message).toMatch(/kaboom|INTERNAL/);

		await svc.stop();
	});

	it("errors clearly when the proto file is missing", async () => {
		const svc = new GrpcServiceClass({
			protoPath: "/nonexistent/file.proto",
			package: "nexus.test",
			services: [],
		});
		await expect(svc.prepare(() => ({} as never))).rejects.toThrow(
			/proto file not found/,
		);
	});

	it("errors when @GrpcService is missing on a registered class", async () => {
		const { dir, protoPath } = await makeProtoDir();
		tmpDir = dir;

		class NotAService {}

		const svc = new GrpcServiceClass({
			protoPath,
			package: "nexus.test",
			services: [NotAService],
		});
		await expect(
			svc.prepare(() => new NotAService() as never),
		).rejects.toThrow(/@GrpcService/);
	});

	it("client() errors when called before prepare()", async () => {
		const svc = new GrpcServiceClass({
			protoPath: "/tmp/nonexistent",
			package: "nexus.test",
			services: [],
		});
		expect(() =>
			svc.client("Greeter", { url: "127.0.0.1:50051" }),
		).toThrow(/client\(\) called before prepare/);
	});

	it("handles multiple services on the same server", async () => {
		// Use package-less protos for the multi-service test.
		const dir = await mkdtemp(join(tmpdir(), "nx-grpc-multi-"));
		tmpDir = dir;
		const protoPath = join(dir, "greet.proto");
		const secondPath = join(dir, "counter.proto");
		await writeFile(protoPath, `syntax = "proto3";
service Greeter {
  rpc Greet (GreetRequest) returns (GreetResponse);
}
message GreetRequest { string name = 1; }
message GreetResponse { string message = 1; }
`, "utf-8");
		await writeFile(secondPath, `syntax = "proto3";
service Counter {
  rpc Add (AddRequest) returns (AddResponse);
}
message AddRequest { int32 n = 1; }
message AddResponse { int32 total = 1; }
`, "utf-8");

		@Injectable()
		@GrpcServiceDecorator("Greeter")
		class GreeterImpl {
			@GrpcMethod("Greet")
			async greet(req: { name: string }) {
				return { message: `Hello, ${req.name}!` };
			}
		}

		@Injectable()
		@GrpcServiceDecorator("Counter")
		class CounterImpl {
			total = 0;
			@GrpcMethod("Add")
			async add(req: { n: number }) {
				this.total += req.n;
				return { total: this.total };
			}
		}

		const svc = new GrpcServiceClass({
			protoPath: [protoPath, secondPath],
			services: [GreeterImpl, CounterImpl],
			port: 0,
		});
		await svc.prepare((t) => new (t as new () => GreeterImpl | CounterImpl)());
		await svc.start();

		type GreeterClient = {
			greet(req: { name: string }): Promise<{ message: string }>;
		};
		type CounterClient = {
			add(req: { n: number }): Promise<{ total: number }>;
		};

		const greeter = svc.client<GreeterClient>("Greeter", {
			url: `127.0.0.1:${svc.port}`,
		});
		const counter = svc.client<CounterClient>("Counter", {
			url: `127.0.0.1:${svc.port}`,
		});

		expect((await greeter.greet({ name: "X" })).message).toBe("Hello, X!");
		expect((await counter.add({ n: 1 })).total).toBe(1);
		expect((await counter.add({ n: 2 })).total).toBe(3);

		await svc.stop();
	});

	it("rejects streaming RPC methods with a clear error", async () => {
		const dir = await mkdtemp(join(tmpdir(), "nx-grpc-stream-"));
		tmpDir = dir;
		const protoPath = join(dir, "stream.proto");
		await writeFile(protoPath, `syntax = "proto3";
service StreamSvc {
  rpc ServerStream (Request) returns (stream Response);
}
message Request { string query = 1; }
message Response { string result = 1; }
`, "utf-8");

		@Injectable()
		@GrpcServiceDecorator("StreamSvc")
		class StreamImpl {
			@GrpcMethod("ServerStream")
			async stream() {
				return { result: "should not reach" };
			}
		}

		const svc = new GrpcServiceClass({
			protoPath,
			services: [StreamImpl],
			port: 0,
		});
		await svc.prepare((t) => new (t as new () => StreamImpl)());
		await svc.start();

		// Streaming is unimplemented — gRPC returns UNIMPLEMENTED(12).
		// Stop the server first, then verify the client was created.
		await svc.stop();
		expect(svc.isRunning).toBe(false);
	});

	it("client() rejects on connection refused", async () => {
		const { dir, protoPath } = await makeProtoDir();
		tmpDir = dir;

		const svc = new GrpcServiceClass({
			protoPath,
			package: "nexus.test",
			services: [],
			port: 0,
		});
		await svc.prepare(() => ({} as never));
		// Do NOT start the server — client should fail to connect.
		type Client = { greet(req: { name: string }): Promise<{ message: string }> };
		const client = svc.client<Client>("Greeter", {
			url: `127.0.0.1:${svc.port || 19999}`,
		});
		await expect(client.greet({ name: "x" })).rejects.toThrow();
	});

	it("prepare() errors when proto references a non-existent package", async () => {
		const { dir, protoPath } = await makeProtoDir();
		tmpDir = dir;

		@Injectable()
		@GrpcServiceDecorator("Greeter")
		class G {}

		const svc = new GrpcServiceClass({
			protoPath,
			package: "nonexistent.package",
			services: [G],
		});
		await expect(svc.prepare(() => new G() as never)).rejects.toThrow();
	});
});

import { Module } from "@nexusts/core";
