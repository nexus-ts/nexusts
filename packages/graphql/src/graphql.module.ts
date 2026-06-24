/**
 * `GraphQLModule` — drop-in GraphQL endpoint.
 *
 *   @Module({
 *     imports: [
 *       GraphQLModule.forRoot({
 *         typeDefs: `
 *           type Query { hello: String! }
 *         `,
 *         resolvers: {
 *           Query: {
 *             hello: () => "world",
 *           },
 *         },
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 *
 * After boot, the framework exposes:
 *
 *   POST /graphql            — queries + mutations
 *   GET  /graphql            — GraphiQL UI (or a query, if `?query=...` is set)
 *   GET  /graphql/schema     — the schema as SDL (debug)
 *
 * Resolvers can also be declared via the `@Resolver` + `@Query` /
 * `@Mutation` / `@Subscription` decorators — see the user guide.
 */
import "reflect-metadata";
import { Module } from "@nexusts/core";
import type { Context } from "hono";
import { GraphQLService } from "./graphql.service.js";
import type { GraphQLConfig } from "./types.js";

@Module({
	providers: [
		GraphQLService,
		{ provide: GraphQLService.TOKEN, useExisting: GraphQLService },
	],
	exports: [GraphQLService, GraphQLService.TOKEN],
})
export class GraphQLModule {
	static forRoot(config: GraphQLConfig) {
		const factory = () => new GraphQLService(config);
		@Module({
			providers: [
				{
					provide: GraphQLService.TOKEN,
					useFactory: factory,
				},
				{
					provide: GraphQLService,
					useFactory: factory,
				},
				{ provide: "GRAPHQL_CONFIG", useValue: config },
			],
			exports: [GraphQLService, GraphQLService.TOKEN],
		})
		class ConfiguredGraphQLModule {}
		Object.defineProperty(ConfiguredGraphQLModule, "name", {
			value: "ConfiguredGraphQLModule",
		});
		return ConfiguredGraphQLModule;
	}

	/**
	 * Manually mount the GraphQL endpoint onto a Hono-compatible app.
	 * Used by `main.ts` setups that don't go through `@Module`.
	 */
	static async mount(
		app: {
			post: (path: string, ...h: any[]) => any;
			get: (path: string, ...h: any[]) => any;
			use: (path: string, ...h: any[]) => any;
		},
		svc: GraphQLService,
	): Promise<void> {
		const path = svc.config.endpoint?.path ?? "/graphql";
		const enableGet = svc.config.endpoint?.enableGet ?? true;
		const exposeSDL = svc.config.exposeSchemaSDL ?? true;
		const playground = svc.config.playground ?? "graphiql";

		// POST /graphql — queries + mutations.
		app.post(path, async (c: Context) => {
			const body = await readRequestBody(c);
			const ctx = await svc.buildContext(c);
			const result = await svc.execute(
				body.query,
				parseJSONField(body.variables) ?? {},
				body.operationName || undefined,
				ctx,
			);
			return c.json(result, statusFor(result) as any);
		});

		// GET /graphql — playground / pre-baked query (?query=...&variables=...).
		if (enableGet) {
			app.get(path, async (c: Context) => {
				const query = c.req.query("query");
				if (!query) {
					if (playground === "none") {
						return c.text("GraphQL endpoint. Pass ?query=... for a pre-baked query.", 200);
					}
					return c.html(graphiqlHtml({ endpoint: path }), 200, {
						"Content-Type": "text/html; charset=utf-8",
					});
				}
				const ctx = await svc.buildContext(c);
				const result = await svc.execute(
					query,
					parseJSONField(c.req.query("variables") ?? "") ?? {},
					c.req.query("operationName") ?? undefined,
					ctx,
				);
				return c.json(result, statusFor(result) as any);
			});
		}

		// GET /graphql/schema — debug: print the raw SDL.
		if (exposeSDL) {
			app.get(`${path}/schema`, (c: Context) => {
				return c.text(svc.getSchemaSDL(), 200, {
					"Content-Type": "text/plain; charset=utf-8",
				});
			});
		}

		// Force schema bootstrap so the first request isn't slow.
		await svc.ensureSchema();
	}
}

/** Read a GraphQL request body. Accepts JSON or form-urlencoded. */
async function readRequestBody(
	c: Context,
): Promise<{ query: string; variables: string; operationName: string }> {
	const ct = c.req.header("content-type") ?? "";
	if (ct.includes("application/json")) {
		try {
			const j = await c.req.json() as Record<string, unknown>;
			return {
				query: String(j.query ?? ""),
				variables: j.variables ? JSON.stringify(j.variables) : "",
				operationName: j.operationName ? String(j.operationName) : "",
			};
		} catch {
			return { query: "", variables: "", operationName: "" };
		}
	}
	if (ct.includes("application/x-www-form-urlencoded")) {
		const text = await c.req.text();
		const params = new URLSearchParams(text);
		return {
			query: params.get("query") ?? "",
			variables: params.get("variables") ?? "",
			operationName: params.get("operationName") ?? "",
		};
	}
	// Default: assume form-urlencoded.
	const text = await c.req.text();
	const params = new URLSearchParams(text);
	return {
		query: params.get("query") ?? "",
		variables: params.get("variables") ?? "",
		operationName: params.get("operationName") ?? "",
	};
}

function parseJSONField(raw: string): Record<string, unknown> | undefined {
	if (!raw) return undefined;
	try {
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object") {
			return parsed as Record<string, unknown>;
		}
	} catch {
		/* fall through */
	}
	return undefined;
}

function statusFor(result: { errors?: unknown[]; data?: unknown }): number {
	if (result.errors && (result.errors as unknown[]).length > 0 && !result.data) return 400;
	return 200;
}

/** Minimal GraphiQL HTML — single-page, no CDN, no external assets. */
function graphiqlHtml(opts: { endpoint: string }): string {
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>GraphiQL</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 1em; }
    pre { background: #f5f5f5; padding: 0.6em; border-radius: 4px; overflow: auto; }
    .row { display: flex; gap: 1em; }
    textarea { width: 100%; min-height: 8em; font-family: ui-monospace, monospace; }
    button { padding: 0.4em 0.8em; }
  </style>
</head>
<body>
  <h2>GraphiQL (lightweight)</h2>
  <p>POST <code>${opts.endpoint}</code> · this is a no-deps playground built into
     <code>@nexusts/graphql</code>. For the full GraphiQL
     experience, see <code>graphiql</code> on npm.</p>
  <div class="row">
    <textarea id="q" placeholder="query { hello }">{ hello }</textarea>
  </div>
  <p><button id="run">Run</button> <span id="status"></span></p>
  <pre id="out"></pre>
  <script>
    const $q = document.getElementById("q");
    const $out = document.getElementById("out");
    const $status = document.getElementById("status");
    document.getElementById("run").onclick = async () => {
      $status.textContent = "running…";
      $out.textContent = "";
      const res = await fetch(${JSON.stringify(opts.endpoint)}, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: $q.value }),
      });
      const j = await res.json();
      $status.textContent = res.status + " " + res.statusText;
      $out.textContent = JSON.stringify(j, null, 2);
    };
  </script>
</body>
</html>`;
}
