/**
 * Functional (Hono-native) controller template.
 *
 * Each route is a plain function `(c) => Response`. Useful for
 * webhooks, SSE endpoints, or anything that doesn't fit a class shape.
 */

export default `
import type { Context } from 'hono';

export const {{ camel }}Routes = {
  list: async (c: Context) => {
    return c.json([]);
  },

  show: async (c: Context) => {
    const id = c.req.param('id');
    return c.json({ id });
  },

  create: async (c: Context) => {
    const body = await c.req.json();
    return c.json({ created: body }, 201);
  },

  update: async (c: Context) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    return c.json({ id, body });
  },

  destroy: async (c: Context) => {
    const id = c.req.param('id');
    return c.json({ removed: id });
  },
};
`.trimStart();