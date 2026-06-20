/**
 * Module template.
 *
 * Aggregates controllers, services, and repositories for a feature
 * folder. Mirrors NestJS `@Module({ controllers, providers, exports })`.
 *
 * Context:
 *   name           — PascalCase module name (e.g. "User")
 *   controller     — PascalCase controller (e.g. "UserController")
 *   service        — PascalCase service (e.g. "UserService")
 *   repository     — PascalCase repository (e.g. "UserRepository") — optional
 *   exports        — comma-separated tokens to re-export (e.g. "UserService")
 */

export default `
import { Module } from 'nexus';
import { {{ controller }} } from '../controllers/{{ kebab }}.controller.js';
{{#hasService}}import { {{ service }} } from '../services/{{ kebab }}.service.js';{{/hasService}}
{{#hasRepo}}import { {{ repository }} } from '../repositories/{{ kebab }}.repository.js';{{/hasRepo}}

@Module({
  controllers: [{{ controller }}],
  providers: [
    {{#hasService}}{{ service }},{{/hasService}}
    {{#hasRepo}}{{ repository }},{{/hasRepo}}
  ],
  exports: [
    {{#hasService}}{{ service }},{{/hasService}}
  ],
})
export class {{ name }}Module {}
`.trimStart();