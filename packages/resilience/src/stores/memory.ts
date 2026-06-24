import type { CircuitSnapshot, ResilienceStore } from "../types.js";

/** In-process store — default, no external dependencies. */
export class MemoryResilienceStore implements ResilienceStore {
	#snapshots = new Map<string, CircuitSnapshot>();

	async getSnapshot(name: string): Promise<CircuitSnapshot | null> {
		return this.#snapshots.get(name) ?? null;
	}

	async saveSnapshot(name: string, snapshot: CircuitSnapshot): Promise<void> {
		this.#snapshots.set(name, { ...snapshot });
	}
}
