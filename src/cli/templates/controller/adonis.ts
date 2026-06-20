/**
 * AdonisJS-style controller template (no decorators, just methods).
 *
 * Use when `nx.config.ts` has `routing: 'adonis'`. Routes are added
 * separately by the user (or by the `make:crud` command) to a route
 * table; this controller is just a plain class.
 */

export default `
import { {{ service }} } from '../services/{{ kebab }}.service.js';

export class {{ name }}Controller {
  async index() {
    return new {{ service }}().findAll();
  }

  async show({ params }: { params: { id: string } }) {
    return new {{ service }}().findOne(Number(params.id));
  }

  async create({ body }: { body: any }) {
    return { status: 201, body: new {{ service }}().create(body) };
  }

  async update({ params, body }: { params: { id: string }; body: any }) {
    return new {{ service }}().update(Number(params.id), body);
  }

  async destroy({ params }: { params: { id: string } }) {
    return new {{ service }}().delete(Number(params.id));
  }
}

export const {{ camel }}Controller = new {{ name }}Controller();
`.trimStart();