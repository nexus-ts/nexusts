/**
 * `nx route:list` — list every registered HTTP route.
 *
 * Walks the project's controllers (under paths.controllers) and reads
 * the `@Controller(prefix)` + `@Get/@Post/...` metadata via reflection.
 * For modules that don't use the decorator style, this command emits
 * an informational message instead of failing.
 */

import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { Command, CommandContext } from "../core/index.js";
import { colors, logger } from "../core/index.js";
import { safeGetMeta } from "@nexusts/core/di/safe-reflect";

interface DiscoveredRoute {
	method: string;
	path: string;
	handler: string;
	controller: string;
}

export const routeListCommand: Command = {
	name: "route:list",
	aliases: ["routes", "route-list"],
	summary: "List registered HTTP routes",
	description:
		"Reads route metadata from controllers and prints a table. Falls back to a scan message when controllers don't use the decorator style.",
	flags: [
		{ name: "format", description: "Output format: table (default) | json" },
	],
	async run(ctx: CommandContext): Promise<number> {
		const controllersDir = resolve(ctx.cwd, ctx.config.paths.controllers);

		try {
			statSync(controllersDir);
		} catch {
			logger.warn(`No controllers directory at ${controllersDir}.`);
			return 0;
		}

		const files = readdirSync(controllersDir).filter((f) => f.endsWith(".ts"));
		if (files.length === 0) {
			logger.info("No controllers found.");
			return 0;
		}

		const routes: DiscoveredRoute[] = [];

		for (const file of files) {
			const fullPath = resolve(controllersDir, file);
			try {
				const mod: any = await import(`${fullPath}?t=${Date.now()}`);
				for (const exportName of Object.keys(mod)) {
					const cls = mod[exportName];
					if (typeof cls !== "function") continue;

					const controllerMeta =
						safeGetMeta("nexus:controller", cls) as
							| { prefix?: string }
							| undefined;
					const prefix = controllerMeta?.prefix ?? "";
					const routeList = safeGetMeta("nexus:routes", cls) ?? [];

					for (const r of routeList) {
						routes.push({
							method: String(r.method).toUpperCase(),
							path: joinPath(prefix, r.path),
							handler: String(r.propertyKey),
							controller: cls.name || exportName,
						});
					}
				}
			} catch (err: any) {
				logger.warn(`could not parse ${file}: ${err.message ?? err}`);
			}
		}

		if (routes.length === 0) {
			logger.info(
				"No routes discovered via metadata. " +
					"This usually means the controllers use the Adonis or functional style — see nx.config.ts:routing.",
			);
			return 0;
		}

		const format = (ctx.flags["format"] as string | undefined) ?? "table";
		if (format === "json") {
			console.log(JSON.stringify(routes, null, 2));
			return 0;
		}

		routes.sort((a, b) => a.path.localeCompare(b.path));
		logger.heading(`Routes (${routes.length})`);
		const methodColors: Record<string, (s: string) => string> = {
			GET: colors.cyan,
			POST: colors.green,
			PUT: colors.yellow,
			PATCH: colors.yellow,
			DELETE: colors.red,
			OPTIONS: colors.gray,
			HEAD: colors.gray,
		};
		const pathWidth = Math.max(...routes.map((r) => r.path.length));
		const methodWidth = Math.max(...routes.map((r) => r.method.length));
		for (const r of routes) {
			const colorize = methodColors[r.method] ?? colors.reset;
			const m = colorize(r.method.padEnd(methodWidth));
			const p = colors.bold(r.path.padEnd(pathWidth));
			const c = colors.dim(`${r.controller}.${r.handler}`);
			console.log(`  ${m}  ${p}  ${c}`);
		}
		logger.blank();
		return 0;
	},
};

function joinPath(prefix: string, sub: string): string {
	const a = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
	const b = sub.startsWith("/") ? sub : `/${sub}`;
	return `${a}${b}` || "/";
}

export default routeListCommand;
