/**
 * Module template for `make:crud`.
 */

export default `
import { Module } from 'nexus';
import { {{ controller }} } from '../controllers/{{ kebab }}.controller.js';
import { {{ service }} } from '../services/{{ kebab }}.service.js';
{{#hasRepo}}import { {{ repository }} } from '../repositories/{{ kebab }}.repository.js';{{/hasRepo}}

@Module({
  controllers: [{{ controller }}],
  providers: [
    {{ service }},
    {{#hasRepo}}{{ repository }},{{/hasRepo}}
  ],
  exports: [{{ service }}],
})
export class {{ name }}Module {}
`.trimStart();