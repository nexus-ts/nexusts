/**
 * Built-in health indicators.
 *
 * Each one extends `HealthIndicator` and lives in this folder so the
 * core service stays small. New built-ins (DB, Redis, ...) can be
 * added here.
 */

export { DrizzleHealthIndicator } from "./drizzle.js";

import type { HealthIndicator, HealthIndicatorResult } from "../types.js";

/**
 * Memory pressure indicator. Reports `'down'` when heap usage
 * exceeds the configured threshold (default: 0.9 = 90%).
 */
export class MemoryHealthIndicator implements HealthIndicator {
	readonly name = "memory";
	#threshold: number;

	constructor(options: { threshold?: number } = {}) {
		this.#threshold = options.threshold ?? 0.9;
	}

	async check(): Promise<HealthIndicatorResult> {
		const mem = process.memoryUsage();
		const total = mem.heapTotal;
		const used = mem.heapUsed;
		const ratio = total > 0 ? used / total : 0;
		if (ratio > this.#threshold) {
			return {
				status: "down",
				message: `heap usage ${(ratio * 100).toFixed(1)}% exceeds threshold ${(this.#threshold * 100).toFixed(0)}%`,
				data: { heapUsed: used, heapTotal: total, ratio },
			};
		}
		return {
			status: "up",
			data: { heapUsed: used, heapTotal: total, ratio },
		};
	}
}

/**
 * Disk space indicator. Reports `'down'` when free fraction falls
 * below the threshold.
 */
export class DiskHealthIndicator implements HealthIndicator {
	readonly name = "disk";
	#threshold: number;
	#path: string;

	constructor(options: { threshold?: number; path?: string } = {}) {
		this.#threshold = options.threshold ?? 0.1; // 10% free
		this.#path = options.path ?? process.cwd();
	}

	async check(): Promise<HealthIndicatorResult> {
		try {
			// Best-effort: rely on Bun / Node to throw if statfs is unsupported.
			// We use a tiny shell-out only when the runtime exposes one.
			// Fall back to 'up' if we can't tell.
			const statfs = (await import("node:fs/promises")
				.then((m) => m.statfs)
				.catch(() => null)) as
				| ((
						p: string,
				  ) => Promise<{
						bavail: number;
						bsize: number;
						blocks: number;
						bfree: number;
				  }>)
				| null;
			if (!statfs) {
				return { status: "up", message: "statfs unavailable; skipping" };
			}
			const s = await statfs(this.#path);
			const free = s.bavail * s.bsize;
			const total = s.blocks * s.bsize;
			const freeRatio = total > 0 ? free / total : 1;
			if (freeRatio < this.#threshold) {
				return {
					status: "down",
					message: `disk free ${(freeRatio * 100).toFixed(1)}% below threshold ${(this.#threshold * 100).toFixed(0)}%`,
					data: { free, total, freeRatio, path: this.#path },
				};
			}
			return {
				status: "up",
				data: { free, total, freeRatio, path: this.#path },
			};
		} catch (err) {
			return {
				status: "down",
				message: err instanceof Error ? err.message : String(err),
			};
		}
	}
}

/**
 * HTTP ping indicator. GETs a URL and reports `'up'` on any 2xx.
 */
export class HttpHealthIndicator implements HealthIndicator {
	readonly name: string;
	#url: string;
	#timeoutMs: number;

	constructor(name: string, options: { url: string; timeoutMs?: number }) {
		this.name = name;
		this.#url = options.url;
		this.#timeoutMs = options.timeoutMs ?? 3000;
	}

	async check(): Promise<HealthIndicatorResult> {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), this.#timeoutMs);
		try {
			const res = await fetch(this.#url, { signal: ctrl.signal });
			if (res.status >= 200 && res.status < 300) {
				return { status: "up", data: { status: res.status } };
			}
			return {
				status: "down",
				message: `HTTP ${res.status}`,
				data: { status: res.status },
			};
		} catch (err) {
			return {
				status: "down",
				message: err instanceof Error ? err.message : String(err),
			};
		} finally {
			clearTimeout(timer);
		}
	}
}

/**
 * User-supplied ping indicator. Wrap a `ping()` function — typically
 * a DB driver's health check.
 *
 *   new CustomPingIndicator('database', async () => db.ping())
 */
export class CustomPingIndicator implements HealthIndicator {
	readonly name: string;
	#ping: () => Promise<void> | void;
	#timeoutMs: number;

	constructor(
		name: string,
		ping: () => Promise<void> | void,
		timeoutMs = 3000,
	) {
		this.name = name;
		this.#ping = ping;
		this.#timeoutMs = timeoutMs;
	}

	async check(): Promise<HealthIndicatorResult> {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), this.#timeoutMs);
		try {
			await Promise.race([
				Promise.resolve(this.#ping()),
				new Promise<never>((_, reject) =>
					setTimeout(
						() =>
							reject(new Error(`ping timed out after ${this.#timeoutMs}ms`)),
						this.#timeoutMs,
					),
				),
			]);
			return { status: "up" };
		} catch (err) {
			return {
				status: "down",
				message: err instanceof Error ? err.message : String(err),
			};
		} finally {
			clearTimeout(timer);
		}
	}
}
