/**
 * @Controller decorator — dual-mode (TC39 standard + legacy).
 *
 * Marks a class as a controller and registers a route prefix.
 * Routes inside the controller class are decorated with @Get/@Post/etc.
 *
 * Standard mode:
 * ```ts
 * @Controller('/users')
 * class UserController {
 *   @Get('/')
 *   list(ctx: Context) { ... }
 * }
 * ```
 *
 * Legacy mode (experimentalDecorators: true) continues to work identically.
 */
import { safeDefineMeta, } from "../di/safe-reflect.js";
import { METADATA_KEY } from "../constants.js";
import { initNexusMeta, getMeta, hasMeta } from "../di/standard-meta.js";
import type { ControllerMetadata } from "../di/tokens.js";

export function Controller(prefix: string = "/"): any {
	return function (this: any, target: any, context?: any): void {
		const normalized = normalizePrefix(prefix);
		const meta: ControllerMetadata = { prefix: normalized };

		// ── Standard decorator mode (TC39) ──
		if (context?.kind === "class" && context?.metadata) {
			context.metadata[METADATA_KEY.CONTROLLER] = meta;
			if (typeof target === "function") {
				initNexusMeta(target as Function, context.metadata);
			}
			return;
		}

		// ── Legacy decorator mode ──
		safeDefineMeta(METADATA_KEY.CONTROLLER, meta, target);
	};
}

export function getControllerMetadata(target: any): ControllerMetadata {
	return getMeta(target, METADATA_KEY.CONTROLLER) ?? { prefix: "/" };
}

export function isController(target: any): boolean {
	return hasMeta(target, METADATA_KEY.CONTROLLER);
}

/**
 * Normalize a prefix so we can safely concatenate it with handler paths.
 * - Empty string becomes '/'.
 * - Trailing slashes are trimmed (we re-add them on the join).
 * - No leading slash is added; the router always joins with `/`.
 */
function normalizePrefix(prefix: string): string {
	if (!prefix) return "";
	if (prefix !== "/" && prefix.endsWith("/")) {
		return prefix.slice(0, -1);
	}
	return prefix;
}