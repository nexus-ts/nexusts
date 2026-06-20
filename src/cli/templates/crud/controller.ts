/**
 * Controller template for `make:crud` (Nest style, with optional Inertia).
 *
 * Renders all five RESTful actions + an Inertia page if `view === 'inertia'`.
 */

export default `
import { Body, Controller, Delete, Get, Inject, Param, Post, Put } from 'nexus';
import { z } from 'zod';
import { Validate } from 'nexus';
import { {{ service }} } from '../services/{{ kebab }}.service.js';
{{#hasInertia}}import { Inertia } from 'nexus/view/inertia';{{/hasInertia}}

const Create{{ name }}Schema = z.object({
  // TODO: define fields
  title: z.string().min(1),
});

@Controller('/{{ kebab }}s')
export class {{ controller }} {
  constructor(
    @Inject({{ service }}) private readonly {{ camel }}Service: {{ service }},
{{#hasInertia}}    @Inject(Inertia.TOKEN) private readonly inertia: Inertia,{{/hasInertia}}
  ) {}

  @Get('/')
  async index() {
    const items = await this.{{ camel }}Service.findAll();
{{#hasInertia}}
    return this.inertia.render('{{ viewComponent }}', { items });
{{/hasInertia}}
{{^hasInertia}}
    return items;
{{/hasInertia}}
  }

  @Get('/:id')
  async show(@Param('id') id: string) {
    const item = await this.{{ camel }}Service.findOne(Number(id));
{{#hasInertia}}
    return this.inertia.render('{{ viewShowComponent }}', { item });
{{/hasInertia}}
{{^hasInertia}}
    return item;
{{/hasInertia}}
  }

  @Post('/')
  @Validate({ body: Create{{ name }}Schema })
  async create(@Body() body: z.infer<typeof Create{{ name }}Schema>) {
    return { status: 201, body: await this.{{ camel }}Service.create(body) };
  }

  @Put('/:id')
  @Validate({ body: Create{{ name }}Schema.partial() })
  async update(
    @Param('id') id: string,
    @Body() body: Partial<z.infer<typeof Create{{ name }}Schema>>,
  ) {
    return await this.{{ camel }}Service.update(Number(id), body);
  }

  @Delete('/:id')
  async destroy(@Param('id') id: string) {
    return await this.{{ camel }}Service.delete(Number(id));
  }
}
`.trimStart();