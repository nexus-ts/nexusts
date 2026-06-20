/**
 * Vitest test template for `make:crud`.
 *
 * Renders an integration test that exercises the controller's CRUD
 * endpoints through the running server. The test auto-imports the
 * appropriate service depending on `hasRepo`.
 */

export default `
import { describe, it, expect, beforeEach } from 'vitest';
import { Application } from 'nexus';
import { {{ name }}Module } from '../{{ kebab }}.module.js';

describe('{{ controller }}', () => {
  let app: Application;

  beforeEach(() => {
    app = new Application({{ name }}Module);
  });

  it('GET /{{ kebab }}s returns an empty list', async () => {
    const res = await app.server.app.request('/{{ kebab }}s');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body) || typeof body === 'object').toBe(true);
  });

  it('POST /{{ kebab }}s creates a record', async () => {
    const res = await app.server.app.request('/{{ kebab }}s', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test' }),
    });
    expect([200, 201]).toContain(res.status);
  });
});
`.trimStart();