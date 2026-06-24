/**
 * View engine abstraction.
 *
 * The framework can render templates using any installed engine. Built-in
 * adapters ship for Rendu (PHP-style templates), Edge (Adonis-style),
 * and Eta (EJS-style).
 *
 * The default adapter is Rendu because it works on every runtime —
 * Cloudflare Workers, Bun, Deno, and Node — without extra dependencies.
 */

import { EdgeAdapter } from "./edge.js";
import { EtaAdapter } from "./eta.js";
import { RenduAdapter } from "./rendu.js";
import type { ViewAdapter, ViewContext } from "./types.js";

export type { ViewAdapter, ViewContext, ViewOptions } from "./types.js";

/**
 * A single directory to search when the `view` value looks like a file path
 * (e.g. `"about.html"` or `"emails/welcome.html"`). Configured via
 * `setViewPaths()` or `Application.setViewPaths()`. Empty by default
 * — leave it empty (the default) to require inline templates,
 * or set it once at boot to enable file-based views.
 */
let viewPath: string = "";

/** Set the directory searched for view files. Pass `""` to disable. */
export function setViewPaths(path: string): void {
	viewPath = path ? (path.endsWith("/") || path.endsWith("\\") ? path : `${path}/`) : "";
}

/** Return the current view path (empty string means disabled). */
export function getViewPaths(): string {
	return viewPath;
}

/** File extensions that indicate the `view` value is a file path. */
const VIEW_FILE_EXTS = [".html", ".edge", ".rendu", ".eta"] as const;

/**
 * Is the given string a file path (i.e. has one of the known view
 * file extensions)? Used to decide whether `renderView` should
 * load the file from disk or treat the string as inline source.
 */
function isViewFilePath(name: string): boolean {
	const lower = name.toLowerCase();
	return VIEW_FILE_EXTS.some((ext) => lower.endsWith(ext));
}

/**
 * Pick the right adapter for a given template source. Selection
 * is by file extension:
 *   `.edge`  → EdgeAdapter
 *   `.eta`   → EtaAdapter
 *   `.html` / `.rendu` / no extension  → RenduAdapter (default)
 */
function selectAdapter(template: string): ViewAdapter {
	const lower = template.toLowerCase();
	if (lower.endsWith(".edge")) return new EdgeAdapter();
	if (lower.endsWith(".eta")) return new EtaAdapter();
	return new RenduAdapter();
}

/**
 * Render a view.
 *
 * - If `template` ends in a known view file extension (`.html`,
 *   `.edge`, `.rendu`, `.eta`) and `viewPaths` is non-empty, the
 *   file is loaded from the first matching directory and used
 *   as the template source. The adapter is picked by extension.
 * - Otherwise `template` is treated as inline template source
 *   with the default (Rendu) adapter.
 *
 * Override the default adapter globally with
 * `app.setViewAdapter()`.
 */
export async function renderView(
	template: string,
	data: Record<string, any>,
	context?: ViewContext,
): Promise<string> {
	let source = template;
	if (isViewFilePath(template) && viewPath.length > 0) {
		const loaded = await loadTemplate(viewPath, template);
		if (loaded === null) {
			throw new Error(
				`[nexus] View file not found: "${template}" (searched: ${viewPath})`,
			);
		}
		source = loaded;
	}
	const adapter = selectAdapter(source);
	return adapter.render(source, data, context);
}

/**
 * Try to locate a template file inside the given directory. Returns the
 * file contents or `null` if not found. This is intentionally
 * filesystem-based and only used on serverful runtimes; edge adapters
 * should pass inline strings instead.
 */
export async function loadTemplate(
	dir: string,
	name: string,
): Promise<string | null> {
	if (!dir) return null;
	const full = joinPath(dir, name);
	try {
		const file = await readFile(full);
		if (file !== null) return file;
	} catch {
		// ignore
	}
	return null;
}

/**
 * Path join that works on both POSIX and Windows. Node/Bun provide path,
 * but Cloudflare Workers do not, so we re-implement minimally.
 */
function joinPath(dir: string, name: string): string {
	if (!dir.endsWith("/") && !dir.endsWith("\\")) return `${dir}/${name}`;
	return `${dir}${name}`;
}

async function readFile(path: string): Promise<string | null> {
	// Node/Bun.
	if (typeof globalThis.Bun !== "undefined") {
		try {
			const file = (globalThis as any).Bun.file(path);
			if (await file.exists()) return file.text();
		} catch {
			// ignore
		}
	}
	// Node-style (also works in Bun).
	try {
		const fs = await import("node:fs/promises");
		return await fs.readFile(path, "utf8");
	} catch {
		return null;
	}
}
