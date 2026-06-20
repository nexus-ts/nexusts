/**
 * NestJS-style controller template.
 *
 * Renders an `@Controller(prefix)` class with `@Get` / `@Post` /
 * `@Put` / `@Delete` routes that delegate to an injected service.
 *
 * Context keys used:
 *   name       — PascalCase class name (e.g. "User")
 *   kebab      — kebab-case URL segment (e.g. "user")
 *   pascal     — alias for name (template convenience)
 *   camel      — camelCase variable name (e.g. "userService")
 *   service    — PascalCase service name (e.g. "UserService")
 *   serviceCamel — camelCase service variable (e.g. "userService")
 */

export default `
import { Body, Controller, Delete, Get, Inject, Param, Post, Put } from 'nexus';
import { {{ service }} } from '../services/{{ kebab }}.service.js';

@Controller('/{{ kebab }}s')
export class {{ name }}Controller {
  constructor(@Inject({{ service }}) private readonly {{ serviceCamel }}: {{ service }}) {}

  @Get('/')
  async index() {
    return this.{{ serviceCamel }}.findAll();
  }

  @Get('/:id')
  async show(@Param('id') id: string) {
    return this.{{ serviceCamel }}.findOne(Number(id));
  }

  @Post('/')
  async create(@Body() body: any) {
    return { status: 201, body: this.{{ serviceCamel }}.create(body) };
  }

  @Put('/:id')
  async update(@Param('id') id: string, @Body() body: any) {
    return this.{{ serviceCamel }}.update(Number(id), body);
  }

  @Delete('/:id')
  async destroy(@Param('id') id: string) {
    return this.{{ serviceCamel }}.delete(Number(id));
  }
}
`.trimStart();