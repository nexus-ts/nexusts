/**
 * `GraphQLService` — owns the parsed schema, resolver map, and an
 * end-to-end executor.
 *
 * Most users won't instantiate this directly — they use
 * `GraphQLModule.forRoot({ typeDefs, resolvers, ... })` which puts
 * a singleton service into the DI container. The service is also
 * exported for advanced users (programmatic queries, schema
 * introspection, custom executors).
 *
 * The actual `parse` / `validate` / `execute` calls go to
 * `graphql` (a peer-dep). If the user hasn't installed it, we
 * throw a clear error from the first attempt.
 */
import type {
	GraphQLConfig,
	GraphQLContext,
	GraphQLExecutionResult,
	FieldResolver,
	ResolverMap,
} from "./types.js";
import { getRegisteredResolvers, getResolverFields } from "./decorators/index.js";
import { normalizeGQLType } from "./decorators/type-mapper.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

interface GraphQLJs {
	parse: (s: string) => unknown;
	buildSchema: (sdl: string) => unknown;
	validate: (schema: unknown, doc: unknown, rules?: unknown) => unknown[];
	// graphql 16 takes positional args; graphql 17 takes a single
	// object. We always call it with the 16-style positional args
	// (so we wrap a `buildSchema` schema, not the resolver-builder
	// schema), but the type reflects both possibilities.
	execute: (...args: any[]) => Promise<GraphQLExecutionResult> | GraphQLExecutionResult;
	specifiedRules?: unknown;
	getOperationAST?: (doc: unknown, operationName?: string) => unknown;
	GraphQLSchema: unknown;
	GraphQLObjectType: unknown;
	GraphQLString: unknown;
	GraphQLNonNull: unknown;
	GraphQLList: unknown;
	GraphQLInt: unknown;
	GraphQLFloat: unknown;
	GraphQLBoolean: unknown;
	GraphQLID: unknown;
	GraphQLError: unknown;
	GraphQLScalarType: unknown;
	parseType: (s: string) => unknown;
	GraphQLSchemaConfig: unknown;
}

let _graphql: GraphQLJs | null = null;
let _loadAttempted = false;

/** Lazy-load the `graphql` package. Throws a clear error if missing. */
export async function loadGraphQLJs(): Promise<GraphQLJs> {
	if (_graphql) return _graphql;
	if (_loadAttempted) {
		throw new Error(
			"[nexusjs/graphql] The optional `graphql` package failed to load. " +
				"Install it with `bun add graphql` to use the GraphQL module.",
		);
	}
	_loadAttempted = true;
	try {
		const mod = (await import("graphql")) as unknown as GraphQLJs;
		_graphql = mod;
		return mod;
	} catch (err) {
		throw new Error(
			"[nexusjs/graphql] The `graphql` package is required for execution. " +
				"Install it with `bun add graphql`. " +
				"Original error: " + (err as Error).message,
		);
	}
}

export class GraphQLService {
	/** The raw config the module was booted with. */
	readonly config: GraphQLConfig;
	/** Optional DI handle. */
	static readonly TOKEN = Symbol.for("nexus:GraphQL");

	constructor(config: GraphQLConfig = {}) {
		this.config = {
			playground: "graphiql",
			endpoint: { path: "/graphql", enableGet: true },
			exposeSchemaSDL: true,
			introspection: true,
			...config,
		};
	}

	private _schema: any = null;
	private _resolvers: ResolverMap = {};
	private _bootstrapPromise: Promise<void> | null = null;

	/**
	 * Register a resolver map (or add to the existing one). Safe to
	 * call multiple times — the maps are merged.
	 */
	addResolvers(map: ResolverMap): void {
		for (const [typeName, fields] of Object.entries(map)) {
			this._resolvers[typeName] = {
				...this._resolvers[typeName],
				...fields,
			};
		}
	}

	private async _buildSchema(sdl: string[]): Promise<any> {
		const g = await loadGraphQLJs();
		const merged = this.mergeSDLWithDecorators(sdl);
		// graphql-js's `buildSchema` produces a `GraphQLSchema` whose
		// fields' `resolve` is `undefined` by default — graphql-js's
		// execution layer looks up fields on the parent object in
		// that case. To wire our `ResolverMap`, we set each field's
		// `resolve` directly. This works for graphql 16 and 17.
		const schema = (g.buildSchema as Function)(merged);
		// Deep-merge resolver maps: auto-wired < addResolvers() < config.resolvers.
		// Shallow spread would clobber an entire type object (e.g. the Query key)
		// when two sources contribute fields to the same type.
		const autoWired = this.config.autoSchema ? this._autoWireResolvers() : {};
		const final = mergeResolverMaps(autoWired, this._resolvers, this.config.resolvers ?? {});
		wrapSchemaWithResolvers(schema, final);
		return schema;
	}

