/**
 * Inertia adapter integration tests.
 *
 * Boots a fresh Application per scenario, makes real HTTP requests via
 * the Hono `fetch` API, and asserts on the Inertia protocol responses.
 *
 * Covers:
 * - HTML first-page load (no X-Inertia header)
 * - Inertia XHR JSON response
 * - Asset version mismatch → 409 + X-Inertia-Location
 * - Shared props merged into every response
 * - Deferred prop placeholder + deferredProps metadata
 * - Always-on prop rides along with partial reloads
 * - Optional prop dropped when value is below threshold
 * - Once prop only on first (HTML) load, never on XHR
 * - Merge prop → mergeProps metadata
 * - Merge with matchPropsOn → deepMergeProps + matchPropsOn
 * - Partial reload only/except via headers
 * - `inertia.location()` → 409 + X-Inertia-Location
 * - `inertia.back()` → 302 + Location: back
 */
import 'reflect-metadata';
import { Application } from '@core/application';
import { Controller } from '@core/decorators/controller';
import { Get, Post } from '@core/decorators/http-methods';
import { Inject } from '@core/decorators/injectable';
import { Module } from '@core/decorators/module';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  always,
  deepMerge,
  defer,
  Inertia,
  merge,
  once,
  optional,
} from '@/view/inertia';

class _Counter {
  n = 0;
  bump() { return ++this.n; }
}

@Controller('/page')
class PageController {
  constructor(@Inject(Inertia.TOKEN) private inertia: Inertia) {}

  @Get('/')
  home() {
    return this.inertia.render('Home', {
      msg: 'hello',
    });
  }

  @Get('/dashboard')
  dashboard() {
    return this.inertia.render('Dashboard', {
      currentUser: always(() => ({ id: 1, name: 'Alice' })),
      notifications: [{ id: 1, text: 'ping' }],
      stats: defer(async () => ({ visits: 99 }), 'default'),
      recentOrders: optional(() => [
        { id: 'a', total: 1 },
      ]),
      featureFlags: once(() => ({ beta: true })),
    });
  }

  @Get('/empty-optional')
  emptyOptional() {
    return this.inertia.render('EmptyOptional', {
      items: optional(() => [] as any[], 0),
    });
  }

  @Get('/paginated')
  paginated() {
    return this.inertia.render('Users/Index', {
      users: merge(() => [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ], [['id']]),
      page: 1,
    });
  }

  @Get('/settings')
  settings() {
    return this.inertia.render('Settings', {
      settings: deepMerge(() => ({
        theme: 'dark',
        notifications: { email: true },
      })),
    });
  }

  @Post('/logout')
  logout() {
    return this.inertia.location('/login');
  }

  @Get('/back')
  back() {
    return this.inertia.back();
  }
}

@Module({ controllers: [PageController] })
class PageModule {}

let app: Application;

beforeEach(() => {
  app = new Application(PageModule, {
    inertia: {
      version: 'v1',
      title: 'Test',
      sharedProps: { appName: 'NexusTS Test', csrfToken: 'tok' },
    },
  });
});

async function get(path: string, headers: Record<string, string> = {}) {
  return app.server.app.fetch(new Request(`http://test${path}`, { headers }));
}

async function post(path: string, headers: Record<string, string> = {}) {
  return app.server.app.fetch(
    new Request(`http://test${path}`, { method: 'POST', headers })
  );
}

function inertiaHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'X-Inertia': 'true',
    'X-Inertia-Version': 'v1',
    ...extra,
  };
}

