/**
 * Tests for the Inertia `lazy()` prop helper.
 *
 * Lazy props are resolved once per request, even if multiple keys point
 * at the same factory. This avoids redundant computation across
 * related props.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Application } from '@nexusts/core';
import { Module } from '@nexusts/core';
import { Controller } from '@nexusts/core';
import { Get } from '@nexusts/core';
import { Inject } from '@nexusts/core';
import { Inertia, lazy } from '@nexusts/view';

@Controller('/lazy')
class LazyController {
  @Inject(Inertia.TOKEN) declare private inertia: Inertia;

  /** Two props share the same `tag` — both should receive the same value. */
  @Get('/shared')
  shared() {
    return this.inertia.render('Shared', {
      a: lazy(() => ({ value: 'computed-once' }), 'shared-tag'),
      b: lazy(() => ({ value: 'computed-once' }), 'shared-tag'),
    });
  }

  /** Different tags → different invocations. */
  @Get('/distinct')
  distinct() {
    return this.inertia.render('Distinct', {
      a: lazy(() => Math.random()),
      b: lazy(() => Math.random()),
    });
  }

  /** Lazy that returns a promise. */
  @Get('/async')
  asyncLazy() {
    return this.inertia.render('Async', {
      data: lazy(async () => {
        await new Promise((r) => setTimeout(r, 5));
        return { ok: true };
      }),
    });
  }
}

@Module({ controllers: [LazyController] })
class LazyModule {}

let app: Application;

beforeEach(() => {
  app = new Application(LazyModule, { inertia: { version: 'v1' } });
});

async function get(path: string) {
  return app.server.app.fetch(
    new Request(`http://test${path}`, {
      headers: { 'X-Inertia': 'true', 'X-Inertia-Version': 'v1' },
    }),
  );
}

describe('Lazy props', () => {
  it('returns identical values for shared-tag props', async () => {
    const res = await get('/lazy/shared');
    const body = await res.json();
    expect(body.props.a).toEqual({ value: 'computed-once' });
    expect(body.props.b).toEqual({ value: 'computed-once' });
  });

  it('resolves separately when tags differ', async () => {
    const res = await get('/lazy/distinct');
    const body = await res.json();
    // Math.random() produces different values for distinct calls.
    expect(body.props.a).not.toBe(body.props.b);
    expect(typeof body.props.a).toBe('number');
  });

  it('resolves async factories', async () => {
    const res = await get('/lazy/async');
    const body = await res.json();
    expect(body.props.data).toEqual({ ok: true });
  });
});

/**
 * Factory invocation counter — verifies that shared-tag factories
 * execute only once per request. We use a controller defined at
 * module top level so the decorators apply correctly.
 */
@Controller('/count')
class CountingController {
  // Stash the counter on the class so tests can read it back.
  static calls = 0;

  @Inject(Inertia.TOKEN) declare public inertia: Inertia;

  @Get('/')
  count() {
    CountingController.calls = 0;
    return this.inertia.render('Count', {
      a: lazy(() => {
        CountingController.calls++;
        return 42;
      }, 'count-tag'),
      b: lazy(() => {
        CountingController.calls++;
        return 99;
      }, 'count-tag'),
    });
  }
}

@Module({ controllers: [CountingController] })
class CountingModule {}

describe('Lazy cache', () => {
  it('runs the factory only once for shared-tag props', async () => {
    const countingApp = new Application(CountingModule, {
      inertia: { version: 'v1' },
    });
    const res = await countingApp.server.app.fetch(
      new Request('http://test/count', {
        headers: { 'X-Inertia': 'true', 'X-Inertia-Version': 'v1' },
      }),
    );
    const body = await res.json();
    // Only one of the two factories ran (whichever the adapter hit first);
    // both props received the same value.
    expect(CountingController.calls).toBe(1);
    expect(body.props.a).toBe(42);
    expect(body.props.b).toBe(42);
  });
});