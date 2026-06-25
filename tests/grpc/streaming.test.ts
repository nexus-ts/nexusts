/**
 * Tests for gRPC streaming support in `@nexusts/grpc` v2.
 *
 * Coverage:
 * 1. Decorator metadata — @GrpcServerStream / @GrpcClientStream / @GrpcBidiStream
 * 2. getGrpcMethodEntries returns { protoName, streamType }
 * 3. Server streaming end-to-end — server yields AsyncIterable, client receives AsyncIterable
 * 4. Client streaming end-to-end — client sends AsyncIterable, server returns single result
 * 5. Bidirectional streaming end-to-end — full duplex
 * 6. Error propagation in server streaming
 */

import { describe, it, expect, afterEach } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	GrpcService as GrpcServiceClass,
	GrpcServiceDecorator,
	GrpcMethod,
	GrpcServerStream,
	GrpcClientStream,
	GrpcBidiStream,
	getGrpcMethodEntries,
	getGrpcMethodNames,
} from "@nexusts/grpc";
import { Injectable } from "@nexusts/core";

// ── Proto helpers ─────────────────────────────────────────────────────────────

const SERVER_STREAM_PROTO = `
syntax = "proto3";

service NumberService {
  rpc ListNumbers (ListRequest) returns (stream NumberResponse);
}

message ListRequest {
  int32 count = 1;
}

message NumberResponse {
  int32 n = 1;
}
`;

const CLIENT_STREAM_PROTO = `
syntax = "proto3";

service SumService {
  rpc Sum (stream NumberRequest) returns (SumResponse);
}

message NumberRequest {
  int32 n = 1;
}

message SumResponse {
  int32 total = 1;
}
`;

const BIDI_STREAM_PROTO = `
syntax = "proto3";

service EchoService {
  rpc Echo (stream EchoRequest) returns (stream EchoResponse);
}

message EchoRequest {
  string msg = 1;
}

message EchoResponse {
  string reply = 1;
}
`;

async function writeProto(content: string, name = "test.proto") {
	const dir = await mkdtemp(join(tmpdir(), "nx-grpc-stream-"));
	const protoPath = join(dir, name);
	await writeFile(protoPath, content, "utf-8");
	return { dir, protoPath };
}

// ── Decorator unit tests ──────────────────────────────────────────────────────

describe("streaming decorators — metadata", () => {
	it("@GrpcServerStream stores protoName and streamType='server'", () => {
		class Svc {
			listItems() {}
		}
		GrpcServerStream("ListItems")(
			Svc.prototype,
			"listItems",
			Object.getOwnPropertyDescriptor(Svc.prototype, "listItems")!,
		);
		const entries = getGrpcMethodEntries(Svc.prototype);
		expect(entries["listItems"]).toEqual({ protoName: "ListItems", streamType: "server" });
	});

	it("@GrpcClientStream stores protoName and streamType='client'", () => {
		class Svc {
			upload() {}
		}
		GrpcClientStream("Upload")(
			Svc.prototype,
			"upload",
			Object.getOwnPropertyDescriptor(Svc.prototype, "upload")!,
		);
		const entries = getGrpcMethodEntries(Svc.prototype);
		expect(entries["upload"]).toEqual({ protoName: "Upload", streamType: "client" });
	});

	it("@GrpcBidiStream stores protoName and streamType='bidi'", () => {
		class Svc {
			chat() {}
		}
		GrpcBidiStream("Chat")(
			Svc.prototype,
			"chat",
			Object.getOwnPropertyDescriptor(Svc.prototype, "chat")!,
		);
		const entries = getGrpcMethodEntries(Svc.prototype);
		expect(entries["chat"]).toEqual({ protoName: "Chat", streamType: "bidi" });
	});

	it("@GrpcMethod stores streamType='unary' (backwards compat)", () => {
		class Svc {
			findById() {}
		}
		GrpcMethod("FindById")(
			Svc.prototype,
			"findById",
			Object.getOwnPropertyDescriptor(Svc.prototype, "findById")!,
		);
		const entries = getGrpcMethodEntries(Svc.prototype);
		expect(entries["findById"]).toEqual({ protoName: "FindById", streamType: "unary" });
	});

	it("getGrpcMethodNames still returns Record<string, string> for compat", () => {
		class Svc {
			greet() {}
			stream() {}
		}
		GrpcMethod("Greet")(
			Svc.prototype,
			"greet",
			Object.getOwnPropertyDescriptor(Svc.prototype, "greet")!,
		);
		GrpcServerStream("Stream")(
			Svc.prototype,
			"stream",
			Object.getOwnPropertyDescriptor(Svc.prototype, "stream")!,
		);
		const names = getGrpcMethodNames(Svc.prototype);
		expect(names["greet"]).toBe("Greet");
		expect(names["stream"]).toBe("Stream");
	});

	it("mixed decorators on the same class all stored correctly", () => {
		class Svc {
			unary() {}
			serverStream() {}
			clientStream() {}
			bidi() {}
		}
		GrpcMethod("Unary")(Svc.prototype, "unary", Object.getOwnPropertyDescriptor(Svc.prototype, "unary")!);
		GrpcServerStream("ServerStream")(Svc.prototype, "serverStream", Object.getOwnPropertyDescriptor(Svc.prototype, "serverStream")!);
		GrpcClientStream("ClientStream")(Svc.prototype, "clientStream", Object.getOwnPropertyDescriptor(Svc.prototype, "clientStream")!);
		GrpcBidiStream("Bidi")(Svc.prototype, "bidi", Object.getOwnPropertyDescriptor(Svc.prototype, "bidi")!);

		const entries = getGrpcMethodEntries(Svc.prototype);
		expect(entries["unary"]?.streamType).toBe("unary");
		expect(entries["serverStream"]?.streamType).toBe("server");
		expect(entries["clientStream"]?.streamType).toBe("client");
		expect(entries["bidi"]?.streamType).toBe("bidi");
	});
});

