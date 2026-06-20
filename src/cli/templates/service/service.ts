/**
 * Service template.
 *
 * Context:
 *   name          — PascalCase class name
 *   camel         — camelCase variable
 *   repository    — PascalCase repository name (only if ORM !== 'none')
 *   repositoryCamel — camelCase repo variable
 */

export default `
import { Inject, Injectable{{#hasRepo}}, {{ repository }}{{/hasRepo}} } from 'nexus';

@Injectable()
export class {{ name }}Service {
  constructor({{#hasRepo}}
    @Inject({{ repository }}) private readonly {{ repositoryCamel }}: {{ repository }},
  {{/hasRepo}}) {}

  async findAll() {
    {{#hasRepo}}return this.{{ repositoryCamel }}.findAll();{{/hasRepo}}
    {{^hasRepo}}return []; // TODO: implement{{/hasRepo}}
  }

  async findOne(id: number) {
    {{#hasRepo}}return this.{{ repositoryCamel }}.findOne(id);{{/hasRepo}}
    {{^hasRepo}}return { id }; // TODO: implement{{/hasRepo}}
  }

  async create(data: any) {
    {{#hasRepo}}return this.{{ repositoryCamel }}.create(data);{{/hasRepo}}
    {{^hasRepo}}return { id: Date.now(), ...data }; // TODO: implement{{/hasRepo}}
  }

  async update(id: number, data: any) {
    {{#hasRepo}}return this.{{ repositoryCamel }}.update(id, data);{{/hasRepo}}
    {{^hasRepo}}return { id, ...data }; // TODO: implement{{/hasRepo}}
  }

  async delete(id: number) {
    {{#hasRepo}}return this.{{ repositoryCamel }}.delete(id);{{/hasRepo}}
    {{^hasRepo}}return { removed: id }; // TODO: implement{{/hasRepo}}
  }
}
`.trimStart();