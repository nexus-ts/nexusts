#!/usr/bin/env bun
/**
 * `nx` — the Nexus CLI entry point.
 *
 * Invocation:
 *   bunx nx <command> [args...]
 *   bunx nx help
 *   bunx nx help <command>
 *
 * Resembles Adonis ACE / Rails generators:
 *   nx make:controller User
 *   nx make:crud Post --no-views
 *   nx make:migration create_users_table --columns "name:text,email:text"
 *   nx info
 *   nx route:list
 *   nx init --style nest --view inertia --orm drizzle
 *
 * The CLI loads `nx.config.ts` (or `nx.config.js` / `.nxrc.json`) and
 * passes the resolved config + parsed flags to each command.
 */

import { parseArgs, flagBool } from "./core/index.js";
import { loadConfig } from "./core/config.js";
import { logger, colors } from "./core/index.js";
import { commands, findCommand } from "./commands/index.js";

async function main(): Promise<number> {
	const parsed = parseArgs(process.argv.slice(2));
	const verbose = flagBool(parsed.flags, "verbose", false);
	logger.setVerbose(verbose);

	// Top-level flags.
	if (parsed.flags["version"] === true) {
		console.log(PKG_VERSION);
		return 0;
	}

	if (parsed.flags["help"] === true || parsed.command === "help") {
		return renderHelp(parsed.positional[0]);
	}

	const command = parsed.command ? findCommand(parsed.command) : undefined;
	if (!command) {
		if (parsed.command) {
			logger.error(`Unknown command: ${parsed.command}`);
			logger.info(`Run \`nx help\` for a list of commands.`);
			return 1;
		}
		return renderHelp();
	}

	const cwd = process.cwd();
	const config = await loadConfig(cwd);

	return command.run({
		cwd,
		config,
		positional: parsed.positional,
		flags: parsed.flags,
	});
}

function renderHelp(commandName?: string): number {
	if (commandName) {
		const cmd = findCommand(commandName);
		if (!cmd) {
			logger.error(`Unknown command: ${commandName}`);
			return 1;
		}
		renderCommandHelp(cmd);
		return 0;
	}

	logger.heading("nx — Nexus CLI");
	console.log(`
  ${colors.dim("Adonis ACE-style command runner for the NexusJS framework.")}

${colors.bold("Usage")}
  nx <command> [args...]

${colors.bold("Commands")}
`);

	const nameWidth = Math.max(...commands.map((c) => c.name.length));
	for (const c of commands) {
		const padded = c.name.padEnd(nameWidth);
		const aliasStr = c.aliases?.length ? ` ${colors.dim(`(${c.aliases.join(", ")})`)}` : "";
		console.log(`  ${colors.cyan(padded)}${aliasStr}  ${c.summary}`);
	}

	console.log(`
${colors.bold("Global flags")}
  --help, -h           Show help (or \`nx help <command>\`)
  --version, -v        Print the CLI version
  --verbose            Verbose output
  --no-color           Disable ANSI color output

${colors.bold("Examples")}
  ${colors.dim("nx new my-app")}
  ${colors.dim("nx init --style nest --view inertia --orm drizzle")}
  ${colors.dim("nx make:crud Post")}
  ${colors.dim("nx make:controller User")}
  ${colors.dim("nx make:migration create_users_table")}
  ${colors.dim("nx info")}
  ${colors.dim("nx route:list")}
`);
	return 0;
}

function renderCommandHelp(cmd: import("./core/index.js").Command): void {
	logger.heading(cmd.name);
	if (cmd.aliases?.length) {
		console.log(`  ${colors.dim("aliases:")} ${cmd.aliases.join(", ")}`);
	}
	if (cmd.description) console.log(`\n  ${cmd.description}\n`);

	if (cmd.flags?.length) {
		console.log(colors.bold("\nFlags"));
		for (const f of cmd.flags) {
			const short = f.short ? `, -${f.short}` : "";
			const def = f.default !== undefined ? ` ${colors.dim(`(default: ${String(f.default)})`)}` : "";
			console.log(`  --${f.name}${short.padEnd(6)}  ${f.description}${def}`);
		}
	}

	if (cmd.examples?.length) {
		console.log(colors.bold("\nExamples"));
		for (const ex of cmd.examples) {
			console.log(`  ${colors.cyan(ex)}`);
		}
	}
	console.log();
}

const PKG_VERSION = "0.1.0";

main()
	.then((code) => process.exit(code))
	.catch((err) => {
		logger.error(err?.message ?? String(err));
		if (process.env["NX_DEBUG"] === "1" && err?.stack) {
			console.error(err.stack);
		}
		process.exit(1);
	});