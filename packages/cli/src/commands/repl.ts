/**
 * `nx repl` — interactive REPL with the app's services loaded.
 *
 * Boots the user's `AppModule` and drops you into a REPL with
 * `app`, `container`, `db`, `logger`, `cfg`, `cache`, and `events`
 * pre-loaded. Useful for debugging, exploring data, and trying
 * out queries without writing a throwaway script.
 *
 * Usage:
 *   nx repl                                  # default: ./app/app.module.ts
 *   nx repl --module app/app.module.ts
 *   nx repl --no-boot                        # vanilla REPL
 *   nx repl --history /tmp/nx-history        # custom history file
 *
 * Once inside the REPL:
 *   ❯ await db.select().from(users).all()
 *   ❯ logger.info("hello from REPL")
 *   ❯ .services
 *   ❯ .routes
 *   ❯ .help
 *   ❯ .exit
 *
 * Multi-line input is detected by a bracket-matcher — an
 * expression with an unclosed `{}`, `[]`, or `()` keeps the
 * prompt in `...` continuation mode.
 *
 * History is persisted to `.nx-repl-history` (or the path
 * given by `--history`).
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import * as readline from "node:readline";
import * as vm from "node:vm";
import type { Command, CommandContext } from "../core/index.js";
import { logger, VERSION } from "../core/index.js";

const BANNER = (() => {
	const W = 49;
	const dash = "─".repeat(W);
	const ver = `v${VERSION}`;
	const verLen = ver.length;
	const TITLE = "NexusTS REPL";
	const HINT = "Type .help for available commands";
	const titleGap = " ".repeat(W - 2 - TITLE.length - verLen - 1);
	const hintGap = " ".repeat(W - 2 - HINT.length);
	const L = (s: string) => `│${s}│`;
	return [
		`╭${dash}╮`,
		L(`  ${TITLE}${titleGap}${ver} `),
		L(" ".repeat(W)),
		L(`  ${HINT}${hintGap}`),
		`╰${dash}╯`,
	].join("\n");
})();

const HELP = `
Available commands:
  .help              Show this help
  .exit              Exit the REPL (alias: .quit)
  .services          List services in the DI container
  .modules           List all modules
  .routes            List all registered routes
  .history           Show command history
  .clear             Clear the screen
  .reset             Reset the REPL context (clear all variables)

Pre-loaded variables (when an app is booted):
  app                The Application instance
  container          The DI container
  db                 DrizzleService (if registered)
  logger             LoggerService (if registered)
  cfg                ConfigService (if registered)
  cache              CacheService (if registered)
  events             EventService (if registered)

Examples:
  > await db.select().from(users).all()
  > logger.info("hello from REPL")
  > app.container.size
`;

/** Pair of (variable name, npm package name, export name). */
const PRELOAD: Array<[string, string, string]> = [
	["db", "@nexusts/drizzle", "DrizzleService"],
	["logger", "@nexusts/logger", "Logger"],
	["cfg", "@nexusts/config", "ConfigService"],
	["cache", "@nexusts/cache", "CacheService"],
	["events", "@nexusts/events", "EventService"],
];

