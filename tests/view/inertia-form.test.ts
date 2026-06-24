/**
 * Tests for the Inertia `<Form>` server-side helper.
 *
 * Covers:
 * - `.withErrors()` flattens string / array values
 * - `.withErrorBag()` injects errorBag prop
 * - `.withValues()` re-populates the form after validation failure
 * - `.render()` produces an InertiaResponse carrying the errors
 * - `.redirect()` returns a 303 (PRG pattern)
 * - `.back()` returns a 303 with Location: back (or custom URL)
 * - Multiple errors on the same field accumulate
 */
import 'reflect-metadata';
import { Application } from '@core/application';
import { Controller } from '@core/decorators/controller';
import { Get, Post } from '@core/decorators/http-methods';
import { Inject } from '@core/decorators/injectable';
import { Module } from '@core/decorators/module';
import { Body } from '@core/decorators/params';
import { beforeEach, describe, expect, it } from 'vitest';
import { Inertia } from '@/view/inertia';

@Controller('/users')
class UsersFormController {
  constructor(@Inject(Inertia.TOKEN) private inertia: Inertia) {}

  @Get('/create')
  createForm() {
    return this.inertia.render('Users/Create', {});
  }

  @Post('/store')
  async store(@Body() input: Record<string, any>) {
    const form = this.inertia.form('Users/Create', { mode: 'create' });
    if (!input?.name) {
      return form
        .withErrorBag('createUser')
        .withErrors({ name: 'Name is required' })
        .withValues(input)
        .render();
    }
    return form.redirect('/users');
  }

  @Post('/multi-error')
  async multi(@Body() _input: Record<string, any>) {
    const form = this.inertia.form('Users/Create');
    return form
      .withErrors({
        email: 'Invalid email',
        password: ['Too short', 'Must contain a digit'],
      })
      .render();
  }
}

@Module({ controllers: [UsersFormController] })
class FormModule {}

let app: Application;

beforeEach(() => {
  app = new Application(FormModule, { inertia: { version: 'v1' } });
});

async function send(method: string, path: string, body?: any, extra: Record<string, string> = {}) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json', ...extra };
    init.body = JSON.stringify(body);
  } else {
    init.headers = { ...extra };
  }
  return app.server.app.fetch(new Request(`http://test${path}`, init));
}

const inertia = (extra: Record<string, string> = {}) => ({
  'X-Inertia': 'true',
  'X-Inertia-Version': 'v1',
  ...extra,
});

describe('InertiaFormBuilder', () => {
  it('exposes the Inertia instance via DI', () => {
    const inertia = app.container.resolve(Inertia.TOKEN);
    expect(inertia).toBeInstanceOf(Inertia);
  });

  it('renders the page with errors on validation failure', async () => {
    const res = await send('POST', '/users/store', { email: 'x' }, inertia());
    expect(res.status).toBe(200);
    expect(res.headers.get('x-inertia')).toBe('true');
    const body = await res.json();
    expect(body.component).toBe('Users/Create');
    expect(body.props.errors).toEqual({ name: ['Name is required'] });
    expect(body.props.errorBag).toBe('createUser');
    expect(body.props.values).toEqual({ email: 'x' });
    expect(body.props.mode).toBe('create');
  });

  it('returns 303 on success (PRG pattern)', async () => {
    const res = await send('POST', '/users/store', { name: 'Alice' }, inertia());
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/users');
  });

  it('flattens string errors into single-element arrays', async () => {
    const res = await send('POST', '/users/multi-error', {}, inertia());
    const body = await res.json();
    expect(body.props.errors).toEqual({
      email: ['Invalid email'],
      password: ['Too short', 'Must contain a digit'],
    });
  });

  it('.back() returns 303 with Location: back by default', () => {
    const inertia = app.container.resolve(Inertia.TOKEN);
    const form = inertia.form('Page');
    const res = form.back();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('back');
  });

  it('.back(to) accepts an override URL', () => {
    const inertia = app.container.resolve(Inertia.TOKEN);
    const form = inertia.form('Page');
    const res = form.back('/fallback');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/fallback');
  });

  it('accumulates multiple errors on the same field', () => {
    const inertia = app.container.resolve(Inertia.TOKEN);
    const form = inertia.form('Page');
    form.withError('email', 'Invalid').withError('email', 'Taken');
    expect(form.getErrors()).toEqual({ email: ['Invalid', 'Taken'] });
  });
});