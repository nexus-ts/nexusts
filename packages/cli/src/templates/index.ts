/**
 * Re-exports for scaffold templates.
 *
 * Commands import the templates they need and pass a render context.
 * Adding a new template is a one-line change here.
 */

import authInstance from "./auth/auth-instance.js";
import authEnvExample from "./auth/env-example.js";
import controllerAdonis from "./controller/adonis.js";
import controllerFunctional from "./controller/functional.js";
import controllerNest from "./controller/nest.js";
import crudController from "./crud/controller.js";
import crudDto from "./crud/dto.js";
import crudModule from "./crud/module.js";
import crudTest from "./crud/test.js";
import listener from "./listener/listener.js";
import middleware from "./middleware/middleware.js";
import migrationDrizzle from "./migration/drizzle.js";
import migrationKysely from "./migration/kysely.js";
import migrationSql from "./migration/sql.js";
import modelDrizzle from "./model/drizzle.js";
import modelKysely from "./model/kysely.js";
import module from "./module/module.js";
import projectDrizzleConfig from "./project/drizzle.config.js";
import projectNxConfig from "./project/nx.config.js";
import queueJob from "./queue/job.js";
import queueWorker from "./queue/worker.js";
import repositoryKysely from "./repository/kysely-repository.js";
import repositoryDrizzle from "./repository/repository.js";
import scheduleTask from "./schedule/task.js";
import service from "./service/service.js";
import sessionHelper from "./session/session.js";
import validator from "./validator/validator.js";

export const templates = {
controller: {
nest: controllerNest,
adonis: controllerAdonis,
functional: controllerFunctional,
},
auth: {
instance: authInstance,
"env.example": authEnvExample,
},
listener,
queue: {
worker: queueWorker,
job: queueJob,
},
schedule: scheduleTask,
service,
session: sessionHelper,
repository: {
drizzle: repositoryDrizzle,
kysely: repositoryKysely,
},
module,
validator,
middleware,
model: {
drizzle: modelDrizzle,
kysely: modelKysely,
},
migration: {
drizzle: migrationDrizzle,
kysely: migrationKysely,
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
