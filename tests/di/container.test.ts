/**
 * Unit tests for the DI container.
 */
import { describe, it, expect } from 'vitest';
import { DIContainer } from '@nexusts/core';
import { Injectable, Inject } from '@nexusts/core';

describe('DIContainer', () => {
  it('resolves a class provider with field injection (via @Inject)', () => {
    @Injectable()
    class Logger {
      log(msg: string) { return `[log] ${msg}`; }
    }

    @Injectable()
    class App {
      @Inject(Logger) declare logger: Logger;
    }

    const c = new DIContainer();
    c.register([Logger, App]);
    const app = c.resolve(App);
    expect(app.logger).toBeInstanceOf(Logger);
    expect(app.logger.log('hi')).toBe('[log] hi');
  });

  it('caches singleton instances', () => {
    @Injectable()
    class Counter {
      count = 0;
    }

    const c = new DIContainer();
    c.register(Counter);
    const a = c.resolve(Counter);
    const b = c.resolve(Counter);
    expect(a).toBe(b);
    a.count++;
    expect(b.count).toBe(1);
  });

  it('supports value providers', () => {
    const c = new DIContainer();
    c.register({ provide: 'CONFIG', useValue: { port: 3000 } });
    expect(c.resolve<{ port: number }>('CONFIG').port).toBe(3000);
  });

  it('supports factory providers', () => {
    const c = new DIContainer();
    c.register({
      provide: 'TS',
      useFactory: () => new Date().toISOString(),
    });
    const ts = c.resolve<string>('TS');
    expect(typeof ts).toBe('string');
  });

  it('supports existing (alias) providers', () => {
    @Injectable()
    class Real {}
    const c = new DIContainer();
    c.register([Real, { provide: 'ALIAS', useExisting: Real }]);
    expect(c.resolve<Real>('ALIAS')).toBeInstanceOf(Real);
  });

  it('detects circular dependencies', () => {
    // Use string tokens to avoid class hoisting issues with esbuild.
    const TOK_A = 'TOK_A';
    const TOK_B = 'TOK_B';

    @Injectable()
    class RealA {
      @Inject(TOK_B) declare a: any;
    }
    @Injectable()
    class RealB {
      @Inject(TOK_A) declare b: any;
    }

    const c = new DIContainer();
    c.register([
      { provide: TOK_A, useClass: RealA },
      { provide: TOK_B, useClass: RealB },
    ]);
    expect(() => c.resolve(TOK_A)).toThrow(/Circular dependency/);
  });

  it('throws a helpful error for unknown tokens', () => {
    const c = new DIContainer();
    expect(() => c.resolve('UNKNOWN')).toThrow(/No provider for "UNKNOWN"/);
  });

  it('walks up the parent chain for missing tokens', () => {
    const parent = new DIContainer();
    parent.register({ provide: 'PARENT_VAL', useValue: 42 });
    const child = parent.createChild();
    expect(child.resolve<number>('PARENT_VAL')).toBe(42);
  });

  it('returns undefined for tryResolve on missing tokens', () => {
    const c = new DIContainer();
    expect(c.tryResolve('MISSING')).toBeUndefined();
  });
});