export const replCommand: Command = {
	name: "repl",
	aliases: ["console", "shell"],
	summary: "Start an interactive REPL with the app's services",
	description:
		"Boots the user's app module and drops into an interactive REPL. Useful for debugging, exploring data, and trying out queries. Multi-line input is supported. History is persisted to .nx-repl-history.",
	examples: [
		"nx repl",
		"nx repl --module app/app.module.ts",
		"nx repl --no-boot",
		"nx repl --history /tmp/nx-history",
	],
	flags: [
		{
			name: "module",
			description:
				"Path to the AppModule (default: app/app.module.ts).",
		},
		{
			name: "no-boot",
			description: "Skip booting the app — start a vanilla REPL.",
		},
		{
			name: "history",
			description: "History file path (default: .nx-repl-history).",
		},
	],
	async run(ctx: CommandContext): Promise<number> {
		const mod = ctx.flags["module"] as string | undefined;
		const noBoot = Boolean(ctx.flags["no-boot"]);
		const histPath = resolve(
			ctx.cwd,
			(ctx.flags["history"] as string | undefined) ?? ".nx-repl-history",
		);

		const env: Record<string, unknown> = { console };

		if (!noBoot) {
			const modPath = resolve(
				ctx.cwd,
				mod ?? "app/app.module.ts",
			);
			if (!existsSync(modPath)) {
				logger.error(`module not found: ${modPath}`);
				logger.info(
					"pass --module <path> or --no-boot to skip booting",
				);
				return 1;
			}
			try {
				const modSpec = await import(modPath);
				const AppModule =
					modSpec.default ?? modSpec.AppModule;
				if (!AppModule) {
					logger.error(
						`module at ${modPath} does not export AppModule as default or named export`,
					);
					return 1;
				}
				const { Application } = await import(
					"@nexusts/core"
				);
				const app = new Application(AppModule);
				env.app = app;
				env.container = app.container;

				for (const [name, path, className] of PRELOAD) {
					await preloadService(
						env,
						app as { container: { resolve: (t: unknown) => unknown } },
						name,
						path,
						className,
					);
				}

				logger.info(`✓ Booted ${modPath}`);
			} catch (err) {
				logger.error(`failed to boot: ${(err as Error).message}`);
				return 1;
			}
		}

		console.log(BANNER);
		if (noBoot) {
			console.log("  (started with --no-boot; no app is loaded)");
		}

		const history = loadHistory(histPath);

		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			prompt: "❯ ",
			terminal: true,
			history,
			historySize: 1000,
		});

		const saveHist = () => saveHistoryFile(histPath, (rl as unknown as { history?: string[] }).history ?? []);
		rl.on("close", () => {
			saveHist();
			process.exit(0);
		});
		process.on("SIGINT", () => {
			saveHist();
			process.exit(0);
		});
		process.on("exit", saveHist);

		let buffer = "";
		const vmContext = vm.createContext(env);

		const evaluate = async (code: string): Promise<void> => {
			try {
				const script = new vm.Script(code, { filename: "<nx-repl>" });
				const result = script.runInContext(vmContext, {
					displayErrors: false,
				});
				if (result === undefined) return;
				if (
					result &&
					typeof (result as { then?: unknown }).then === "function"
				) {
					const v = await (result as Promise<unknown>);
					console.log(formatResult(v));
				} else {
					console.log(formatResult(result));
				}
			} catch (err) {
				console.error(formatError(err as Error));
			}
		};

		const handleDotCommand = async (line: string): Promise<boolean> => {
			const cmd = line.trim();
			switch (cmd) {
				case ".help":
					console.log(HELP);
					return true;
				case ".exit":
				case ".quit":
					saveHist();
					rl.close();
					return true;
				case ".clear":
					console.clear();
					console.log(BANNER);
					return true;
				case ".services": {
					const services = listServices(env.container);
					if (services.length === 0) {
						console.log("  (no services registered)");
					} else {
						for (const s of services) console.log(`  ${s}`);
					}
					return true;
				}
				case ".modules": {
					const mods = (env.app as { modules?: Array<{ moduleClass?: { name?: string } }> } | undefined)?.modules;
					if (!mods || mods.length === 0) {
						console.log("  (no modules)");
					} else {
						for (const m of mods) {
							console.log(`  ${m.moduleClass?.name ?? "(anon)"}`);
						}
					}
					return true;
				}
				case ".routes": {
					const app = env.app as
						| {
								server?: {
									router?: {
										getRoutes?: () => Array<{
											method: string;
											path: string;
											target?: { name?: string };
											propertyKey?: string | symbol;
										}>;
									};
								};
						  }
						| undefined;
					const getRoutes = app?.server?.router?.getRoutes;
					const raw =
						typeof getRoutes === "function"
							? getRoutes.call(app!.server!.router)
							: [];
					const seen = new Set<string>();
					const routes = raw.filter((r) => {
						const key = `${r.method}:${r.path}:${r.target?.name ?? ""}:${typeof r.propertyKey === "symbol" ? r.propertyKey.description ?? "" : String(r.propertyKey)}`;
						if (seen.has(key)) return false;
						seen.add(key);
						return true;
					});
					if (routes.length === 0) {
						console.log("  (no routes registered)");
					} else {
						const methodPad = Math.max(...routes.map((r) => r.method.length));
						const pathPad = Math.max(...routes.map((r) => r.path.length));
						for (const r of routes) {
							const m = r.method.padEnd(methodPad);
							const p = r.path.padEnd(pathPad);
							const c = `${r.target?.name ?? "?"}.${typeof r.propertyKey === "symbol" ? r.propertyKey.description ?? "?" : String(r.propertyKey)}`;
							console.log(`  ${m}  ${p}  ${c}`);
						}
					}
					return true;
				}
				case ".history": {
					const hist = (rl as unknown as { history?: string[] }).history ?? [];
					const histArr = hist as string[];
					histArr.forEach((h: string, i: number) => {
						console.log(`  ${(i + 1).toString().padStart(4)}: ${h}`);
					});
					return true;
				}
				case ".reset": {
					for (const k of Object.keys(env)) {
						if (k !== "console") delete env[k];
					}
					console.log("  context reset");
					return true;
				}
				default:
					console.error(`  unknown command: ${cmd}`);
					console.log("  type .help for the list");
					return true;
			}
		};

		rl.on("line", async (line) => {
			const trimmed = line.trim();
			if (trimmed.startsWith(".")) {
				await handleDotCommand(trimmed);
			} else {
				buffer += line + "\n";
				if (isIncomplete(buffer)) {
					rl.setPrompt("... ");
					rl.prompt();
					return;
				}
				await evaluate(buffer);
				buffer = "";
				rl.setPrompt("❯ ");
			}
			rl.prompt();
		});

		rl.prompt();

		// Keep the process alive. readline drives the rest.
		return new Promise(() => {
			/* never resolves */
		});
	},
};

