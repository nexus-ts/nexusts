/**
 * CLI command registry. Imported by `src/cli/index.ts`.
 *
 * Each command is a `Command` object (see `core/index.ts`). The order
 * here is the order commands appear in `nx help`.
 */

import makeController from "./make-controller.js";
import makeService from "./make-service.js";
import makeModule from "./make-module.js";
import makeModel from "./make-model.js";
import makeMigration from "./make-migration.js";
import makeMiddleware from "./make-middleware.js";
import makeValidator from "./make-validator.js";
import makeCrud from "./make-crud.js";
import info from "./info.js";
import routeList from "./route-list.js";
import init from "./init.js";
import newCmd from "./new.js";

import type { Command } from "../core/index.js";

export const commands: Command[] = [
	newCmd,
	init,
	makeCrud,
	makeController,
	makeService,
	makeModule,
	makeModel,
	makeMigration,
	makeMiddleware,
	makeValidator,
	routeList,
	info,
];

/** Look up a command by primary name OR by any alias. */
export function findCommand(name: string): Command | undefined {
	return commands.find(
		(c) => c.name === name || (c.aliases ?? []).includes(name),
	);
}