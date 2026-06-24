/**
 * gRPC decorators.
 *
 * Unary (request → response):
 *   @GrpcMethod("FindById")
 *   async findById(req: { id: number }): Promise<TRes> { ... }
 *
 * Server streaming (request → stream<response>):
 *   @GrpcServerStream("ListItems")
 *   async *listItems(req: { page: number }): AsyncIterable<TItem> { yield ...; }
 *
 * Client streaming (stream<request> → response):
 *   @GrpcClientStream("UploadChunks")
 *   async uploadChunks(req: AsyncIterable<TChunk>): Promise<TResult> { ... }
 *
 * Bidirectional streaming (stream<request> → stream<response>):
 *   @GrpcBidiStream("Chat")
 *   async *chat(req: AsyncIterable<TMsg>): AsyncIterable<TMsg> { yield ...; }
 */

import type { GrpcMethodEntry, GrpcStreamType } from "./types.js";

const GRPC_SERVICE_KEY = Symbol.for("nexus:grpc:service");
const GRPC_METHOD_KEY = Symbol.for("nexus:grpc:method");

/**
 * Mark a class as a gRPC service implementation. The `name`
 * must match a `service` declaration in the .proto file.
 */
export function GrpcService(name: string): ClassDecorator {
	return function (target: Function) {
		const proto = (target as { prototype: object }).prototype ?? target;
		(proto as Record<symbol, unknown>)[GRPC_SERVICE_KEY] = { name };
	};
}

// ── Shared factory ──────────────────────────────────────────────────────────

function makeMethodDecorator(
	protoName: string,
	streamType: GrpcStreamType,
): MethodDecorator {
	return function (
		_target: object,
		propertyKey: string | symbol,
		_descriptor: PropertyDescriptor,
	) {
		const proto = _target as Record<symbol, unknown>;
		proto[GRPC_METHOD_KEY] = proto[GRPC_METHOD_KEY] ?? {};
		(proto[GRPC_METHOD_KEY] as Record<string | symbol, GrpcMethodEntry>)[
			propertyKey
		] = { protoName, streamType };
		return _descriptor;
	};
}

// ── Public decorators ───────────────────────────────────────────────────────

/**
 * Bind a method to a unary gRPC handler.
 * The method receives `(request: TReq)` and returns `Promise<TRes>`.
 */
export function GrpcMethod(name: string): MethodDecorator {
	return makeMethodDecorator(name, "unary");
}

/**
 * Bind a method to a server-streaming gRPC handler.
 * The method receives `(request: TReq)` and returns `AsyncIterable<TRes>`.
 *
 * @example
 *   @GrpcServerStream("ListNumbers")
 *   async *listNumbers(req: { count: number }): AsyncIterable<{ n: number }> {
 *     for (let i = 0; i < req.count; i++) yield { n: i };
 *   }
 */
export function GrpcServerStream(name: string): MethodDecorator {
	return makeMethodDecorator(name, "server");
}

/**
 * Bind a method to a client-streaming gRPC handler.
 * The method receives `(requests: AsyncIterable<TReq>)` and returns `Promise<TRes>`.
 *
 * @example
 *   @GrpcClientStream("Sum")
 *   async sum(reqs: AsyncIterable<{ n: number }>): Promise<{ total: number }> {
 *     let total = 0;
 *     for await (const { n } of reqs) total += n;
 *     return { total };
 *   }
 */
export function GrpcClientStream(name: string): MethodDecorator {
	return makeMethodDecorator(name, "client");
}

/**
 * Bind a method to a bidirectional-streaming gRPC handler.
 * The method receives `(requests: AsyncIterable<TReq>)` and returns `AsyncIterable<TRes>`.
 *
 * @example
 *   @GrpcBidiStream("Echo")
 *   async *echo(reqs: AsyncIterable<{ msg: string }>): AsyncIterable<{ msg: string }> {
 *     for await (const { msg } of reqs) yield { msg: `echo: ${msg}` };
 *   }
 */
export function GrpcBidiStream(name: string): MethodDecorator {
	return makeMethodDecorator(name, "bidi");
}

// ── Metadata readers (internal) ─────────────────────────────────────────────

/** Read the gRPC service name. Internal. */
export function getGrpcServiceName(target: object): string | undefined {
	const t = (target as { prototype?: object }).prototype ?? target;
	return (t as Record<symbol, { name?: string } | undefined>)[
		GRPC_SERVICE_KEY
	]?.name;
}

/**
 * Read all decorated method entries for a gRPC service.
 * Returns `{ [propertyKey]: GrpcMethodEntry }`.
 * Internal — used by `GrpcService.prepare()`.
 */
export function getGrpcMethodEntries(
	target: object,
): Record<string, GrpcMethodEntry> {
	const t = (target as { prototype?: object }).prototype ?? target;
	return (
		((t as Record<symbol, unknown>)[GRPC_METHOD_KEY] as
			| Record<string, GrpcMethodEntry>
			| undefined) ?? {}
	);
}

/**
 * Read the bound method names for a gRPC service.
 * Returns `{ [propertyKey]: protoMethodName }`.
 * Kept for backwards compatibility.
 * @deprecated Use `getGrpcMethodEntries` for streaming type info.
 */
export function getGrpcMethodNames(target: object): Record<string, string> {
	const entries = getGrpcMethodEntries(target);
	const result: Record<string, string> = {};
	for (const [key, entry] of Object.entries(entries)) {
		result[key] = entry.protoName;
	}
	return result;
}
