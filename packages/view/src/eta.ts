/**
 * Eta template engine adapter.
 *
 * Eta is a lightweight, high-performance templating engine with
 * EJS-like syntax (`<%= expr %>`, `<% code %>`). It works on every
 * runtime (Bun, Node, Deno, Cloudflare Workers) because templates
 * are compiled to JavaScript render functions — no eval, no
 * filesystem access at render time.
 *
 * Install (optional peer dep): `bun add eta`
 *
 *   import { EtaAdapter } from "nexusjs/view";
 *   const eta = new EtaAdapter();
 *   const html = await eta.render("<h1><%= it.title %></h1>", { title: "Hi" });
 *
 * Or just use a file with a `.eta` extension — `renderView` picks
 * the Eta adapter automatically:
 *
 *   setViewPaths("views");
 *   return { view: "about.eta", data: { title: "Hi" } };
 */
import type { ViewAdapter, ViewContext, ViewOptions } from "./types.js";

export class EtaAdapter implements ViewAdapter {
	readonly name = "eta";
	private cache = new Map<string, (data: Record<string, any>) => string>();

	async render(
		template: string,
		data: Record<string, any>,
		_context?: ViewContext,
		_options?: ViewOptions,
	): Promise<string> {
		const compiled = this.getCompiled(template);
		return compiled(data);
	}

	compile(template: string, _options?: ViewOptions) {
		const compiled = this.getCompiled(template);
		return (data: Record<string, any>) => Promise.resolve(compiled(data));
	}

	private getCompiled(template: string) {
		let fn = this.cache.get(template);
		if (!fn) {
			// Lazy require so `eta` is truly optional. If the
			// user never uses `.eta` files, Eta isn't loaded.
			let Eta: any;
			try {
				Eta = require("eta").Eta;
			} catch (e) {
				throw new Error(
					`[nexus] EtaAdapter: the "eta" package is not installed. ` +
						`Run \`bun add eta\` (or \`npm install eta\`) to use .eta templates.`,
				);
			}
			const eta = new Eta();
			fn = (data: Record<string, any>) =>
				eta.renderString(template, data) as string;
			this.cache.set(template, fn);
		}
		return fn;
	}
}
