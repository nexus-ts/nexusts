/**
 * Ambient type declarations for `hono/streaming`.
 *
 * `nexus/sse` uses Hono's `streamSSE()` helper. We import it lazily
 * so the top-level `nexus/sse` module has zero direct dependency on
 * `hono/streaming` (Hono is already a peer dep).
 */
declare module "hono/streaming" {
	export interface SSEStreamingApi {
		writeSSE(message: {
			id?: string;
			event?: string;
			data: string;
			retry?: number;
		}): Promise<void>;
		write(message: string): Promise<void>;
		sleep(ms: number): Promise<void>;
		close(): Promise<void>;
		abort(): void;
		onAbort(callback: () => void): void;
	}

	export type SSEStreamingHandler = (
		stream: SSEStreamingApi,
	) => Promise<void>;

	export type SSEStreamingFactory = (
		c: any,
		callback: SSEStreamingHandler,
		onError?: (e: Error) => void,
	) => Response;

	export const streamSSE: SSEStreamingFactory;

	export type SSEMessage = {
		id?: string;
		event?: string;
		data: string;
		retry?: number;
	};
}