/**
 * Scalar UI HTML — a single self-contained page that loads Scalar
 * from the jsDelivr CDN.
 *
 * The page mounts Scalar as a custom-element via `<script
 * id="api-reference" data-url="...">` and waits for the CDN script
 * to upgrade it.
 *
 * No assets are bundled with the framework. No build step required.
 */

export function scalarHtml(opts: { title: string; specUrl: string; theme?: "default" | "dark" | "purple" | "alternate" | "moon" | "solarized" | "bluePlanet" | "saturn" | "kepler" | "mars" | "deepSpace" | "laserwave" | "none" }): string {
	const title = escapeHtml(opts.title);
	const theme = opts.theme ?? "default";
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — API Reference</title>
  <meta name="description" content="API reference for ${title}, generated from OpenAPI." />
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; }
  </style>
</head>
<body>
  <script
    id="api-reference"
    type="application/json"
    data-url="${escapeHtml(opts.specUrl)}"
    data-configuration='${escapeJsonForAttr(JSON.stringify({ theme, hideClientButton: true }))}'
  ></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.25.0"></script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Encode a string for use inside an HTML attribute value. We avoid
 * `&quot;` so the value remains valid JSON for Scalar's parser.
 */
function escapeJsonForAttr(s: string): string {
	return s.replace(/'/g, "&#39;").replace(/</g, "&lt;");
}