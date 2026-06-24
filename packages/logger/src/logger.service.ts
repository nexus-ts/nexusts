/**
 * `Logger` — the user-facing logging interface.
 *
 * Logger is request-scoped via `AsyncLocalStorage`: any `logger.info(...)`
 * call inside a request automatically merges in fields set by
 * `logger.with({ requestId, userId, ... })`.
 *
 * Usage:
 *   constructor(@Inject(Logger.TOKEN) private logger: Logger) {}
 *
 *   this.logger.info({ userId: 'u-1' }, 'user signed in');
 *   this.logger.error({ err }, 'failed to save');
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { Inject, Injectable } from "@nexusts/core";
import { NullTransport, PinoTransport, PrettyTransport } from "./transports/index.js";
import type {
	LogContext,
	LoggerOptions,
	LogLevel,
	LogRecord,
	LogTransport,
} from "./types.js";

const LEVEL_RANK: Record<LogLevel, number> = {
	trace: 10,
	debug: 20,
	info: 30,
	warn: 40,
	error: 50,
	fatal: 60,
};

@Injectable()
export class Logger {
	/** DI token — use with `@Inject(Logger.TOKEN)`. */
	static readonly TOKEN = Symbol.for("nexus:Logger");

	transports: LogTransport[];
	silent: boolean;
	base: Record<string, unknown>;
	level: LogLevel;
	als = new AsyncLocalStorage<LogContext>();

	constructor(@Inject("LOGGER_OPTIONS") options: LoggerOptions = {}) {
		this.silent = options.silent ?? false;
		this.base = options.base ?? {};
		this.level = options.level ?? (process.env["NODE_ENV"] === "production" ? "info" : "debug");
		if (options.transports && options.transports.length > 0) {
			this.transports = options.transports;
		} else {
			const pretty = options.pretty ?? process.env["NODE_ENV"] !== "production";
			this.transports = [
				pretty
					? new PrettyTransport(this.level, this.base)
					: new PinoTransport(this.level, this.base),
			];
		}
	}

	// ===========================================================================
	// Level methods
	// ===========================================================================

	trace(meta: Record<string, unknown>, msg: string): void;
	trace(msg: string): void;
	trace(arg1: Record<string, unknown> | string, arg2?: string): void {
		this.emit("trace", arg1, arg2);
	}

	debug(meta: Record<string, unknown>, msg: string): void;
	debug(msg: string): void;
	debug(arg1: Record<string, unknown> | string, arg2?: string): void {
		this.emit("debug", arg1, arg2);
	}

	info(meta: Record<string, unknown>, msg: string): void;
	info(msg: string): void;
	info(arg1: Record<string, unknown> | string, arg2?: string): void {
		this.emit("info", arg1, arg2);
	}

	warn(meta: Record<string, unknown>, msg: string): void;
	warn(msg: string): void;
	warn(arg1: Record<string, unknown> | string, arg2?: string): void {
		this.emit("warn", arg1, arg2);
	}

	error(meta: Record<string, unknown>, msg: string): void;
	error(msg: string): void;
	error(arg1: Record<string, unknown> | string, arg2?: string): void {
		this.emit("error", arg1, arg2);
	}

	fatal(meta: Record<string, unknown>, msg: string): void;
	fatal(msg: string): void;
	fatal(arg1: Record<string, unknown> | string, arg2?: string): void {
		this.emit("fatal", arg1, arg2);
	}

	// ===========================================================================
	// Context
	// ===========================================================================

	/**
	 * Run `fn` inside a logger context — every log emitted during
	 * `fn()` is tagged with `meta`.
	 */
	with<T>(meta: LogContext, fn: () => T): T {
		const prev = this.als.getStore() ?? {};
		const next: LogContext = { ...prev, ...meta };
		return this.als.run(next, fn);
	}

	/** Read the current request context (or empty object). */
	get context(): LogContext {
		return this.als.getStore() ?? {};
	}

	// ===========================================================================
	// Child loggers
	// ===========================================================================

	/**
	 * Derive a child logger that always merges `bindings` into every
	 * record. Useful for service-scoped loggers.
	 */
	child(bindings: Record<string, unknown>): Logger {
		const child = Object.create(Logger.prototype) as Logger;
		child.transports = this.transports;
		child.silent = this.silent;
		child.base = { ...this.base, ...bindings };
		child.level = this.level;
		child.als = this.als;
		return child;
	}

	// ===========================================================================
	// Lifecycle
	// ===========================================================================

	/** Wait for transports to finish loading (Pino is async). */
	async ready(): Promise<void> {
		for (const t of this.transports) {
			const r = (t as { ready?: () => Promise<void> }).ready;
			if (r) await r.call(t);
		}
	}

	// ===========================================================================
	// Internal
	// ===========================================================================

	private emit(level: LogLevel, arg1: Record<string, unknown> | string, arg2?: string): void {
		if (this.silent) return;
		if (LEVEL_RANK[level] < LEVEL_RANK[this.level]) return;

		let meta: Record<string, unknown> = {};
		let msg: string;
		if (typeof arg1 === "string") {
			msg = arg1;
		} else {
			meta = arg1;
			msg = arg2 ?? "";
		}

		const ctx = this.als.getStore() ?? {};
		const record: LogRecord = {
			level,
			time: Date.now(),
			msg,
			...this.base,
			...meta,
			...ctx,
		};
		for (const t of this.transports) {
			try {
				t.write(record);
			} catch {
				// never let a logging error crash the request
			}
		}
	}
}

// Re-export NullTransport for tests.
export { NullTransport };