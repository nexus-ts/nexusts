/**
 * End-to-end HTTP tests using the full Application stack.
 *
 * Spins up a fresh Application per test, makes requests with the built-in
 * fetch, and asserts on the responses. The server is not actually opened
 * on a TCP port — we use the Hono app's `fetch` method directly.
 */
import 'reflect-metadata';
import { Application } from '@core/application';
import { Controller } from '@core/decorators/controller';
import { Delete, Get, Post } from '@core/decorators/http-methods';
import { Inject, Injectable } from '@core/decorators/injectable';
import { Module } from '@core/decorators/module';
import { Body, Param } from '@core/decorators/params';
import { Validate } from '@core/decorators/validate';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

@Injectable()
class CounterService {
  private n = 0;
  next() { return ++this.n; }
  current() { return this.n; }
  reset() { this.n = 0; }
}

@Controller('/count')
class CountController {
  constructor(@Inject(CounterService) private svc: CounterService) {}

  @Get('/')
  index() {
    return { value: this.svc.current() };
  }

  @Post('/inc')
  increment() {
    return { value: this.svc.next() };
  }

  @Get('/reset')
  reset() {
    this.svc.reset();
    return { value: 0 };
  }
}

@Controller('/echo')
class EchoController {
  @Post('/')
  @Validate({
    body: z.object({ message: z.string().min(1) }),
  })
  echo(@Body() body: { message: string }) {
    return { received: body.message, at: new Date().toISOString() };
  }

  @Delete('/:id')
  del(@Param('id') id: string) {
    return { removed: id };
  }
}

@Module({
  controllers: [CountController, EchoController],
  providers: [CounterService],
})
class E2eModule {}

let app: Application;

beforeEach(() => {
  app = new Application(E2eModule);
});

async function get(path: string) {
  return app.server.app.fetch(new Request(`http://test${path}`));
}

async function postJson(path: string, body: any) {
  return app.server.app.fetch(
    new Request(`http://test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

async function del(path: string) {
  return app.server.app.fetch(
    new Request(`http://test${path}`, { method: 'DELETE' })
  );
}

describe('Application e2e', () => {
  it('GET /count returns initial value', async () => {
    const res = await get('/count');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 0 });
  });

  it('POST /count/inc increments', async () => {
    const a = await postJson('/count/inc', {});
    expect(a.status).toBe(200);
    expect(await a.json()).toEqual({ value: 1 });

    const b = await postJson('/count/inc', {});
    expect(await b.json()).toEqual({ value: 2 });
  });

  it('GET /count/reset zeroes the counter', async () => {
    await postJson('/count/inc', {});
    await postJson('/count/inc', {});
    const res = await get('/count/reset');
    expect(await res.json()).toEqual({ value: 0 });
  });

  it('POST /echo returns received message', async () => {
    const res = await postJson('/echo', { message: 'hello' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe('hello');
    expect(typeof body.at).toBe('string');
  });

  it('POST /echo with invalid body returns 400', async () => {
    const res = await postJson('/echo', { message: '' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('DELETE /echo/:id returns the id', async () => {
    const res = await del('/echo/abc-123');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: 'abc-123' });
  });

  it('returns 404 for unknown routes', async () => {
    const res = await get('/nope');
    expect(res.status).toBe(404);
  });
});