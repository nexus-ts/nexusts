/**
 * Public types for `nexusjs/grpc`.
 *
 * `nexusjs/grpc` is a reflection-based gRPC integration. The user
 * provides a `.proto` file and a service implementation class
 * with `@GrpcService` / `@GrpcMethod` decorators. The framework
 * loads the proto at runtime and wires the methods to the
 * implementation.
 *
 * The gRPC server runs on a separate port (it needs HTTP/2) and
 * is started manually via `GrpcService.start()`. This keeps the
 * Hono HTTP/1 server independent and lets the user choose the
 * port.
 *
 * Cross-runtime: works on Bun and Node via `@grpc/grpc-js`
 * (which is built on Node's `http2` module — Bun supports
 * this via Node-API compatibility).
 */

import type { ServiceDefinition, UntypedServiceImplementation } from "@grpc/grpc-js";

/* ------------------------------------------------------------------ *
 * Streaming types
 * ------------------------------------------------------------------ */

/**
 * The RPC streaming classification, matching gRPC's four call types:
 * - `unary`  — request → response            (@GrpcMethod)
 * - `server` — request → stream<response>    (@GrpcServerStream)
 * - `client` — stream<request> → response    (@GrpcClientStream)
 * - `bidi`   — stream<request> → stream<res> (@GrpcBidiStream)
 */
export type GrpcStreamType = "unary" | "server" | "client" | "bidi";

/** Internal method entry stored by the decorator. */
export interface GrpcMethodEntry {
	/** Method name as declared in the .proto file (PascalCase). */
	protoName: string;
	/** Streaming classification. */
	streamType: GrpcStreamType;
}

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

export interface GrpcConfig {
	/**
	 * Path to one or more `.proto` files. Paths are resolved
	 * against the process's cwd.
	 */
	protoPath: string | string[];

	/**
	 * Optional override for the proto package name. If omitted,
	 * the package is taken from the `.proto` file. Useful when
	 * the .proto file has multiple `package` declarations.
	 */
	package?: string;

	/**
	 * Service implementations to register. Each class must be
	 * decorated with `@GrpcService('Name')` and have its methods
	 * decorated with `@GrpcMethod('ProtoMethodName')`.
	 */
	services: Array<new (...args: never[]) => unknown>;

	/** Port to bind the gRPC server to. Default: 50051. */
	port?: number;

	/** Host to bind the gRPC server to. Default: "0.0.0.0". */
	host?: string;

	/**
	 * TLS credentials. If omitted, the server runs in plaintext
	 * (h2c). For production, provide a `tls: { cert, key }` pair.
	 */
	tls?: {
		cert: Buffer | string;
		key: Buffer | string;
	};

	/**
	 * Optional callback that runs after the server is bound. Useful
	 * for tests that need to know the actual port (when `port: 0`
	 * is used).
	 */
	onBound?: (host: string, port: number) => void;
}

/* ------------------------------------------------------------------ *
 * Method metadata
 * ------------------------------------------------------------------ */

export interface GrpcMethodMeta {
	/** Service name (matches `@GrpcService(name)`). */
	serviceName: string;
	/** Method name as it appears in the .proto file. */
	methodName: string;
	/** Streaming classification. */
	streamType: GrpcStreamType;
}

/* ------------------------------------------------------------------ *
 * Client
 * ------------------------------------------------------------------ */

/**
 * Build a typed client for a gRPC service. The returned object
 * has one method per service method defined in the .proto file,
 * with the right TypeScript signature.
 */
export type GrpcClient<T> = T;

export interface GrpcClientOptions {
	/** Service URL (e.g. "localhost:50051"). */
	url: string;
	/** Use TLS. Default: false (insecure). */
	tls?: boolean;
}

/* ------------------------------------------------------------------ *
 * Internal — re-exports for the runtime layer
 * ------------------------------------------------------------------ */

export type { ServiceDefinition, UntypedServiceImplementation };
