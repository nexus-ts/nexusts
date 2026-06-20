/**
 * Kysely model template.
 *
 * Generates a typed table interface + repository.
 *
 * Context:
 *   name        — PascalCase (e.g. "User")
 *   tableName   — snake_case plural (e.g. "users")
 */

export default `
import type { Generated, Insertable, Selectable, Updateable } from 'kysely';
import { Kysely } from 'kysely';
import { Inject, Injectable } from 'nexus';

export interface {{ name }}Table {
  id: Generated<number>;
{{ columns }}
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type {{ name }}       = Selectable<{{ name }}Table>;
export type New{{ name }}    = Insertable<{{ name }}Table>;
export type {{ name }}Update = Updateable<{{ name }}Table>;

@Injectable()
export class {{ name }}Repository {
  constructor(@Inject('DB') private readonly db: Kysely<any>) {}

  findAll() {
    return this.db.selectFrom('{{ tableName }}').selectAll().execute();
  }

  findOne(id: number) {
    return this.db
      .selectFrom('{{ tableName }}')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  create(data: New{{ name }}) {
    return this.db.insertInto('{{ tableName }}').values(data).returningAll().executeTakeFirst();
  }

  update(id: number, data: {{ name }}Update) {
    return this.db
      .updateTable('{{ tableName }}')
      .set(data)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  delete(id: number) {
    return this.db.deleteFrom('{{ tableName }}').where('id', '=', id).execute();
  }
}
`.trimStart();