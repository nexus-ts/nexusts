/**
 * `nexusjs/view` — view engine adapter + file-based view loader.
 *
 * Public API:
 * - `renderView(template, data, context?)` — render a view.
 *   If `template` ends in a known file extension (`.html`, `.edge`,
 *   `.rendu`, `.eta`) AND `setViewPaths()` has been called, the
 *   file is loaded from the first matching directory and used
 *   as the template source. Otherwise the string is treated as
 *   inline source.
 *   The adapter is selected by file extension (or Rendu for
 *   inline / non-extension values).
 * - `setViewPaths(path)` — configure the directory searched for
 *   view files. Pass `""` to disable.
 * - `getViewPaths()` — return the current path (empty = disabled).
 * - `loadTemplate(dir, name)` — low-level: load a file from
 *   the given directory.
 * - `Application.setViewPaths(path)` — same as the module
 *   function, but chainable.
 *
 * Adapters:
 * - RenduAdapter  (default for `.html`/`.rendu`/inline)
 * - EdgeAdapter   (for `.edge`)
 * - EtaAdapter    (for `.eta`)
 *
 * Override with `app.setViewAdapter(new MyAdapter())` to install
 * a different engine globally.
 */

export { EdgeAdapter } from "./edge.js";
export { EtaAdapter } from "./eta.js";
export { renderDefaultRoot } from "./inertia/default-ssr.js";
export { InertiaFormBuilder } from "./inertia/form-helper.js";
export { inertiaFormMiddleware } from "./inertia/form-middleware.js";
export {
	always,
	deepMerge,
	defer,
	merge,
	once,
	optional,
} from "./inertia/helpers.js";
export { Inertia } from "./inertia/inertia-adapter.js";
export type { ReactSsrOptions } from "./inertia/ssr/react-adapter.js";
export { createReactAdapter } from "./inertia/ssr/react-adapter.js";
export {
	asRegistry,
	ComponentRegistry,
	createRegistry,
} from "./inertia/ssr/registry.js";
export type { VueSsrOptions } from "./inertia/ssr/vue-adapter.js";
export { createVueAdapter } from "./inertia/ssr/vue-adapter.js";
export type {
	InertiaConfig,
	InertiaPage,
	InertiaSharedProps,
	SsrAdapter,
	SsrRenderResult,
} from "./inertia/types.js";
export { RenduAdapter } from "./rendu.js";
export type {
	ViewAdapter,
	ViewContext,
	ViewOptions,
} from "./types.js";
export {
	getViewPaths,
	loadTemplate,
	renderView,
	setViewPaths,
} from "./view-engine.js";
