/**
 * `Logger` — the user-facing logging interface.
 *
 * Logger is request-scoped via `AsyncLocalStorage`: any `logger.info(...)`
 * call inside a request automatically merges in fields set by
 * `logger.with({ requestId, userId, ... })`.
 *
 * Usage:
 *   @Inject(Logger.TOKEN) declare logger: Logger;
 *
 *   this.logger.info({ userId: 'u-1' }, 'user signed in');
 *   this.logger.error({ err }, 'failed to save');
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { Inject, Injectable } from "@nexusts/core";
import type {
	LogLevel,
	LogRecord,
	LogTransport,
	LoggerOptions,
	LogContext,
} from "./types.js";
import { PinoTransport, PrettyTransport, NullTransport } from "./transports/index.js";

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

	/** Logger options — injected by DI container. */
	@Inject("LOGGER_OPTIONS") declare private options: LoggerOptions;

	private _transports: LogTransport[] = [];
	private _silent = false;
	private _base: Record<string, unknown> = {};
	private _level: LogLevel = "info";
	private _initialized = false;
	als = new AsyncLocalStorage<LogContext>();

	private init(): void {
		if (this._initialized) return;
		this._initialized = true;
		const opts = this.options ?? {};
		this._silent = opts.silent ?? false;
		this._base = opts.base ?? {};
		this._level = opts.level ?? (process.env.NODE_ENV === "production" ? "info" : "debug");
		// Only set default transports if none have been assigned externally.
		if (this._transports.length === 0) {
			if (opts.transports && opts.transports.length > 0) {
				this._transports = opts.transports;
			} else {
				const pretty = opts.pretty ?? process.env.NODE_ENV !== "production";
				this._transports = [
					pretty
						? new PrettyTransport(this._level, this._base)
						: new PinoTransport(this._level, this._base),
				];
			}
		}
	}

	get silent(): boolean { this.init(); return this._silent; }
	set silent(v: boolean) { this.init(); this._silent = v; }

	get base(): Record<string, unknown> { this.init(); return this._base; }
	set base(v: Record<string, unknown>) { this.init(); this._base = v; }

	get level(): LogLevel { this.init(); return this._level; }
	set level(v: LogLevel) { this.init(); this._level = v; }

	get transports(): LogTransport[] { this.init(); return this._transports; }
	set transports(v: LogTransport[]) { this._transports = v; this.init(); }

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
		this.init();
		const child = Object.create(Logger.prototype) as Logger;
		child._transports = this._transports;
		child._silent = this._silent;
		child._base = { ...this._base, ...bindings };
		child._level = this._level;
		child.als = this.als;
		child._initialized = true;
		return child;
	}

	// ===========================================================================
	// Lifecycle
	// ===========================================================================

	/** Wait for transports to finish loading (Pino is async). */
	async ready(): Promise<void> {
		this.init();
		for (const t of this._transports) {
			const r = (t as { ready?: () => Promise<void> }).ready;
			if (r) await r.call(t);
		}
	}

	// ===========================================================================
	// Internal
	// ===========================================================================

	private emit(level: LogLevel, arg1: Record<string, unknown> | string, arg2?: string): void {
		this.init();
		if (this._silent) return;
		if (LEVEL_RANK[level] < LEVEL_RANK[this._level]) return;

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
			...this._base,
			...meta,
			...ctx,
		};
		for (const t of this._transports) {
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