	/**
	 * Instantiate each registered `@Resolver` class and map its `@Query` /
	 * `@Mutation` / `@Subscription` methods into a `ResolverMap`.
	 *
	 * For methods decorated with `@Arg`, positional arguments are extracted
	 * from the graphql-js `args` object by name and forwarded positionally.
	 * For methods without `@Arg`, the standard graphql-js 4-tuple
	 * `(parent, args, ctx, info)` is passed through unchanged.
	 */
	private _autoWireResolvers(): ResolverMap {
		const map: ResolverMap = {};
		for (const resolverClass of getRegisteredResolvers()) {
			const fields = getResolverFields(resolverClass);
			const instance = new (resolverClass as any)();
			for (const f of fields) {
				let typeName: string;
				if (f.kind === "query") typeName = "Query";
				else if (f.kind === "mutation") typeName = "Mutation";
				else typeName = "Subscription";

				if (!map[typeName]) map[typeName] = {};

				const method = (instance as any)[f.propertyKey];
				if (typeof method !== "function") continue;

				const argNames = f.args.map((a) => a.name);
				if (argNames.length === 0) {
					// No @Arg — pass graphql-js 4-tuple as-is.
					map[typeName][f.name] = (parent: any, args: any, ctx: any, info: any) =>
						method.call(instance, parent, args, ctx, info);
				} else {
					// @Arg present — extract each value from the args object by
					// name and call the method with positional parameters.
					map[typeName][f.name] = (_parent: any, args: any) => {
						const positional = argNames.map((n) => args[n]);
						return method.call(instance, ...positional);
					};
				}
			}
		}
		return map;
	}

	/**
	 * Build (or rebuild) the underlying GraphQL schema. Idempotent.
	 * Returns the `graphql` schema instance.
	 */
	async ensureSchema(): Promise<any> {
		if (this._schema) return this._schema;
		if (this._bootstrapPromise) return this._bootstrapPromise.then(() => this._schema);
		this._bootstrapPromise = (async () => {
			const sdl = this.normaliseTypeDefs(this.config.typeDefs);
			const autoSchema = this.config.autoSchema ?? false;
			const hasResolvers = getRegisteredResolvers().length > 0;

			if (sdl.length === 0 && !autoSchema && !hasResolvers) {
				throw new Error(
					"[nexusjs/graphql] No typeDefs configured. " +
						"Pass `typeDefs: '...'` to GraphQLModule.forRoot(), " +
						"or set `autoSchema: true` and use `@Resolver` + `@Query` / `@Mutation` decorators.",
				);
			}
			this._schema = await this._buildSchema(sdl);
		})();
		await this._bootstrapPromise;
		return this._schema;
	}

	/**
	 * Validate + execute a GraphQL document. Returns the raw
	 * `execute()` result envelope (data, errors, extensions).
	 */
	async execute(
		source: string,
		variableValues: Record<string, unknown> = {},
		operationName?: string,
		contextValue?: GraphQLContext,
	): Promise<GraphQLExecutionResult> {
		const g = await loadGraphQLJs();
		const schema = await this.ensureSchema();
		const document = (g.parse as Function)(source);
		const errors = (g.validate as Function)(schema, document, g.specifiedRules) as unknown[];
		if (errors.length > 0) {
			return {
				errors: (errors as any[]).map((e: any) => ({
					message: e.message,
					locations: e.locations,
				})),
			};
		}
		// If the user didn't pass a context and the service has a
		// `context()` factory, build a synthetic context (with a
		// stub Hono ctx) so resolvers that depend on `ctx.state` work
		// in `execute()` calls outside of an HTTP request.
		let ctx = contextValue;
		if (!ctx && this.config.context) {
			const fakeHono = { req: { url: "", method: "EXECUTE", header: () => "" } };
			ctx = {
				hono: fakeHono as any,
				state: await this.config.context(fakeHono as any),
			};
		}
		const rootValue = undefined;
		return await (g.execute as any)({
			schema,
			document,
			rootValue,
			contextValue: ctx,
			variableValues,
			operationName,
		});
	}

	/**
	 * Produce a `GraphQLContext` from an inbound Hono request.
	 * Calls the user's `context()` factory if provided.
	 */
	async buildContext(c: any): Promise<GraphQLContext> {
		const state = this.config.context
			? await this.config.context(c)
			: {};
		return { hono: c, state };
	}

