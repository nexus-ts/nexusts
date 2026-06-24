/**
 * `GrpcService` — the main gRPC service.
 *
 * Owns the @grpc/grpc-js server, the loaded proto definition, and
 * the registered service implementations. The service is
 * registered in the DI container; the user calls `start()` to
 * bind the server to a port.
 *
 *   const grpc = container.resolve(GrpcService);
 *   await grpc.start();
 *   // ...
 *   await grpc.stop();
 *
 * The framework also exposes a `client<T>('ServiceName')` helper
 * for creating typed clients against the same (or a different)
 * server. Clients returned by this method are async — each method
 * returns a Promise (unary) or AsyncIterable (streaming).
 */

import { existsSync } from "node:fs";
import {
	loadPackageDefinition,
	Server as GrpcServer,
	ServerCredentials,
} from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import {
	getGrpcMethodEntries,
	getGrpcServiceName,
} from "./decorators.js";
import type { GrpcConfig, GrpcStreamType } from "./types.js";

export const GRPC_SERVICE_TOKEN = Symbol.for("nexus:GrpcService");

export class GrpcService {
	readonly name = "grpc";
	#config: Required<Omit<GrpcConfig, "tls" | "onBound">> &
		Pick<GrpcConfig, "tls" | "onBound">;
	#server: GrpcServer | null = null;
	#bound = false;
	#proto: any = null;
	#instanceByService: Map<string, unknown> = new Map();
	#clientCtors: Map<string, new (url: string, creds: any) => any> = new Map();
	#resolve: (<T>(token: unknown) => T) | null = null;
	#host: string | null = null;
	#port: number | null = null;

