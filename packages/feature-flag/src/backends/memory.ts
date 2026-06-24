import type { FlagContext, FlagDefinition, FeatureFlagBackend } from "../types.js";

/** djb2 hash → deterministic 0-1 float for rollout bucketing. */
function hashFloat(s: string): number {
	let h = 5381;
	for (let i = 0; i < s.length; i++) {
		h = Math.imul(h, 33) ^ s.charCodeAt(i);
	}
	return (h >>> 0) / 0xffffffff;
}

/** In-process feature flag backend — no external dependencies. */
export class MemoryFlagBackend implements FeatureFlagBackend {
	#flags = new Map<string, FlagDefinition>();

	constructor(initial: Record<string, FlagDefinition | boolean> = {}) {
		for (const [k, v] of Object.entries(initial)) {
			this.#flags.set(k, typeof v === "boolean" ? { enabled: v } : v);
		}
	}

	setFlag(flagName: string, definition: FlagDefinition | boolean): void {
		this.#flags.set(
			flagName,
			typeof definition === "boolean" ? { enabled: definition } : definition,
		);
	}

	getFlag(flagName: string): FlagDefinition | undefined {
		return this.#flags.get(flagName);
	}

	async isEnabled(flagName: string, context?: FlagContext): Promise<boolean> {
		const def = this.#flags.get(flagName);
		if (!def) return false;

		const id = context?.userId ?? context?.tenantId ?? context?.key ?? "";

		// Denylist has highest priority
		if (id && def.denylist?.includes(id)) return false;

		// Allowlist always wins after denylist
		if (id && def.allowlist?.includes(id)) return true;

		// Base enabled gate
		if (def.enabled === false) return false;

		// Rollout: deterministic hash bucketing
		if (def.rollout !== undefined && def.rollout < 1) {
			if (!id) return def.rollout > 0;
			return hashFloat(`${flagName}:${id}`) < def.rollout;
		}

		return def.enabled ?? true;
	}
}
