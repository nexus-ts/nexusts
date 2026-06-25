/**
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";
 * `nexusjs/openapi` — OpenAPI 3.1 + Scalar UI.
 *
 *   @Module({
 *     imports: [
 *       OpenAPIModule.forRoot({
 *         info: { title: 'My API', version: '1.0.0' },
 *         servers: [{ url: 'http://localhost:3000' }],
 *       }),
 *     ],
 *   })
 *
 *   @Controller('/users')
 *   @ApiTags('Users')
 *   class UserController {
 *     @Get('/')
 *     @ApiOperation({ summary: 'List users' })
 *     @ApiResponse(200, { description: 'OK', schema: UserSchema })
 *     list() { ... }
 *   }
 *
 *   // -> GET /openapi.json    (the spec)
 *   // -> GET /docs            (Scalar UI)
 */


// ---------------------------------------------------------------------------
// OpenAPI spec types (subset of OpenAPI 3.1 — enough for 95% of real APIs)
// ---------------------------------------------------------------------------

export interface OpenAPIConfig {
	/** Top-level info block. */
	info: OpenAPIInfo;
	/** Server URLs. Default: [{ url: '/' }]. */
	servers?: OpenAPIServer[];
	/** Tags grouped at the top of the spec. */
	tags?: OpenAPITag[];
	/** Path under which the JSON spec is served. Default: '/openapi.json'. */
	specPath?: string;
	/** Path under which the Scalar UI is served. Default: '/docs'. */
	path?: string;
	/** External docs link. */
	externalDocs?: { url: string; description?: string };
}

export interface OpenAPIInfo {
	title: string;
	version: string;
	description?: string;
	termsOfService?: string;
	contact?: { name?: string; url?: string; email?: string };
	license?: { name: string; url?: string };
}

export interface OpenAPIServer {
	url: string;
	description?: string;
	variables?: Record<string, { default: string; enum?: string[]; description?: string }>;
}

export interface OpenAPITag {
	name: string;
	description?: string;
	externalDocs?: { url: string; description?: string };
}

/** OpenAPI Path Item. */
export interface OpenAPIPath {
	[method: string]: OpenAPIOperation | undefined;
}

/** OpenAPI Operation. */
export interface OpenAPIOperation {
	tags?: string[];
	summary?: string;
	description?: string;
	operationId?: string;
	parameters?: OpenAPIParameter[];
	requestBody?: OpenAPIRequestBody;
	responses: Record<string, OpenAPIResponse>;
	deprecated?: boolean;
	security?: OpenAPISecurity[];
}

/** OpenAPI Parameter (path, query, header, cookie). */
export interface OpenAPIParameter {
	name: string;
	in: "path" | "query" | "header" | "cookie";
	description?: string;
	required?: boolean;
	deprecated?: boolean;
	schema: JSONSchema;
	example?: unknown;
	examples?: Record<string, { summary?: string; value: unknown }>;
}

/** OpenAPI Request Body. */
export interface OpenAPIRequestBody {
	description?: string;
	content: Record<string, OpenAPIMediaType>;
	required?: boolean;
}

export interface OpenAPIMediaType {
	schema: JSONSchema;
	example?: unknown;
	examples?: Record<string, { summary?: string; value: unknown }>;
	encoding?: Record<string, OpenAPIEncoding>;
}

export interface OpenAPIEncoding {
	contentType?: string;
	headers?: Record<string, OpenAPIParameter>;
	style?: string;
	explode?: boolean;
	allowReserved?: boolean;
}

/** OpenAPI Response. */
export interface OpenAPIResponse {
	description: string;
	headers?: Record<string, OpenAPIParameter>;
	content?: Record<string, OpenAPIMediaType>;
	links?: Record<string, OpenAPILink>;
}

export interface OpenAPILink {
	operationRef?: string;
	operationId?: string;
	parameters?: Record<string, unknown>;
	description?: string;
	server?: OpenAPIServer;
}

export interface OpenAPISecurity {
	[name: string]: string[];
}

