/**
 * Re-exports for scaffold templates.
 *
 * Commands import the templates they need and pass a render context.
 * Adding a new template is a one-line change here.
 */

import controllerAdonis from "./controller/adonis.js";
import controllerFunctional from "./controller/functional.js";
import controllerNest from "./controller/nest.js";
import crudController from "./crud/controller.js";
import crudDto from "./crud/dto.js";
import crudModule from "./crud/module.js";
import crudTest from "./crud/test.js";
import middleware from "./middleware/middleware.js";
import migrationDrizzle from "./migration/drizzle.js";
import migrationSql from "./migration/sql.js";
import modelDrizzle from "./model/drizzle.js";
import modelKysely from "./model/kysely.js";
import modelPrisma from "./model/prisma.js";
import module from "./module/module.js";
import projectDrizzleConfig from "./project/drizzle.config.js";
import projectNxConfig from "./project/nx.config.js";
import repository from "./repository/repository.js";
import service from "./service/service.js";
import validator from "./validator/validator.js";

export const templates = {
	controller: {
		nest: controllerNest,
		adonis: controllerAdonis,
		functional: controllerFunctional,
	},
	service,
	repository,
	module,
	validator,
	middleware,
	model: {
		drizzle: modelDrizzle,
		prisma: modelPrisma,
		kysely: modelKysely,
	},
	migration: {
		drizzle: migrationDrizzle,
		sql: migrationSql,
	},
	crud: {
		controller: crudController,
		module: crudModule,
		dto: crudDto,
		test: crudTest,
	},
	project: {
		"nx.config.ts": projectNxConfig,
		"drizzle.config.ts": projectDrizzleConfig,
	},
};

export type TemplateKey = keyof typeof templates;
