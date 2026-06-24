/**
 * Tests for the OpenAPIService — full spec generation from a fake
 * route table.
 */

import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import * as z from "zod/v3";
import {
	ApiBody,
	ApiExclude,
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiResponse,
	ApiTags,
} from "../../src/openapi/decorators/index.js";
import { OpenAPIService } from "../../src/openapi/openapi.service.js";

function makeRoute(
	target: any,
	propertyKey: string | symbol,
	method = "GET",
	path = "/",
	validation?: any,
) {
	return { method, path, target, propertyKey, validation };
}

describe("OpenAPIService", () => {
	let svc: OpenAPIService;

	beforeEach(() => {
		svc = new OpenAPIService({
			info: { title: "Test API", version: "1.0.0" },
			servers: [{ url: "http://localhost:3000" }],
		});
	});

	it("emits a minimal OpenAPI 3.1 document", () => {
		const spec = svc.getSpec();
		expect(spec.openapi).toBe("3.1.0");
		expect(spec.info.title).toBe("Test API");
		expect(spec.info.version).toBe("1.0.0");
		expect(spec.servers).toEqual([{ url: "http://localhost:3000" }]);
		expect(spec.paths).toEqual({});
	});

	it("emits an operation with default 200 response", () => {
		class C {
			@ApiOperation({ summary: "List" })
			list() {}
		}
		const inst = new C();
		svc.setRoutes([makeRoute(inst, "list")]);
		const spec = svc.getSpec();
		const op = spec.paths["/"]!.get;
		expect(op?.summary).toBe("List");
		expect(op?.responses["200"]?.description).toBe("Successful response");
	});

	it("auto-derives path params from :name pattern", () => {
		class C {
			show() {}
		}
		const inst = new C();
		svc.setRoutes([makeRoute(inst, "show", "GET", "/users/:id")]);
		const op = svc.getSpec().paths["/users/{id}"]!.get;
		expect(op?.parameters).toEqual([
			{ name: "id", in: "path", required: true, schema: { type: "string" } },
		]);
	});

	it("auto-derives query params from @Validate", () => {
		const validation = { query: z.object({ q: z.string(), limit: z.string() }) };
		class C {
			search() {}
		}
		const inst = new C();
		svc.setRoutes([makeRoute(inst, "search", "GET", "/search", validation)]);
		const op = svc.getSpec().paths["/search"]!.get;
		const queryParams = op?.parameters?.filter((p) => p.in === "query") ?? [];
		expect(queryParams).toHaveLength(2);
		expect(queryParams.find((p) => p.name === "q")?.schema).toEqual({ type: "string" });
	});

	it("auto-derives request body from @Validate", () => {
		const validation = { body: z.object({ name: z.string(), age: z.number() }) };
		class C {
			create() {}
		}
		const inst = new C();
		svc.setRoutes([makeRoute(inst, "create", "POST", "/users", validation)]);
		const op = svc.getSpec().paths["/users"]!.post;
		expect(op?.requestBody?.content?.["application/json"]?.schema).toMatchObject({
			type: "object",
			required: ["name", "age"],
		});
	});

	it("uses explicit @ApiResponse decorators", () => {
		class C {
			@ApiResponse(200, { description: "Found", schema: z.object({ ok: z.boolean() }) })
			@ApiResponse(404, { description: "Missing" })
			find() {}
		}
		const inst = new C();
		svc.setRoutes([makeRoute(inst, "find", "GET", "/items/:id")]);
		const op = svc.getSpec().paths["/items/{id}"]!.get;
		expect(op?.responses["200"]?.description).toBe("Found");
		expect(op?.responses["404"]?.description).toBe("Missing");
	});

	it("applies @ApiTags at the class level", () => {
		@ApiTags("Users", "Admin")
		class C {
			list() {}
		}
		const inst = new C();
		svc.setRoutes([makeRoute(inst, "list", "GET", "/users")]);
		const op = svc.getSpec().paths["/users"]!.get;
		expect(op?.tags).toEqual(["Users", "Admin"]);
	});

	it("explicit @ApiQuery overrides auto-derived query", () => {
		const validation = { query: z.object({ q: z.string() }) };
		class C {
			@ApiQuery({ name: "q", description: "Search term", required: false })
			search() {}
		}
		const inst = new C();
		svc.setRoutes([makeRoute(inst, "search", "GET", "/search", validation)]);
		const op = svc.getSpec().paths["/search"]!.get;
		const q = op?.parameters?.find((p) => p.in === "query" && p.name === "q");
		expect(q?.description).toBe("Search term");
	});

	it("explicit @ApiBody overrides @Validate body", () => {
		const validation = { body: z.object({ name: z.string() }) };
		class C {
			@ApiBody({ description: "Custom body desc", schema: z.object({ different: z.string() }) })
			create() {}
		}
		const inst = new C();
		svc.setRoutes([makeRoute(inst, "create", "POST", "/x", validation)]);
		const op = svc.getSpec().paths["/x"]!.post;
		expect(op?.requestBody?.description).toBe("Custom body desc");
		expect(op?.requestBody?.content?.["application/json"]?.schema).toMatchObject({
			properties: { different: { type: "string" } },
		});
	});

	it("respects @ApiExclude()", () => {
		class C {
			visible() {}
			@ApiExclude()
			hidden() {}
		}
		const inst = new C();
		svc.setRoutes([
			makeRoute(inst, "visible", "GET", "/visible"),
			makeRoute(inst, "hidden", "GET", "/hidden"),
		]);
		const spec = svc.getSpec();
		expect(spec.paths["/visible"]).toBeDefined();
		expect(spec.paths["/hidden"]).toBeUndefined();
	});

	it("flattens lower-cased method names", () => {
		class C {
			list() {}
			create() {}
			destroy() {}
		}
		const inst = new C();
		svc.setRoutes([
			makeRoute(inst, "list", "GET", "/a"),
			makeRoute(inst, "create", "POST", "/a"),
			makeRoute(inst, "destroy", "DELETE", "/a"),
		]);
		const path = svc.getSpec().paths["/a"]!;
		expect(path.get).toBeDefined();
		expect(path.post).toBeDefined();
		expect(path.delete).toBeDefined();
	});
});