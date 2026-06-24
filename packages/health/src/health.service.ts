/**
 * `HealthCheckService` — runs a list of indicators in parallel and
 * aggregates the result.
 *
 * Typically injected into a controller that mounts the
 * `/health/live`, `/health/ready`, `/health/startup` endpoints.
 */

import { Inject, Injectable } from "@nexusts/core";
import {
	DiskHealthIndicator,
	HttpHealthIndicator,
	MemoryHealthIndicator,
} from "./indicators/index.js";
import type {
	HealthCheckEntry,
	HealthCheckKind,
	HealthCheckResult,
	HealthConfig,
	HealthIndicator,
	HealthIndicatorResult,
} from "./types.js";

@Injectable()
export class HealthCheckService {
	/** DI token — use with `@Inject(HealthCheckService.TOKEN)`. */
	static readonly TOKEN = Symbol.for("nexus:HealthCheckService");

	/** Registered indicators keyed by name. */
	indicators = new Map<string, HealthIndicator>();
	/** Public, read-only view of the resolved config. */
	config: HealthConfig;

	constructor(@Inject("HEALTH_CONFIG") config: HealthConfig = {}) {
		this.config = config;
		this.registerBuiltIns();
	}

	/**
	 * Register an indicator at runtime (e.g. a DB-specific indicator
	 * from a feature module).
	 */
	register(indicator: HealthIndicator): void {
		this.indicators.set(indicator.name, indicator);
	}

	/** Remove a registered indicator. */
	unregister(name: string): boolean {
		return this.indicators.delete(name);
	}

	/** List registered indicator names. */
	list(): string[] {
		return [...this.indicators.keys()];
	}

	/**
	 * Run all registered indicators in parallel and aggregate.
	 *
	 *   await health.check()  → 200 if all 'up', 503 if any 'down'.
	 */
	async check(kind: HealthCheckKind = "readiness"): Promise<HealthCheckResult> {
		const start = Date.now();
		const indicators = [...this.indicators.values()];
		const settled = await Promise.allSettled(
			indicators.map((i) => i.check()),
		);
		const entries: HealthCheckEntry[] = indicators.map((i, idx) => {
			const s = settled[idx]!;
			if (s.status === "fulfilled") {
				return { name: i.name, result: s.value };
			}
			const err = s.reason;
			return {
				name: i.name,
				result: {
					status: "down",
					message: err instanceof Error ? err.message : String(err),
				},
			};
		});
		const status = entries.every((e) => e.result.status === "up")
			? "up"
			: "down";
		return {
			status,
			results: entries,
			durationMs: Date.now() - start,
			timestamp: new Date().toISOString(),
		};
	}

	// ===========================================================================
	// Internal
	// ===========================================================================

	private registerBuiltIns(): void {
		const bi = this.config.builtIn ?? {};
		if (bi.memory) {
			const opts = typeof bi.memory === "object" ? bi.memory : {};
			this.register(new MemoryHealthIndicator(opts));
		}
		if (bi.disk) {
			this.register(new DiskHealthIndicator(bi.disk));
		}
		if (bi.http) {
			// Default name is derived from the URL host.
			const host = (() => {
				try {
					return new URL(bi.http.url).host || "http";
				} catch {
					return "http";
				}
			})();
			this.register(new HttpHealthIndicator(host, bi.http));
		}
	}
}