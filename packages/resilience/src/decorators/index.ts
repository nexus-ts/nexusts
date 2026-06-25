/**
 * Decorator barrel for `nexusjs/resilience`.
 *
 * The three method decorators (`@Retry`, `@CircuitBreaker`,
 * `@Bulkhead`) plus the combined `@Resilient` decorator are
 * implemented as **metadata-only** decorators — they write options
 * to the method's `reflect-metadata` store, and an
 * `ResilienceInterceptor` (or a runtime hook) reads and applies
 * them at call time.
 *
 *   @Retry({ attempts: 3, backoff: "exponential" })
 *   async fetchUser(id: string) { ... }
 *
 *   @CircuitBreaker({ threshold: 0.5, timeout: 30_000 })
 *   async callStripe() { ... }
 *
 *   @Bulkhead({ maxConcurrent: 5 })
 *   async callExpensive() { ... }
 *
 *   @Resilient({ retry: {...}, circuit: {...}, bulkhead: {...} })
 *   async criticalCall() { ... }
 */
import type {
	BulkheadConfig,
	CircuitBreakerConfig,
	ResilientConfig,
	RetryConfig,
} from "../types.js";
import { RESILIENCE_META } from "../types.js";

// Use `import type` for the service to avoid a circular import:
// `resilience.service.ts` → `decorators/index.ts` → `resilience.service.ts`.
// At runtime, the dependency is set via `setResilienceService()` so
// only the *type* needs to be visible at type-check time.
import type { ResilienceService } from "../resilience.service.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

// Per-method metadata kinds. Each decorator stores its own
// payload under a separate key so a method can have e.g. `@Retry`
// and `@CircuitBreaker` simultaneously.
const KEY_RETRY = Symbol.for("nexus:Resilience:Retry");
const KEY_CIRCUIT = Symbol.for("nexus:Resilience:Circuit");
const KEY_BULKHEAD = Symbol.for("nexus:Resilience:Bulkhead");
const KEY_RESILIENT = Symbol.for("nexus:Resilience:Resilient");

export interface RetryMeta {
	config: RetryConfig;
	/** Captured bound `this` at call time. */
}
export interface CircuitMeta {
	config: CircuitBreakerConfig;
}
export interface BulkheadMeta {
	config: BulkheadConfig;
}
export interface ResilientMeta {
	config: ResilientConfig;
}

/** Read the metadata for a given method. */
export function getMethodRetry(
	target: object,
	propertyKey: string | symbol,
): RetryConfig | undefined {
	return safeGetMeta(KEY_RETRY, target, propertyKey) as RetryConfig | undefined;
}

export function getMethodCircuit(
	target: object,
	propertyKey: string | symbol,
): CircuitBreakerConfig | undefined {
	return safeGetMeta(KEY_CIRCUIT, target, propertyKey) as
		| CircuitBreakerConfig
		| undefined;
}

export function getMethodBulkhead(
	target: object,
	propertyKey: string | symbol,
): BulkheadConfig | undefined {
	return safeGetMeta(KEY_BULKHEAD, target, propertyKey) as
		| BulkheadConfig
		| undefined;
}

export function getMethodResilient(
	target: object,
	propertyKey: string | symbol,
): ResilientConfig | undefined {
	return safeGetMeta(KEY_RESILIENT, target, propertyKey) as
		| ResilientConfig
		| undefined;
}

// ============================================================================
// Decorator factories
// ============================================================================

function makeMethodDecorator<TConfig>(
	key: symbol,
	extract: (config: TConfig) => unknown,
): (config: TConfig) => MethodDecorator {
	return (config: TConfig): MethodDecorator => {
		return (
			_target: object,
			propertyKey: string | symbol,
			_descriptor: TypedPropertyDescriptor<any>,
		): void => {
			// Metadata-only — we don't touch `descriptor.value`
			// here because Bun 1.3's stage-3 decorator mode (the
			// default) doesn't pass it. Instead, the framework
			// reads the metadata at controller-mount time and
			// calls `applyResilience()` to wrap the method.
			safeDefineMeta(key, extract(config), _target, propertyKey);
		};
	};
}

// Used by `applyResilience()` below (exported for users who want
// to wire it into their own framework hook). Not invoked from the
// decorator factories themselves — that would require reading
// `descriptor.value` in the decorator body, which Bun's stage-3
// decorator mode (the default in Bun 1.3+) doesn't supply.
export function getResilientMetadata(target: object, propertyKey: string | symbol) {
	const resilient = getMethodResilient(target, propertyKey);
	const retry = resilient?.retry ?? getMethodRetry(target, propertyKey);
	const circuit = resilient?.circuit ?? getMethodCircuit(target, propertyKey);
	const bulkhead = resilient?.bulkhead ?? getMethodBulkhead(target, propertyKey);
	return { retry, circuit, bulkhead };
}