	constructor(config: GrpcConfig) {
		this.#config = {
			protoPath: config.protoPath,
			package: config.package ?? "",
			services: config.services ?? [],
			port: config.port ?? 50051,
			host: config.host ?? "0.0.0.0",
			tls: config.tls,
			onBound: config.onBound,
		};
	}

	/** True if the server is currently bound to a port. */
	get isRunning(): boolean {
		return this.#bound;
	}

	/** The actual host the server bound to. `null` until start(). */
	get host(): string | null {
		return this.#host;
	}

	/** Inject a resolver function. Called by GrpcModule.forRoot(). */
	setResolver(resolve: <T>(token: unknown) => T): void {
		this.#resolve = resolve;
	}

	/** The actual port the server bound to. `null` until start(). */
	get port(): number | null {
		return this.#port;
	}

	/**
	 * Load the .proto file(s) and prepare the server.
	 * Idempotent — call once at boot, before `start()`.
	 */
	async prepare(resolve: <T>(token: unknown) => T): Promise<void> {
		// Load proto(s)
		const files = Array.isArray(this.#config.protoPath)
			? this.#config.protoPath
			: [this.#config.protoPath];
		for (const f of files) {
			if (!existsSync(f)) {
				throw new Error(
					`[grpc] proto file not found: ${f}. ` +
						`Resolve the path relative to your project root.`,
				);
			}
		}

		const merged: Record<string, unknown> = {};
		for (const f of files) {
			const def = protoLoader.loadSync(f, {
				keepCase: false,
				longs: String,
				enums: String,
				defaults: true,
				oneofs: true,
			});
			const loaded = loadPackageDefinition(def);
			Object.assign(merged, loaded);
		}
		this.#proto = merged;

		// Build the server and register services
		this.#server = new GrpcServer();
		for (const ServiceImpl of this.#config.services) {
			const svcName = getGrpcServiceName(ServiceImpl);
			if (!svcName) {
				throw new Error(
					`[grpc] service ${ServiceImpl.name} is missing @GrpcService(name)`,
				);
			}
			const methodEntries = getGrpcMethodEntries(ServiceImpl.prototype);

			// Walk the package path: proto.<package>.<serviceName>
			const segments = this.#config.package
				? this.#config.package.split(".")
				: [];
			segments.push(svcName);
			let svcSpec:
				| { service: any; prototype?: unknown }
				| Record<string, unknown>
				| undefined = this.#proto as Record<string, unknown>;
			for (const seg of segments) {
				if (svcSpec && typeof svcSpec === "object" && seg in svcSpec) {
					svcSpec = (svcSpec as Record<string, unknown>)[seg] as typeof svcSpec;
				} else {
					svcSpec = undefined;
					break;
				}
			}
			if (!svcSpec) {
				throw new Error(
					`[grpc] service "${segments.join(".")}" not found in proto definition. ` +
						`Check the .proto file and the @GrpcService name.`,
				);
			}

			// Resolve the implementation from the DI container
			const instance = resolve(ServiceImpl);
			this.#instanceByService.set(svcName, instance);

			// Build the handler map for every decorated method
			const handlers: Record<string, any> = {};
			for (const [methodKey, entry] of Object.entries(methodEntries)) {
				const fn = (
					instance as Record<string, (...args: unknown[]) => unknown>
				)[methodKey];
				if (typeof fn !== "function") continue;

				handlers[entry.protoName] = makeHandler(fn, instance, entry.streamType);
			}

			this.#server!.addService((svcSpec as { service: any }).service, handlers);
			this.#clientCtors.set(
				svcName,
				svcSpec as unknown as new (...a: any[]) => any,
			);
		}
	}

	/**
	 * Bind the server to the configured host/port.
	 */
	async start(): Promise<void> {
		if (this.#resolve && !this.#server) {
			await this.prepare(this.#resolve);
		}
		if (!this.#server) {
			throw new Error(
				"[grpc] start() called before prepare(). Call prepare() first " +
					"(typically done automatically by the DI module).",
			);
		}
		if (this.isRunning) return;

		const creds = this.#config.tls
			? ServerCredentials.createSsl(
					this.#config.tls.cert as Buffer,
					Array.isArray(this.#config.tls.key)
						? this.#config.tls.key[0]
						: (this.#config.tls.key as Buffer),
				)
			: ServerCredentials.createInsecure();

		const port: number = await new Promise((resolveP, rejectP) => {
			(this.#server as GrpcServer).bindAsync(
				`${this.#config.host}:${this.#config.port}`,
				creds,
				(err: Error | null, p: number) => {
					return err ? rejectP(err) : resolveP(p);
				},
			);
		});
		this.#host = this.#config.host;
		this.#port = port;
		this.#bound = true;
		console.log(
			`✓ gRPC server listening on ${this.#config.tls ? "https" : "http"}://${this.#host}:${this.#port}`,
		);
		this.#config.onBound?.(this.#host, this.#port);
	}

	/** Stop the server and release the port. */
	async stop(): Promise<void> {
		if (!this.#server) return;
		await Promise.race([
			new Promise<void>((resolveP, rejectP) => {
				(this.#server as GrpcServer).tryShutdown((err?: Error) =>
					err ? rejectP(err) : resolveP(),
				);
			}),
			new Promise<void>((resolveP) => setTimeout(resolveP, 1000)),
		]).catch(() => {
			(this.#server as GrpcServer).forceShutdown();
		});
		this.#server = null;
		this.#host = null;
		this.#port = null;
		this.#bound = false;
	}

	/**
	 * Build a typed client for a gRPC service.
	 *
	 * Method wrappers by call type:
	 * - **Unary**          — `(req: TReq) => Promise<TRes>`
	 * - **Server stream**  — `(req: TReq) => AsyncIterable<TRes>`
	 * - **Client stream**  — `(src: AsyncIterable<TReq>) => Promise<TRes>`
	 * - **Bidi stream**    — `(src: AsyncIterable<TReq>) => AsyncIterable<TRes>`
	 */
	client<T = Record<string, (...args: unknown[]) => unknown>>(
		serviceName: string,
		options: { url: string; tls?: boolean } = {
			url: `127.0.0.1:${this.#port ?? 50051}`,
		},
	): T {
		if (!this.#proto) {
			throw new Error(
				"[grpc] client() called before prepare(). " +
					"Did you forget to call grpc.start()?",
			);
		}
		const segments = this.#config.package
			? this.#config.package.split(".")
			: [];
		segments.push(serviceName);
		let svcSpec:
			| { service: any; prototype?: unknown }
			| Record<string, unknown>
			| undefined = this.#proto as Record<string, unknown>;
		for (const seg of segments) {
			if (svcSpec && typeof svcSpec === "object" && seg in svcSpec) {
				svcSpec = (svcSpec as Record<string, unknown>)[seg] as typeof svcSpec;
			} else {
				svcSpec = undefined;
				break;
			}
		}
		if (!svcSpec) {
			throw new Error(
				`[grpc] service "${segments.join(".")}" not found in proto definition`,
			);
		}

		const ClientCtor = svcSpec as unknown as {
			new (url: string, creds: unknown): Record<
				string,
				(...args: unknown[]) => unknown
			>;
			service: Record<
				string,
				{ requestStream: boolean; responseStream: boolean }
			>;
		};

		const creds = options.tls
			? // @ts-ignore
				require("@grpc/grpc-js").credentials.createSsl()
			: // @ts-ignore
				require("@grpc/grpc-js").credentials.createInsecure();

		const underlying = new ClientCtor(options.url, creds);
		const wrapped: Record<string, (...args: unknown[]) => unknown> = {};

		for (const [protoName, methodDef] of Object.entries(ClientCtor.service)) {
			const { requestStream, responseStream } = methodDef;
			// gRPC proto names are PascalCase; JS clients expose camelCase
			const methodName =
				protoName.charAt(0).toLowerCase() + protoName.slice(1);

			// @ts-ignore — method exists on prototype at runtime
			const fn = underlying[methodName];
			if (typeof fn !== "function") continue;

			const streamType = classifyStreamType(requestStream, responseStream);
			wrapped[methodName] = makeClientMethod(fn, underlying, streamType);
		}

		return wrapped as unknown as T;
	}
}

// ── Server-side handler factories ─────────────────────────────────────────────

function makeHandler(
	fn: (...args: unknown[]) => unknown,
	instance: unknown,
	streamType: GrpcStreamType,
): (...args: unknown[]) => void {
	switch (streamType) {
		case "unary":
			return makeUnaryHandler(fn, instance);
		case "server":
			return makeServerStreamHandler(fn, instance);
		case "client":
			return makeClientStreamHandler(fn, instance);
		case "bidi":
			return makeBidiStreamHandler(fn, instance);
	}
}

/** Unary: (call, callback) => void */
function makeUnaryHandler(
	fn: (...args: unknown[]) => unknown,
	instance: unknown,
) {
	return (call: unknown, callback: (err: unknown, res?: unknown) => void) => {
		const req = (call as { request: unknown }).request;
		let result: unknown;
		try {
			result = fn.call(instance, req);
		} catch (syncErr) {
			const e = syncErr as Error & { code?: number };
			callback({ code: e.code ?? 13, details: e.message });
			return;
		}
		Promise.resolve(result).then(
			(value) => callback(null, value),
			(err: Error & { code?: number }) => {
				callback({ code: err.code ?? 13, details: err.message });
			},
		);
	};
}

/** Server streaming: (call) => void  — method returns AsyncIterable<TRes> */
function makeServerStreamHandler(
	fn: (...args: unknown[]) => unknown,
	instance: unknown,
) {
	return (call: any) => {
		const req = call.request;
		let iter: AsyncIterable<unknown>;
		try {
			iter = fn.call(instance, req) as AsyncIterable<unknown>;
		} catch (syncErr) {
			const e = syncErr as Error & { code?: number };
			call.emit("error", { code: e.code ?? 13, details: e.message });
			return;
		}
		(async () => {
			for await (const item of iter) {
				call.write(item);
			}
			call.end();
		})().catch((err: Error & { code?: number }) => {
			call.emit("error", { code: err?.code ?? 13, details: err?.message ?? "Internal error" });
		});
	};
}

/** Client streaming: (call, callback) => void — method takes AsyncIterable<TReq> */
function makeClientStreamHandler(
	fn: (...args: unknown[]) => unknown,
	instance: unknown,
) {
	return (call: any, callback: (err: unknown, res?: unknown) => void) => {
		async function* iterRequest() {
			for await (const msg of call) {
				yield msg;
			}
		}
		Promise.resolve(fn.call(instance, iterRequest())).then(
			(result) => callback(null, result),
			(err: Error & { code?: number }) => {
				callback({ code: err?.code ?? 13, details: err?.message ?? "Internal error" });
			},
		);
	};
}

/** Bidirectional streaming: (call) => void — method takes AsyncIterable<TReq>, returns AsyncIterable<TRes> */
function makeBidiStreamHandler(
	fn: (...args: unknown[]) => unknown,
	instance: unknown,
) {
	return (call: any) => {
		// Use event-based reading — Symbol.asyncIterator on ServerDuplexStream
		// conflicts with concurrent call.write() on the same object.
		const queue: unknown[] = [];
		let readEnded = false;
		let readError: Error | null = null;
		let readWakeup: (() => void) | null = null;
		const notifyRead = () => { readWakeup?.(); readWakeup = null; };

		call.on("data",  (msg: unknown) => { queue.push(msg); notifyRead(); });
		call.on("end",   () => { readEnded = true; notifyRead(); });
		call.on("error", (err: Error) => { readError = err; notifyRead(); });

		async function* iterRequest() {
			while (true) {
				while (queue.length > 0) yield queue.shift()!;
				if (readEnded) break;
				if (readError) throw readError;
				await new Promise<void>((r) => { readWakeup = r; });
			}
		}

		let iter: AsyncIterable<unknown>;
		try {
			iter = fn.call(instance, iterRequest()) as AsyncIterable<unknown>;
		} catch (syncErr) {
			const e = syncErr as Error & { code?: number };
			call.emit("error", { code: e.code ?? 13, details: e.message });
			return;
		}
		(async () => {
			for await (const item of iter) {
				call.write(item);
			}
			call.end();
		})().catch((err: Error & { code?: number }) => {
			call.emit("error", { code: err?.code ?? 13, details: err?.message ?? "Internal error" });
		});
	};
}

// ── Client-side method wrappers ───────────────────────────────────────────────

function classifyStreamType(
	requestStream: boolean,
	responseStream: boolean,
): GrpcStreamType {
	if (!requestStream && !responseStream) return "unary";
	if (!requestStream && responseStream) return "server";
	if (requestStream && !responseStream) return "client";
	return "bidi";
}

function makeClientMethod(
	fn: (...args: unknown[]) => unknown,
	underlying: Record<string, (...args: unknown[]) => unknown>,
	streamType: GrpcStreamType,
): (...args: unknown[]) => unknown {
	switch (streamType) {
		case "unary":
			return (req: unknown) =>
				new Promise((resolveP, rejectP) => {
					(fn as any).call(underlying, req, (err: Error | null, res: unknown) => {
						if (err) rejectP(err);
						else resolveP(res);
					});
				});

		case "server":
			return (req: unknown): AsyncIterable<unknown> => {
				const call = (fn as any).call(underlying, req);
				return readableToAsyncIter(call);
			};

		case "client":
			return (source: unknown): Promise<unknown> =>
				new Promise((resolveP, rejectP) => {
					const call = (fn as any).call(
						underlying,
						(err: Error | null, res: unknown) => {
							if (err) rejectP(err);
							else resolveP(res);
						},
					);
					(async () => {
						for await (const msg of source as AsyncIterable<unknown>) {
							call.write(msg);
						}
						call.end();
					})().catch(rejectP);
				});

		case "bidi":
			return (source: unknown): AsyncIterable<unknown> =>
				bidiClientImpl(fn as any, underlying, source as AsyncIterable<unknown>);
	}
}

async function* bidiClientImpl(
	fn: (...args: any[]) => any,
	underlying: Record<string, (...args: unknown[]) => unknown>,
	source: AsyncIterable<unknown>,
): AsyncIterable<unknown> {
	const call = fn.call(underlying);

	// Collect responses via event listeners into a queue so that
	// the write-side can run concurrently without stream backpressure
	// issues that arise from using Symbol.asyncIterator on a Duplex.
	const queue: unknown[] = [];
	let ended = false;
	let streamError: Error | null = null;
	let wakeup: (() => void) | null = null;

	const notify = () => { wakeup?.(); wakeup = null; };
	call.on("data", (msg: unknown) => { queue.push(msg); notify(); });
	call.on("end",  () => { ended = true; notify(); });
	call.on("error", (err: Error) => { streamError = err; notify(); });

	// Write from source in background — runs concurrently with the read loop
	const writeTask = (async () => {
		try {
			for await (const msg of source) {
				call.write(msg);
			}
		} finally {
			call.end();
		}
	})();

	// Yield messages as they arrive
	while (true) {
		while (queue.length > 0) yield queue.shift()!;
		if (ended) break;
		if (streamError) throw streamError;
		await new Promise<void>((r) => { wakeup = r; });
	}
	await writeTask;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a gRPC ClientReadableStream (or DuplexStream) to an AsyncIterable.
 * grpc-js streams extend Node.js Readable, which supports `for await...of`
 * via Symbol.asyncIterator.
 */
async function* readableToAsyncIter(stream: any): AsyncIterable<unknown> {
	// Use Symbol.asyncIterator if available (Node.js 10+ / Bun)
	if (typeof stream[Symbol.asyncIterator] === "function") {
		for await (const msg of stream) {
			yield msg;
		}
		return;
	}
	// Fallback: event-based conversion
	let done = false;
	let error: Error | null = null;
	const buffer: unknown[] = [];
	let resolve: (() => void) | null = null;

	stream.on("data", (msg: unknown) => {
		buffer.push(msg);
		resolve?.();
		resolve = null;
	});
	stream.on("end", () => {
		done = true;
		resolve?.();
		resolve = null;
	});
	stream.on("error", (err: Error) => {
		error = err;
		resolve?.();
		resolve = null;
	});

	while (true) {
		while (buffer.length > 0) {
			yield buffer.shift()!;
		}
		if (done) break;
		if (error) throw error;
		await new Promise<void>((r) => {
			resolve = r;
		});
	}
}

export default GrpcService;
