/**
 * CLI command registry. Imported by `src/cli/index.ts`.
 *
 * Each command is a `Command` object (see `core/index.ts`). The order
 * here is the order commands appear in `nx help`.
 */

import type { Command } from "../core/index.js";
import configCmd from "./config.js";
import dbGenerate from "./db-generate.js";
import dbMigrate from "./db-migrate.js";
import dbSeed from "./db-seed.js";
import info from "./info.js";
import init from "./init.js";
import makeAuth from "./make-auth.js";
import makeController from "./make-controller.js";
import makeCrud from "./make-crud.js";
import makeListener from "./make-listener.js";
import makeMiddleware from "./make-middleware.js";
import makeMigration from "./make-migration.js";
import makeModel from "./make-model.js";
import makeModule from "./make-module.js";
import makeQueue from "./make-queue.js";
import makeRepository from "./make-repository.js";
import makeSchedule from "./make-schedule.js";
import makeService from "./make-service.js";
import makeSession from "./make-session.js";
import makeValidator from "./make-validator.js";
import newCmd from "./new.js";
import repl from "./repl.js";
import routeList from "./route-list.js";

export const commands: Command[] = [
	newCmd,
	init,
	configCmd,
	makeCrud,
	makeController,
	makeRepository,
	makeService,
	makeModule,
	makeModel,
	makeMigration,
	makeMiddleware,
	makeValidator,
	makeAuth,
	makeQueue,
	makeSchedule,
	makeListener,
	makeSession,
	dbMigrate,
	dbGenerate,
	dbSeed,
	routeList,
	info,
	repl,
];

/** Look up a command by primary name OR by any alias. */
export function findCommand(name: string): Command | undefined {
	return commands.find(
		(c) => c.name === name || (c.aliases ?? []).includes(name),
	);
}