// Used by `applyResilience()` below; same rationale as above.
export function makeResilientWrapper(
	original: Function,
	resolveMeta: () => {
		retry?: RetryConfig;
		circuit?: CircuitBreakerConfig;
		bulkhead?: BulkheadConfig;
	},
): Function {
	return function (this: unknown, ...args: any[]) {
		const meta = resolveMeta();
		if (!meta.retry && !meta.circuit && !meta.bulkhead) {
			return original.apply(this, args);
		}
		const svc = getResilienceService();
		if (!svc) {
			return original.apply(this, args);
		}
		const name = original.name || "anonymous";

		const fn = () => original.apply(this, args);
		const runOnce = () =>
			meta.bulkhead
				? svc.getOrCreateBulkhead(name, meta.bulkhead).execute(fn)
				: fn();
		const runWithCircuit = () =>
			meta.circuit
				? svc.getOrCreateCircuit(name, meta.circuit).execute(runOnce)
				: runOnce();
		const runWithRetry = () =>
			meta.retry ? svc.retry(runWithCircuit, meta.retry) : runWithCircuit();

		return runWithRetry();
	};
}

/**
 * Module-level handle to the `ResilienceService`. Set by
 * `ResilienceModule.forRoot()` so the eager-decorator path can
 * access the registry without each method carrying the DI token.
 */
let _resilienceService: ResilienceService | null = null;

/** Public — used by `ResilienceModule` to register the service. */
export function setResilienceService(svc: ResilienceService | null): void {
	_resilienceService = svc;
}

/** Public — used by the eager decorator path. */
export function getResilienceService(): ResilienceService | null {
	return _resilienceService;
}

/** `@Retry(config)` — retry the method with backoff. */
export const Retry = makeMethodDecorator<RetryConfig>(KEY_RETRY, (c) => c);

/** `@CircuitBreaker(config)` — wrap the method in a named circuit. */
export const CircuitBreaker = makeMethodDecorator<CircuitBreakerConfig>(
	KEY_CIRCUIT,
	(c) => c,
);

/** `@Bulkhead(config)` — limit concurrency for the method. */
export const Bulkhead = makeMethodDecorator<BulkheadConfig>(KEY_BULKHEAD, (c) => c);

/** `@Resilient(config)` — combine retry + circuit + bulkhead. */
export const Resilient = makeMethodDecorator<ResilientConfig>(
	KEY_RESILIENT,
	(c) => c,
);

// ============================================================================
// `applyResilience()` — runtime hook
// ============================================================================

/**
 * Read all `@Resilient` / `@Retry` / `@CircuitBreaker` / `@Bulkhead`
 * metadata on `target` and apply the corresponding wrappers around
 * `descriptor.value`. The framework wires this up via
 * `ResilienceService` when controllers are mounted.
 */
export function applyResilience(
	target: object,
	propertyKey: string | symbol,
	descriptor: TypedPropertyDescriptor<any>,
	svc: import("../resilience.service.js").ResilienceService,
): TypedPropertyDescriptor<any> {
	if (!descriptor.value || typeof descriptor.value !== "function") {
		return descriptor;
	}
	const original = descriptor.value;

	const resilient = getMethodResilient(target, propertyKey);
	const retry = resilient?.retry ?? getMethodRetry(target, propertyKey);
	const circuit = resilient?.circuit ?? getMethodCircuit(target, propertyKey);
	const bulkhead = resilient?.bulkhead ?? getMethodBulkhead(target, propertyKey);

	if (!retry && !circuit && !bulkhead) {
		return descriptor; // No resilience — leave the method alone.
	}

	const wrapped = async function (this: unknown, ...args: any[]) {
		const name = String(propertyKey);
		const fn = () => original.apply(this, args);

		const runOnce = async () => {
			if (bulkhead) {
				const bh = svc.getOrCreateBulkhead(name, bulkhead);
				return bh.execute(fn);
			}
			return fn();
		};

		const runWithCircuit = async () => {
			if (circuit) {
				const cb = svc.getOrCreateCircuit(name, circuit);
				return cb.execute(runOnce);
			}
			return runOnce();
		};

		const runWithRetry = async () => {
			if (retry) {
				return svc.retry(runWithCircuit, retry);
			}
			return runWithCircuit();
		};

		return runWithRetry();
	};

	return {
		...descriptor,
		value: wrapped,
	};
}

// Re-export the meta key for tests.
export { RESILIENCE_META };