	/**
	 * Read the parsed SDL back as a string. Useful for the
	 * `/graphql/schema` debug endpoint and for tests.
	 */
	getSchemaSDL(): string {
		return this.normaliseTypeDefs(this.config.typeDefs).join("\n");
	}

	private normaliseTypeDefs(td?: string | string[]): string[] {
		if (!td) return [];
		return Array.isArray(td) ? td : [td];
	}

	/**
	 * Synthesise SDL snippets from `@Resolver` / `@Query` / `@Mutation` /
	 * `@Subscription` decorator metadata and merge them with any
	 * user-supplied `typeDefs`.
	 *
	 * - If the user's SDL already defines `type Query`, decorator-added
	 *   fields are appended with `extend type Query { ... }` to avoid
	 *   duplicate-type errors.
	 * - Unknown return types or argument types are passed through as-is
	 *   (they are treated as user-defined object types).
	 */
	private mergeSDLWithDecorators(sdl: string[]): string {
		const registered = getRegisteredResolvers();
		if (registered.length === 0) return sdl.join("\n");

		const queryFields: string[] = [];
		const mutationFields: string[] = [];
		const subscriptionFields: string[] = [];

		for (const resolverClass of registered) {
			const fields = getResolverFields(resolverClass);
			for (const f of fields) {
				const argStr =
					f.args.length > 0
						? `(${f.args.map((a) => `${a.name}: ${normalizeGQLType(a.type)}`).join(", ")})`
						: "";
				const line = `  ${f.name}${argStr}: ${normalizeGQLType(f.returnTypeName)}`;
				if (f.kind === "query") queryFields.push(line);
				else if (f.kind === "mutation") mutationFields.push(line);
				else if (f.kind === "subscription") subscriptionFields.push(line);
			}
		}

		const userSDL = sdl.join("\n");
		const generated: string[] = [];

		if (queryFields.length > 0) {
			const keyword = /type\s+Query\s*\{/.test(userSDL) ? "extend type" : "type";
			generated.push(`${keyword} Query {\n${queryFields.join("\n")}\n}`);
		}
		if (mutationFields.length > 0) {
			const keyword = /type\s+Mutation\s*\{/.test(userSDL) ? "extend type" : "type";
			generated.push(`${keyword} Mutation {\n${mutationFields.join("\n")}\n}`);
		}
		if (subscriptionFields.length > 0) {
			const keyword = /type\s+Subscription\s*\{/.test(userSDL) ? "extend type" : "type";
			generated.push(`${keyword} Subscription {\n${subscriptionFields.join("\n")}\n}`);
		}

		return [userSDL, ...generated].filter(Boolean).join("\n");
	}
}

/** Deep-merge multiple `ResolverMap`s. Later entries win at the field level. */
function mergeResolverMaps(...maps: ResolverMap[]): ResolverMap {
	const result: ResolverMap = {};
	for (const map of maps) {
		for (const [typeName, fields] of Object.entries(map)) {
			result[typeName] = { ...result[typeName], ...fields };
		}
	}
	return result;
}

/**
 * Wrap a parsed schema with the user's resolver map. graphql-js's
 * `buildSchema` produces a schema with default resolvers (which look
 * up fields on the `rootValue`). For our use case, we want field-level
 * resolvers that pull from the registered `ResolverMap`.
 */
function wrapSchemaWithResolvers(schema: any, resolvers: ResolverMap): any {
	// graphql-js schemas are immutable. We replace the resolver map
	// via a tiny proxy: when a field is queried, graphql-js's default
	// resolver calls our `defaultFieldResolver` (which simply looks
	// up the value in the parent). To wire our resolvers, we set
	// each field's `resolve` to the entry from the resolver map.
	const typeMap = schema.getTypeMap?.() ?? {};
	for (const [typeName, fields] of Object.entries(resolvers)) {
		const type = typeMap[typeName];
		if (!type || typeof type.getFields !== "function") continue;
		const fieldMap = type.getFields();
		for (const [fieldName, resolver] of Object.entries(fields)) {
			const field = fieldMap[fieldName];
			if (!field) continue;
			const fn: FieldResolver =
				typeof resolver === "function"
					? (resolver as FieldResolver)
					: ((resolver as { resolve: FieldResolver }).resolve as FieldResolver);
			field.resolve = function (parent: any, args: any, ctx: any, info: any) {
				return fn(parent, args, ctx, info);
			};
		}
	}
	return schema;
}
