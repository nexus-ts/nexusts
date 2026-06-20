/**
 * DTO / validation schema template for `make:crud`.
 *
 * Generates a `{{ name }}Dto` schema and a typesafe `Create{{ name }}` type.
 */

export default `
import { z } from 'zod';

export const Create{{ name }}Dto = z.object({
  // TODO: define fields. Example:
  // title: z.string().min(1).max(200),
  // body: z.string().optional(),
});

export const Update{{ name }}Dto = Create{{ name }}Dto.partial();

export type Create{{ name }} = z.infer<typeof Create{{ name }}Dto>;
export type Update{{ name }} = z.infer<typeof Update{{ name }}Dto>;
`.trimStart();