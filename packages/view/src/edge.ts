/**
 * Edge-style template engine adapter (Adonis-style).
 *
 * Edge is the templating engine built for AdonisJS with a mustache-like
 * syntax (`{{ }}`, `@if`, `@each`). It is bundled here as a placeholder
 * for users who prefer that style.
 *
 * The adapter does not bundle Edge directly — it expects the user to
 * provide an `Edge` instance via the constructor so the dependency
 * stays optional.
 */
import type { ViewAdapter, ViewContext, ViewOptions } from "./types.js";

export interface EdgeLike {
	renderRaw?: (template: string, data: Record<string, any>) => Promise<string>;
	renderString?: (
		template: string,
		data: Record<string, any>,
	) => Promise<string>;
}

export class EdgeAdapter implements ViewAdapter {
	readonly name = "edge";
	constructor(private edge?: EdgeLike) {}

	async render(
		template: string,
		data: Record<string, any>,
		_context?: ViewContext,
		options?: ViewOptions,
	): Promise<string> {
		if (!this.edge) {
			throw new Error(
				"EdgeAdapter requires an Edge instance. " +
					"Install `edge.js` and pass it to `new EdgeAdapter(edge)`, " +
					"or use the default RenduAdapter instead.",
			);
		}
		const fn = this.edge.renderRaw ?? this.edge.renderString;
		if (!fn) {
			throw new Error(
				"Provided Edge instance does not implement renderRaw/renderString.",
			);
		}
		return fn.call(this.edge, template, { ...data, $OPTIONS: options });
	}
}
