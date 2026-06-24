/**
 * Node.js runtime adapter.
 *
 * Falls back to the standard `node:http` module. Bun can also run this
 * adapter when targeting Node-compatible servers, but Bun's native
 * adapter is significantly faster — only use this on actual Node.
 */

import { createServer } from "node:http";
import type { Hono } from "hono";

export function nodeAdapter(app: Hono, port: number = 3000): any {
	const server = createServer(async (req, res) => {
		try {
			const url = `http://${req.headers.host}${req.url}`;
			const headers = new Headers();
			for (const [k, v] of Object.entries(req.headers)) {
				if (v == null) continue;
				if (Array.isArray(v)) headers.set(k, v.join(", "));
				else headers.set(k, String(v));
			}

			const method = req.method ?? "GET";
			const init: RequestInit = { method, headers };

			if (method !== "GET" && method !== "HEAD") {
				const bodyBuf = await new Promise<Buffer>((resolve, reject) => {
					const chunks: Buffer[] = [];
					req.on("data", (c) => chunks.push(c));
					req.on("end", () => resolve(Buffer.concat(chunks)));
					req.on("error", reject);
				});
				// Web Request accepts ReadableStream (preferred) or a BufferSource.
				// Node's Buffer is a Uint8Array subclass but TS treats it as
				// `Buffer<ArrayBufferLike>` which isn't assignable to BodyInit, so
				// we copy into a plain Uint8Array view of the same memory.
				init.body = new Uint8Array(
					bodyBuf.buffer,
					bodyBuf.byteOffset,
					bodyBuf.byteLength,
				) as BodyInit;
				// Duplex is required when sending a body in undici.
				(init as any).duplex = "half";
			}

			const honoRes = await app.fetch(new Request(url, init));
			res.statusCode = honoRes.status;
			honoRes.headers.forEach((v, k) => { res.setHeader(k, v); });
			const buf = Buffer.from(await honoRes.arrayBuffer());
			res.end(buf);
		} catch (err) {
			console.error("[node-adapter] error:", err);
			res.statusCode = 500;
			res.end("Internal Server Error");
		}
	});

	server.listen(port, () => {
		console.log(`[nexus] Listening on http://localhost:${port}`);
	});

	return server;
}
