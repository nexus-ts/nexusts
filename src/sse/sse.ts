/**
 * `sse()` — wrap a stream-producing callback in a Hono `streamSSE()`
 * call. Returns a `Response` with `text/event-stream` content type.
 *
 *   import { sse } from 'nexus/sse';
 *
 *   @Get('/events')
 *   events(@Req() c: any) {
 *     return sse(c, (stream) => {
 *       const t = setInterval(() => {
 *         stream.send({ event: 'tick', data: Date.now() });
 *       }, 1000);
 *       stream.onClose(() => clearInterval(t));
 *     });
 *   }
 *
 * The callback may be sync or async. When the client disconnects,
 * `onClose` callbacks fire and the Hono streaming context closes.
 *
 * Implementation: we use Hono's `streamSSE()` helper. The returned
 * `Response` is wired into the framework's existing response
 * pipeline — the framework just passes it through to the client.
 */
import { SseStream } from "./sse-stream.js";
import type { SseStreamController } from "./types.js";

/**
 * The `sse()` helper.
 *
 * @param c  Hono context. Pass via `@Req()` in a controller.
 * @param handler  Callback that pushes events onto the stream.
 * @returns A `Response` with `text/event-stream` content type.
 */
export function sse(
	c: any,
	handler: (stream: SseStreamController) => void | Promise<void>,
): Response {
	// Lazy import keeps the top-level `nexus/sse` module from
	// hard-depending on `hono/streaming` (Hono is already a peer).
	const mod = require("hono/streaming") as typeof import("hono/streaming");
	const response = mod.streamSSE(c, async (api) => {
		const stream = new SseStream(api);
		try {
			await handler(stream);
		} finally {
			await stream.close();
		}
	});
	return response as unknown as Response;
}

/**
 * `sseJson()` — convenience alias for `sse()`. Object payloads are
 * auto-JSON-stringified in either form.
 */
export const sseJson = sse;

/**
 * Extract the `Last-Event-ID` header from a Hono context. Returns
 * `null` if the header is missing.
 */
export function getLastEventId(c: { req: { header(name: string): string | undefined } }): string | null {
	const v = c.req.header("Last-Event-ID");
	return v ?? null;
}