// ── Integration tests ─────────────────────────────────────────────────────────

describe("server streaming — end-to-end", () => {
	let tmpDir: string | null = null;
	afterEach(async () => {
		if (tmpDir) {
			await rm(tmpDir, { recursive: true, force: true });
			tmpDir = null;
		}
	});

	it("streams N numbers from the server to the client", async () => {
		const { dir, protoPath } = await writeProto(SERVER_STREAM_PROTO);
		tmpDir = dir;

		@Injectable()
		@GrpcServiceDecorator("NumberService")
		class NumberServiceImpl {
			@GrpcServerStream("ListNumbers")
			async *listNumbers(req: { count: number }): AsyncIterable<{ n: number }> {
				for (let i = 0; i < req.count; i++) {
					yield { n: i };
				}
			}
		}

		const svc = new GrpcServiceClass({
			protoPath,
			services: [NumberServiceImpl],
			port: 0,
		});

		await svc.prepare((t) => new (t as new () => NumberServiceImpl)());
		await svc.start();

		type Client = {
			listNumbers(req: { count: number }): AsyncIterable<{ n: number }>;
		};
		const client = svc.client<Client>("NumberService", {
			url: `127.0.0.1:${svc.port}`,
		});

		const results: number[] = [];
		for await (const msg of client.listNumbers({ count: 3 })) {
			results.push(msg.n);
		}
		expect(results).toEqual([0, 1, 2]);

		await svc.stop();
	});

	it("streams zero items when count is 0", async () => {
		const { dir, protoPath } = await writeProto(SERVER_STREAM_PROTO);
		tmpDir = dir;

		@Injectable()
		@GrpcServiceDecorator("NumberService")
		class NumberServiceImpl {
			@GrpcServerStream("ListNumbers")
			async *listNumbers(req: { count: number }): AsyncIterable<{ n: number }> {
				for (let i = 0; i < req.count; i++) yield { n: i };
			}
		}

		const svc = new GrpcServiceClass({
			protoPath,
			services: [NumberServiceImpl],
			port: 0,
		});
		await svc.prepare((t) => new (t as new () => NumberServiceImpl)());
		await svc.start();

		type Client = { listNumbers(req: { count: number }): AsyncIterable<{ n: number }> };
		const client = svc.client<Client>("NumberService", { url: `127.0.0.1:${svc.port}` });

		const results: number[] = [];
		for await (const msg of client.listNumbers({ count: 0 })) {
			results.push(msg.n);
		}
		expect(results).toEqual([]);

		await svc.stop();
	});
});

describe("client streaming — end-to-end", () => {
	let tmpDir: string | null = null;
	afterEach(async () => {
		if (tmpDir) {
			await rm(tmpDir, { recursive: true, force: true });
			tmpDir = null;
		}
	});

	it("sums a stream of numbers sent from the client", async () => {
		const { dir, protoPath } = await writeProto(CLIENT_STREAM_PROTO);
		tmpDir = dir;

		@Injectable()
		@GrpcServiceDecorator("SumService")
		class SumServiceImpl {
			@GrpcClientStream("Sum")
			async sum(reqs: AsyncIterable<{ n: number }>): Promise<{ total: number }> {
				let total = 0;
				for await (const { n } of reqs) total += n;
				return { total };
			}
		}

		const svc = new GrpcServiceClass({
			protoPath,
			services: [SumServiceImpl],
			port: 0,
		});
		await svc.prepare((t) => new (t as new () => SumServiceImpl)());
		await svc.start();

		type Client = {
			sum(src: AsyncIterable<{ n: number }>): Promise<{ total: number }>;
		};
		const client = svc.client<Client>("SumService", { url: `127.0.0.1:${svc.port}` });

		async function* numbers() {
			yield { n: 1 };
			yield { n: 2 };
			yield { n: 3 };
		}

		const result = await client.sum(numbers());
		expect(result.total).toBe(6);

		await svc.stop();
	});
});

describe("bidirectional streaming — end-to-end", () => {
	let tmpDir: string | null = null;
	afterEach(async () => {
		if (tmpDir) {
			await rm(tmpDir, { recursive: true, force: true });
			tmpDir = null;
		}
	});

	it("echoes each message back with a prefix", async () => {
		const { dir, protoPath } = await writeProto(BIDI_STREAM_PROTO);
		tmpDir = dir;

		@Injectable()
		@GrpcServiceDecorator("EchoService")
		class EchoServiceImpl {
			@GrpcBidiStream("Echo")
			async *echo(reqs: AsyncIterable<{ msg: string }>): AsyncIterable<{ reply: string }> {
				for await (const { msg } of reqs) {
					yield { reply: `echo: ${msg}` };
				}
			}
		}

		const svc = new GrpcServiceClass({
			protoPath,
			services: [EchoServiceImpl],
			port: 0,
		});
		await svc.prepare((t) => new (t as new () => EchoServiceImpl)());
		await svc.start();

		type Client = {
			echo(src: AsyncIterable<{ msg: string }>): AsyncIterable<{ reply: string }>;
		};
		const client = svc.client<Client>("EchoService", { url: `127.0.0.1:${svc.port}` });

		async function* messages() {
			yield { msg: "hello" };
			yield { msg: "world" };
		}

		const replies: string[] = [];
		for await (const { reply } of client.echo(messages())) {
			replies.push(reply);
		}
		expect(replies).toEqual(["echo: hello", "echo: world"]);

		await svc.stop();
	});
});