describe('Inertia adapter', () => {
  // -------------------------------------------------------------------------
  // Basic protocol
  // -------------------------------------------------------------------------

  it('returns HTML shell on first page load', async () => {
    const res = await get('/page');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain('<div id="app" data-page=');
    expect(html).toContain('Home');
    expect(html).toContain('hello');
  });

  it('returns JSON for XHR requests', async () => {
    const res = await get('/page', inertiaHeaders());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(res.headers.get('x-inertia')).toBe('true');
    expect(res.headers.get('vary')).toBe('X-Inertia');
    const body = await res.json();
    expect(body.component).toBe('Home');
    expect(body.props.msg).toBe('hello');
    expect(body.version).toBe('v1');
    expect(body.encryptHistory).toBe(false);
  });

  it('merges shared props into every response', async () => {
    const res = await get('/page', inertiaHeaders());
    const body = await res.json();
    expect(body.props.appName).toBe('NexusTS Test');
    expect(body.props.csrfToken).toBe('tok');
  });

  // -------------------------------------------------------------------------
  // Asset versioning
  // -------------------------------------------------------------------------

  it('returns 409 + X-Inertia-Location on asset version mismatch', async () => {
    const res = await get('/page', inertiaHeaders({ 'X-Inertia-Version': 'WRONG' }));
    expect(res.status).toBe(409);
    expect(res.headers.get('x-inertia-location')).toBe('http://test/page');
  });

  it('skips version check when client omits the header', async () => {
    const res = await get('/page', { 'X-Inertia': 'true' });
    expect(res.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  it('renders deferred prop as null placeholder with deferredProps metadata', async () => {
    const res = await get('/page/dashboard', inertiaHeaders());
    const body = await res.json();
    expect(body.props.stats).toBeNull();
    expect(body.deferredProps).toEqual({ default: ['stats'] });
  });

  it('always-on props survive partial reloads', async () => {
    const res = await get('/page/dashboard', inertiaHeaders({
      'X-Inertia-Partial-Component': 'Dashboard',
      'X-Inertia-Partial-Data': 'currentUser',
    }));
    const body = await res.json();
    // Only `currentUser` is requested, plus shared + always props.
    expect(Object.keys(body.props).sort()).toEqual([
      'appName',
      'csrfToken',
      'currentUser',
    ]);
    expect(body.props.currentUser).toEqual({ id: 1, name: 'Alice' });
  });

  it('drops optional props below threshold on partial reload', async () => {
    const res = await get('/page/empty-optional', inertiaHeaders({
      'X-Inertia-Partial-Component': 'EmptyOptional',
      'X-Inertia-Partial-Data': 'items',
    }));
    const body = await res.json();
    // `items` is optional and empty (length 0 == threshold); dropped
    // on partial reload.
    expect(body.props.items).toBeUndefined();
  });

  it('emits mergeProps + matchPropsOn for merge() helper', async () => {
    const res = await get('/page/paginated', inertiaHeaders());
    const body = await res.json();
    expect(body.mergeProps).toEqual(['users']);
    expect(body.deepMergeProps).toEqual(['users']);
    expect(body.matchPropsOn).toEqual([[['id']]]);
  });

  it('emits deepMergeProps for deepMerge() helper', async () => {
    const res = await get('/page/settings', inertiaHeaders());
    const body = await res.json();
    expect(body.mergeProps).toEqual(['settings']);
    expect(body.deepMergeProps).toEqual(['settings']);
    expect(body.props.settings).toEqual({
      theme: 'dark',
      notifications: { email: true },
    });
  });

  it('drops once props on XHR (only included on HTML first load)', async () => {
    const html = await get('/page/dashboard');
    const htmlText = await html.text();
    expect(htmlText).toContain('featureFlags');

    const xhr = await get('/page/dashboard', inertiaHeaders());
    const body = await xhr.json();
    expect(body.props.featureFlags).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Partial reloads
  // -------------------------------------------------------------------------

  it('respects X-Inertia-Partial-Except', async () => {
    const res = await get('/page/dashboard', inertiaHeaders({
      'X-Inertia-Partial-Component': 'Dashboard',
      'X-Inertia-Partial-Except': 'notifications',
    }));
    const body = await res.json();
    expect(body.props.notifications).toBeUndefined();
    expect(body.props.currentUser).toBeDefined(); // always-on
    expect(body.props.recentOrders).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Special responses
  // -------------------------------------------------------------------------

  it('inertia.location() returns 409 + X-Inertia-Location', async () => {
    const res = await post('/page/logout', inertiaHeaders());
    expect(res.status).toBe(409);
    expect(res.headers.get('x-inertia-location')).toBe('/login');
  });

  it('inertia.back() returns 302 + Location: back', async () => {
    const res = await get('/page/back', inertiaHeaders());
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('back');
  });
});