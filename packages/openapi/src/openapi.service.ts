/**
 * `OpenAPIService` — walks the framework's route table, reads
 * `@ApiTags` / `@ApiOperation` / `@ApiResponse` / `@ApiBody` /
 * `@ApiParam` / `@ApiQuery` / `@Validate` metadata, and produces an
 * OpenAPI 3.1 document.
 *
 * The document is rebuilt on demand (cheap: in-memory walk) and
 * exposed via `getSpec()`. The framework's router already exposes a
 * `getRoutes()` method that returns the registered route list, so
 * the spec is always in sync with the actual API.
 */
import { Inject, Injectable } from "@nexusts/core";
import type {
	ApiOperationOptions,
	ApiParamOptions,
	ApiPropertyOptions,
	ApiResponseOptions,
	JSONSchema,
	OPENAPI_META as _OM,
	OpenAPIConfig,
	OpenAPIDocument,
	OpenAPIMediaType,
	OpenAPIOperation,
	OpenAPIParameter,
	OpenAPIRequestBody,
	OpenAPIResponse,
} from "./types.js";
import { OPENAPI_META } from "./types.js";
import { zodToJsonSchema } from "./zod-to-json-schema.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

@Injectable()
export class OpenAPIService {
	/** DI token. */
	static readonly TOKEN = Symbol.for("nexus:OpenAPIService");

	#config: OpenAPIConfig;
	#components: { schemas: Map<string, JSONSchema> } = { schemas: new Map() };
	#routes: { method: string; path: string; target: any; propertyKey: string | symbol; validation?: any }[] = [];

	constructor(@Inject("OPENAPI_CONFIG") config: OpenAPIConfig) {
		this.#config = config;
	}

	/**
	 * Inject the route list. The framework's router calls this on boot.
	 * Each entry is the data needed to emit one OpenAPI operation.
	 */
	setRoutes(
		routes: {
			method: string;
			path: string;
			target: any;
			propertyKey: string | symbol;
			validation?: { body?: unknown; query?: unknown; params?: unknown; headers?: unknown };
		}[],
	): void {
		this.#routes = routes;
	}

	/** Register a named component schema (e.g. for re-use). */
	registerSchema(name: string, schema: JSONSchema): void {
		this.#components.schemas.set(name, schema);
	}