/** OpenAPI Component (schemas, parameters, responses, ...). */
export interface OpenAPIComponents {
	schemas?: Record<string, JSONSchema>;
	parameters?: Record<string, OpenAPIParameter>;
	responses?: Record<string, OpenAPIResponse>;
	requestBodies?: Record<string, OpenAPIRequestBody>;
	headers?: Record<string, OpenAPIParameter>;
	securitySchemes?: Record<string, OpenAPISecurityScheme>;
	links?: Record<string, OpenAPILink>;
}

export interface OpenAPISecurityScheme {
	type: "apiKey" | "http" | "oauth2" | "openIdConnect" | "mutualTLS";
	description?: string;
	name?: string;
	in?: "query" | "header" | "cookie";
	scheme?: string;
	bearerFormat?: string;
	flows?: unknown;
	openIdConnectUrl?: string;
}

export interface OpenAPIDocument {
	openapi: "3.1.0";
	info: OpenAPIInfo;
	servers?: OpenAPIServer[];
	paths: Record<string, OpenAPIPath>;
	components?: OpenAPIComponents;
	tags?: OpenAPITag[];
	externalDocs?: { url: string; description?: string };
	security?: OpenAPISecurity[];
	webhooks?: Record<string, OpenAPIPath | OpenAPIOperation>;
}

// ---------------------------------------------------------------------------
// JSON Schema (subset)
// ---------------------------------------------------------------------------

export interface JSONSchema {
	$ref?: string;
	type?:
		| "string"
		| "number"
		| "integer"
		| "boolean"
		| "object"
		| "array"
		| "null"
		| (string & {});
	format?: string;
	title?: string;
	description?: string;
	default?: unknown;
	example?: unknown;
	enum?: unknown[];
	const?: unknown;
	properties?: Record<string, JSONSchema>;
	required?: string[];
	additionalProperties?: boolean | JSONSchema;
	items?: JSONSchema;
	prefixItems?: JSONSchema[];
	minItems?: number;
	maxItems?: number;
	uniqueItems?: boolean;
	minimum?: number;
	maximum?: number;
	minLength?: number;
	maxLength?: number;
	pattern?: string;
	nullable?: boolean;
	oneOf?: JSONSchema[];
	anyOf?: JSONSchema[];
	allOf?: JSONSchema[];
	not?: JSONSchema;
	$defs?: Record<string, JSONSchema>;
	$schema?: string;
}

// ---------------------------------------------------------------------------
// Decorator payload types
// ---------------------------------------------------------------------------

export interface ApiOperationOptions {
	summary?: string;
	description?: string;
	operationId?: string;
	deprecated?: boolean;
	tags?: string[];
}

export interface ApiResponseOptions {
	description: string;
	schema?: unknown;
	headers?: Record<string, OpenAPIParameter>;
	example?: unknown;
	examples?: Record<string, { summary?: string; value: unknown }>;
}

export interface ApiParamOptions {
	name: string;
	description?: string;
	required?: boolean;
	schema?: unknown;
	example?: unknown;
}

export interface ApiQueryOptions extends Omit<ApiParamOptions, "name"> {
	name: string;
}

export interface ApiBodyOptions {
	description?: string;
	required?: boolean;
	schema?: unknown;
	example?: unknown;
}

export interface ApiPropertyOptions {
	description?: string;
	required?: boolean;
	example?: unknown;
	deprecated?: boolean;
	format?: string;
	schema?: unknown;
}

export interface ApiSecurityOptions {
	[name: string]: string[];
}

// ---------------------------------------------------------------------------
// Reflect metadata keys
// ---------------------------------------------------------------------------

export const OPENAPI_META = {
	TAGS: "nexus:openapi:tags",
	OPERATION: "nexus:openapi:operation",
	RESPONSES: "nexus:openapi:responses",
	PARAMS: "nexus:openapi:params",
	QUERIES: "nexus:openapi:queries",
	BODY: "nexus:openapi:body",
	PROPERTIES: "nexus:openapi:properties",
	SECURITY: "nexus:openapi:security",
	EXCLUDE: "nexus:openapi:exclude",
	PRODUCES: "nexus:openapi:produces",
	CONSUMES: "nexus:openapi:consumes",
} as const;
