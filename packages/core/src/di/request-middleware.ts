/**
 * Hono middleware that activates a `RequestScope` for the duration
 * of an HTTP request. The scope is held in `AsyncLocalStorage` and
 * propagated through the entire async call tree.
 *
 *   - At request start: build a new `RequestScope` (with a child
 *     DI container that inherits from the application's container).
 *   - Run the rest of the request inside the scope.
 *   - At request end: the scope (and child container) is dropped,
 *     so all per-request state is garbage-collected.
 *
 * The framework installs this middleware on the Hono app at
 * `NexusServer.start()` / `Application.listen()` time.
 */
import type { MiddlewareHandler } from "hono";
import { DIContainer } from "./container.js";
import {
	type HonoContext,
	REQUEST,
	REQUEST_SCOPE,
	RequestScopeStorage,
} from "./request-scope.js";

/**
 * One-time setup: register the `REQUEST` and `REQUEST_SCOPE` tokens
 * on the root container. The factory reads the active scope on
 * each resolve, so the same `REQUEST` always points at the
 * current request regardless of which container resolves it.
 *
 * Idempotent — calling it twice is a no-op.
 */
export function installRequestTokens(root: DIContainer): void {
	// Avoid duplicate registrations on the same container.
	const existing = (root as any).providers as Map<unknown, unknown> | undefined;
	if (existing && (existing.has(REQUEST) || existing.has(REQUEST_SCOPE))) return;

	root.register({
		provide: REQUEST,
		scope: "transient",
		useFactory: () => RequestScopeStorage.get()?.context,
	});
	root.register({
		provide: REQUEST_SCOPE,
		scope: "transient",
		useFactory: () => RequestScopeStorage.get(),
	});
}

/**
 * Build the request-scope middleware against the given root container.
 * The root container is the application's `ApplicationContainer` —
 * the one that holds every singleton provider.
 *
 * Call `installRequestTokens(root)` once before the server starts.
 * (The framework does this for you; you only need to call this
 * factory directly when wiring a custom Hono app.)
 */
export function requestScopeMiddleware(root: DIContainer): MiddlewareHandler {
	installRequestTokens(root);
	return async (c, next) => {
		// The request container shares the root's providers but
		// gets its own per-request cache (the `singletons` Map).
		const reqContainer = new DIContainer(root);
		const scope = RequestScopeStorage.create(c as HonoContext, reqContainer);
		return RequestScopeStorage.run(scope, () => next());
	};
}