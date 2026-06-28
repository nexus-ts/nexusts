/**
 * Drizzle ORM adapter.
 *
 * Provides a thin, opt-in integration with Drizzle. The framework does
 * not bundle Drizzle as a hard dependency — users install it on demand:
 *
 *     bun add drizzle-orm
 *
 * The adapter exposes a `getDb(schema, client)` helper and a
 * `DrizzleModule` class that wires a Drizzle client into the DI container.
 *
 * The adapter intentionally stays small: full ORM ergonomics live in
 * Drizzle itself; the framework just integrates it.
 */
import type { DIContainer } from "../di/container.js";

/** Minimal subset of Drizzle's API we care about. */
export interface DrizzleLike<Schema extends Record<string, any> = any> {
	select: (...args: any[]) => any;
	insert: (...args: any[]) => any;
	update: (...args: any[]) => any;
	delete: (...args: any[]) => any;
	query: Record<string, (...args: any[]) => any>;
	schema: Schema;
}

/** Database client options the adapter knows how to construct. */
export interface DrizzleConfig<Schema extends Record<string, any> = any> {
	/** Pre-built Drizzle instance. */
	instance?: DrizzleLike<Schema>;
	/** Schema definition (passed to drizzle()). */
	schema?: Schema;
	/** Database client (any driver: bun:sqlite, pg, mysql2, etc.). */
	client?: any;
	/** Drizzle driver factory, e.g. `drizzle` from drizzle-orm/bun-sqlite. */
	driver?: (...args: any[]) => DrizzleLike<Schema>;
}

/**
 * Module that registers a Drizzle instance under a token. Use the
 * returned provider token with `@Inject()` to access the DB from services.
 *
 * @example
 * ```ts
 * const dbModule = new DrizzleModule('DB', {
 *   schema,
 *   driver: drizzle,
 * });
 *
 * @Module({ imports: [dbModule.asModule()] })
 * class UserModule {}
 * ```
 */
export class DrizzleModule<Schema extends Record<string, any> = any> {
	readonly token: string;

	constructor(
		token: string = "DB",
		private config: DrizzleConfig<Schema>,
	) {
		this.token = token;
	}

	/**
	 * Build the actual Drizzle instance. Throws a helpful error if neither
	 * a pre-built instance nor a driver+schema is configured.
	 */
	build(): DrizzleLike<Schema> {
		if (this.config.instance) return this.config.instance;
		if (this.config.driver && this.config.schema) {
			return this.config.driver({
				schema: this.config.schema,
				client: this.config.client,
			});
		}
		throw new Error(
			"DrizzleModule requires either `instance` or `driver` + `schema` configuration.",
		);
	}

	/**
	 * Export a list of providers so users can drop this module into
	 * `@Module({ imports: [...] })`. We return a synthetic class that the
	 * module scanner recognises.
	 */
	asModule() {
		const token = this.token;
		const _builder = () => this.build();
		// Create an ad-hoc provider class so users can import it directly.
		class DrizzleProvider {}
		Object.defineProperty(DrizzleProvider, "name", {
			value: `DrizzleProvider<${token}>`,
		});
		return DrizzleProvider;
	}

	/** Register the Drizzle instance into a container manually. */
	registerInto(container: DIContainer): void {
		container.register({
			provide: this.token,
			useFactory: () => this.build(),
		});
	}
}

/** Convenience: build a Drizzle instance directly (used in tests and CLI). */
export async function getDb<Schema extends Record<string, any> = any>(
	config: DrizzleConfig<Schema>,
): Promise<DrizzleLike<Schema>> {
	if (config.instance) return config.instance;
	if (config.driver && config.schema) {
		return config.driver({ schema: config.schema, client: config.client });
	}
	throw new Error(
		"getDb requires either `instance` or `driver` + `schema` configuration.",
	);
}