/* ------------------------------------------------------------------ *
 * Helpers — exported for testing
 * ------------------------------------------------------------------ */

export async function preloadService(
	env: Record<string, unknown>,
	app: { container: { resolve: (t: unknown) => unknown } },
	name: string,
	path: string,
	className: string,
): Promise<void> {
	try {
		const mod = (await import(path)) as Record<string, unknown>;
		const ServiceClass = mod[className] as
			| (abstract new (...args: never[]) => unknown) & {
					TOKEN?: unknown;
					[key: string]: unknown;
			  }
			| undefined;
		if (!ServiceClass) {
			logger.debug(`repl: ${className} not found in ${path}`);
			return;
		}
		const Token =
			ServiceClass.TOKEN ??
			ServiceClass[`${className.toUpperCase()}_TOKEN`];
		if (!Token) {
			logger.debug(`repl: ${className}.TOKEN not found`);
			return;
		}
		try {
			env[name] = app.container.resolve(Token);
			logger.debug(`repl: loaded ${name} (${className})`);
		} catch {
			try {
				env[name] = app.container.resolve(ServiceClass);
				logger.debug(`repl: loaded ${name} (${className}) via class`);
			} catch {
				logger.debug(`repl: ${name} (${className}) not registered in container`);
			}
		}
	} catch {
		logger.debug(`repl: ${path} not installed — skipping ${name}`);
	}
}

export function describeToken(token: unknown): string {
	if (typeof token === "symbol") {
		const desc = token.description ?? "(symbol)";
		return `Symbol(${desc})`;
	}
	if (typeof token === "function") {
		return (token as { name?: string }).name || "(anonymous class)";
	}
	return String(token);
}

export function listServices(
	container: unknown,
): string[] {
	if (!container) return [];
	const c = container as {
		listProviders?: () => Array<{ token?: { toString(): string } }>;
	};
	if (typeof c.listProviders !== "function") return [];
	try {
		return c
			.listProviders()
			.map((p) => describeToken(p.token));
	} catch {
		return [];
	}
}

export function isIncomplete(code: string): boolean {
	// Track string literals, line comments, block comments, and
	// bracket depth. Returns true if the code has any unclosed
	// bracket / string / comment.
	const stack: string[] = [];
	let inString: string | null = null;
	let inComment: "line" | "block" | null = null;
	for (let i = 0; i < code.length; i++) {
		const c = code[i];
		const next = code[i + 1];
		if (inComment === "line") {
			if (c === "\n") inComment = null;
			continue;
		}
		if (inComment === "block") {
			if (c === "*" && next === "/") {
				inComment = null;
				i++;
			}
			continue;
		}
		if (inString) {
			if (c === "\\") {
				i++;
				continue;
			}
			if (c === inString) inString = null;
			continue;
		}
		if (c === "/" && next === "/") {
			inComment = "line";
			i++;
			continue;
		}
		if (c === "/" && next === "*") {
			inComment = "block";
			i++;
			continue;
		}
		if (c === '"' || c === "'" || c === "`") {
			inString = c;
			continue;
		}
		if (c === "{" || c === "[" || c === "(") stack.push(c);
		else if (c === "}" || c === "]" || c === ")") stack.pop();
	}
	return stack.length > 0 || inString !== null || inComment === "block";
}

export function formatResult(r: unknown): string {
	if (r === null) return "null";
	if (r === undefined) return "undefined";
	if (typeof r === "string") return r;
	if (
		typeof r === "number" ||
		typeof r === "boolean" ||
		typeof r === "bigint"
	) return String(r);
	if (typeof r === "function") {
		const fn = r as { name?: string };
		return `[Function: ${fn.name || "anonymous"}]`;
	}
	if (typeof r === "symbol") return r.toString();
	try {
		return JSON.stringify(r, null, 2);
	} catch {
		return Object.prototype.toString.call(r);
	}
}

export function formatError(e: Error): string {
	if (e.name === "SyntaxError") return e.message;
	return e.stack ? e.stack.split("\n").slice(0, 5).join("\n") : e.message;
}

function loadHistory(path: string): string[] {
	if (!existsSync(path)) return [];
	try {
		return readFileSync(path, "utf-8").split("\n").filter(Boolean);
	} catch {
		return [];
	}
}

function saveHistoryFile(path: string, history: string[]): void {
	try {
		const dir = dirname(path);
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		writeFileSync(path, history.slice(-1000).join("\n"));
	} catch {
		// best effort
	}
}

export default replCommand;