	/** Build the OpenAPI 3.1 document. */
	getSpec(): OpenAPIDocument {
		const paths: Record<string, Record<string, OpenAPIOperation>> = {};
		for (const route of this.#routes) {
			if (safeGetMeta(OPENAPI_META.EXCLUDE, route.target.constructor, route.propertyKey)) continue;
			const op = this.buildOperation(route);
			const normalized = this.normalizePath(route.path);
			const method = route.method.toLowerCase();
			if (!paths[normalized]) paths[normalized] = {};
			paths[normalized][method] = op;
		}

		const doc: OpenAPIDocument = {
			openapi: "3.1.0",
			info: this.#config.info,
			paths,
		};
		if (this.#config.servers?.length) doc.servers = this.#config.servers;
		if (this.#config.tags?.length) doc.tags = this.#config.tags;
		if (this.#config.externalDocs) doc.externalDocs = this.#config.externalDocs;
		if (this.#components.schemas.size > 0) {
			doc.components = {
				schemas: Object.fromEntries(this.#components.schemas),
			};
		}
		return doc;
	}

	/**
	 * Build one operation from a route.
	 */
	private buildOperation(route: {
		method: string;
		path: string;
		target: any;
		propertyKey: string | symbol;
		validation?: { body?: unknown; query?: unknown; params?: unknown; headers?: unknown };
	}): OpenAPIOperation {
		const ctor = route.target.constructor ?? route.target;
		const propKey = route.propertyKey;

		// 1. Tags from class + operation
		const classTags: string[] = safeGetMeta(OPENAPI_META.TAGS, ctor) ?? [];
		const opMeta: ApiOperationOptions | undefined = safeGetMeta(
			OPENAPI_META.OPERATION,
			ctor,
			propKey,
		);
		const opTags: string[] = opMeta?.tags ?? [];
		const tags = [...new Set([...classTags, ...opTags])];

		// 2. Parameters (path / query / headers)
		const params: OpenAPIParameter[] = [];
		// Auto-derive path params from the route pattern.
		const pathParams = this.extractPathParams(route.path);
		for (const name of pathParams) {
			const override = (
				(safeGetMeta(OPENAPI_META.PARAMS, ctor, propKey) ?? []) as ApiParamOptions[]
			).find((p) => p.name === name);
			params.push({
				name,
				in: "path",
				required: true,
				description: override?.description,
				schema: override?.schema ? this.toSchema(override.schema) : { type: "string" },
			});
		}
		// Auto-derive query params from `@Validate({ query })`.
		if (route.validation?.query) {
			this.appendZodParams(
				ctor,
				propKey,
				"query",
				route.validation.query,
				params,
				false,
			);
		}
		// Auto-derive headers from `@Validate({ headers })`.
		if (route.validation?.headers) {
			this.appendZodParams(
				ctor,
				propKey,
				"header",
				route.validation.headers,
				params,
				false,
			);
		}
		// Explicit `@ApiQuery` decorators override / supplement.
		const explicitQueries: ApiParamOptions[] =
			safeGetMeta(OPENAPI_META.QUERIES, ctor, propKey) ?? [];
		for (const q of explicitQueries) {
			// Replace any auto-derived entry for the same name.
			const idx = params.findIndex(
				(p) => p.in === "query" && p.name === q.name,
			);
			const param: OpenAPIParameter = {
				name: q.name,
				in: "query",
				required: q.required ?? false,
				description: q.description,
				schema: q.schema ? this.toSchema(q.schema) : { type: "string" },
			};
			if (idx >= 0) params[idx] = param;
			else params.push(param);
		}
		// Explicit `@ApiParam` decorators override path params.
		const explicitParams: ApiParamOptions[] =
			safeGetMeta(OPENAPI_META.PARAMS, ctor, propKey) ?? [];
		for (const p of explicitParams) {
			const idx = params.findIndex(
				(x) => x.in === "path" && x.name === p.name,
			);
			const param: OpenAPIParameter = {
				name: p.name,
				in: "path",
				required: p.required ?? true,
				description: p.description,
				schema: p.schema ? this.toSchema(p.schema) : { type: "string" },
			};
			if (idx >= 0) params[idx] = param;
			else params.push(param);
		}

		// 3. Request body
		let requestBody: OpenAPIRequestBody | undefined;
		const bodyMeta = safeGetMeta(OPENAPI_META.BODY, ctor, propKey);
		if (bodyMeta?.schema || route.validation?.body) {
			const schema = bodyMeta?.schema ?? route.validation?.body;
			const mediaType: OpenAPIMediaType = { schema: this.toSchema(schema) };
			if (bodyMeta?.example !== undefined) mediaType.example = bodyMeta.example;
			requestBody = {
				description: bodyMeta?.description ?? "Request body",
				content: { "application/json": mediaType },
				required: bodyMeta?.required ?? true,
			};
		}

		// 4. Responses
		const responses: Record<string, OpenAPIResponse> = {};
		const responseMetas: Array<[string, ApiResponseOptions]> =
			safeGetMeta(OPENAPI_META.RESPONSES, ctor, propKey) ?? [];
		for (const [status, opt] of responseMetas) {
			const r: OpenAPIResponse = { description: opt.description };
			if (opt.schema) {
				r.content = {
					"application/json": {
						schema: this.toSchema(opt.schema),
						...(opt.example !== undefined ? { example: opt.example } : {}),
					},
				};
			}
			responses[status] = r;
		}
		// Default 200 OK if no responses declared.
		if (Object.keys(responses).length === 0) {
			responses["200"] = { description: "Successful response" };
		}

		// 5. Compose
		const op: OpenAPIOperation = {
			responses,
		};
		if (tags.length > 0) op.tags = tags;
		if (opMeta?.summary) op.summary = opMeta.summary;
		if (opMeta?.description) op.description = opMeta.description;
		if (opMeta?.operationId) op.operationId = opMeta.operationId;
		if (opMeta?.deprecated) op.deprecated = true;
		if (params.length > 0) op.parameters = params;
		if (requestBody) op.requestBody = requestBody;
		return op;
	}

	/**
	 * Convert any of:
	 *   - a Zod schema → JSON Schema via `zodToJsonSchema`
	 *   - a `JSONSchema` object → passthrough
	 *   - a class decorated with `@ApiProperty` → JSON Schema
	 *   - `null` / `undefined` → empty object
	 */
	private toSchema(input: unknown): JSONSchema {
		if (input == null) return {};
		// JSONSchema passthrough (has `type` or `$ref` or any of our keys).
		if (typeof input === "object" && !isZodLike(input)) {
			return input as JSONSchema;
		}
		// Zod-like: try the converter.
		try {
			return zodToJsonSchema(input);
		} catch {
			return {};
		}
	}

	private appendZodParams(
		ctor: any,
		propKey: string | symbol,
		where: "query" | "header",
		schema: unknown,
		params: OpenAPIParameter[],
		required: boolean,
	): void {
		const json = this.toSchema(schema);
		// Unwrap top-level object to one entry per property.
		if (json.type === "object" && json.properties) {
			const req = new Set(json.required ?? []);
			for (const [name, sub] of Object.entries(json.properties)) {
				params.push({
					name,
					in: where,
					required: required || req.has(name),
					schema: sub,
				});
			}
		}
	}

	private extractPathParams(path: string): string[] {
		const out: string[] = [];
		const re = /:([A-Za-z0-9_]+)/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(path)) !== null) out.push(m[1]!);
		return out;
	}

	private normalizePath(path: string): string {
		return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
	}
}

function isZodLike(s: unknown): boolean {
	if (typeof s !== "object" || s === null) return false;
	const o = s as { _def?: { typeName?: string }; typeName?: string };
	const t = o._def?.typeName ?? o.typeName;
	return typeof t === "string" && t.startsWith("Zod");
}