/**
 * Default Inertia HTML shell renderer.
 *
 * When no SSR adapter is configured (the most common case for getting
 * started), we ship a minimal HTML page with the page object embedded
 * as a `data-page` attribute. The client picks it up and hydrates from
 * there.
 *
 * When an SSR adapter is configured, we render the page tree and
 * inject the resulting HTML into `<div id="app">` before sending.
 */
import type { Context } from "hono";
import type { InertiaAdapter, InertiaPage, SsrAdapter } from "./types.js";

export async function renderDefaultRoot(
	adapter: InertiaAdapter,
	ssr: SsrAdapter | null,
	component: string,
	page: InertiaPage,
	c: Context,
): Promise<Response> {
	const title = adapter.title();
	const headTags: string[] = [];
	let bodyHtml = "";

	if (ssr) {
		try {
			const result = await ssr.render(component, page.props);
			bodyHtml = result.html ?? "";
			if (result.head) headTags.push(...result.head);
			if (result.data) {
				// Merge any extra data the SSR engine emitted (rare).
				Object.assign(page, result.data);
			}
		} catch (err) {
			// SSR is best-effort. If it fails we fall through to the shell
			// so the client can still hydrate from `data-page`.
			console.error(`[inertia] SSR render failed for "${component}":`, err);
		}
	}

	if (ssr?.head) {
		try {
			const extra = await ssr.head();
			headTags.push(...extra);
		} catch {
			// Ignore — head tags are optional.
		}
	}

 const scripts = adapter.scripts();
	const scriptTags = scripts
		.map((s) => `<script type="module" src="${escapeAttr(s)}"></script>`)
		.join("\n");

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${headTags.join("\n")}
</head>
<body>
<div id="app" data-page="${escapeAttr(JSON.stringify(page))}">${bodyHtml}</div>
${scriptTags}
</body>
</html>`;

	return c.html(html, 200, {
		Vary: "X-Inertia",
	});
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
	return escapeHtml(s).replace(/'/g, "&#39;");
}
