/**
 * Tests for the SSR adapters.
 *
 * Because the adapters use dynamic imports of optional peer
 * dependencies (React, Vue, Svelte, Solid), we test their behaviour
 * against lightweight stub components rather than the real engines.
 * The adapters' contract is:
 *
 *   1. Resolve a registered component by name.
 *   2. Call a per-engine render function with `(component, props)`.
 *   3. Return `{ html, head }`.
 */
import { describe, expect, it } from "vitest";
import type { SsrAdapter, SsrRenderResult } from "@/view/inertia";
import {
	asRegistry,
	ComponentRegistry,
	createRegistry,
} from "@/view/inertia/ssr/registry";

describe("ComponentRegistry", () => {
	it("registers and resolves components", () => {
		const reg = new ComponentRegistry();
		const Home = () => "Home";
		reg.register("Home", Home);
		expect(reg.has("Home")).toBe(true);
		expect(reg.resolve("Home")).toBe(Home);
		expect(reg.resolve("Missing")).toBeUndefined();
	});

	it("registerAll accepts a plain map", () => {
		const Home = () => "Home";
		const Users = () => "Users";
		const reg = createRegistry({ Home, Users });
		expect(reg.size).toBe(2);
		expect(reg.resolve("Home")).toBe(Home);
		expect(reg.resolve("Users")).toBe(Users);
	});

	it("unregister removes a binding", () => {
		const reg = createRegistry({ Home: () => "Home" });
		expect(reg.has("Home")).toBe(true);
		expect(reg.unregister("Home")).toBe(true);
		expect(reg.has("Home")).toBe(false);
		expect(reg.unregister("Home")).toBe(false);
	});

	it("names() returns all registered names", () => {
		const reg = createRegistry({ A: 1, B: 2, C: 3 });
		expect(reg.names().sort()).toEqual(["A", "B", "C"]);
	});

	it("asRegistry normalizes input", () => {
		const reg = asRegistry({ A: 1 });
		expect(reg).toBeInstanceOf(ComponentRegistry);
		expect(reg.resolve("A")).toBe(1);

		const reg2 = asRegistry(createRegistry({ B: 2 }));
		expect(reg2).toBeInstanceOf(ComponentRegistry);
		expect(reg2.resolve("B")).toBe(2);
	});
});

/**
 * Helper: build an adapter whose `render` simply echoes the props.
 * Lets us test the integration logic without mocking the engine.
 */
function echoAdapter(): SsrAdapter {
	return {
		name: "echo",
		async render(
			_component: string,
			props: Record<string, any>,
		): Promise<SsrRenderResult> {
			return { html: `echo:${JSON.stringify(props)}`, head: [] };
		},
	};
}

describe("Adapter contract", () => {
	it("returns html and head arrays", async () => {
		const adapter = echoAdapter();
		const result = await adapter.render("Test", { foo: "bar" });
		expect(result.html).toBe('echo:{"foo":"bar"}');
		expect(result.head).toEqual([]);
	});

	it("name field is exposed for diagnostics", () => {
		expect(echoAdapter().name).toBe("echo");
	});
});

describe("createReactAdapter (factory contract)", () => {
	it("returns an adapter with name='react'", async () => {
		const mod = await import("@/view/inertia/ssr/react-adapter");
		expect(typeof mod.createReactAdapter).toBe("function");
		const Home = () => "Home";
		const adapter = mod.createReactAdapter({ components: { Home } });
		expect(adapter.name).toBe("react");
		expect(typeof adapter.render).toBe("function");
	});
});

describe("createVueAdapter (factory contract)", () => {
	it("exposes createVueAdapter with name='vue'", async () => {
		const mod = await import("@/view/inertia/ssr/vue-adapter");
		const Home = { name: "Home" };
		const adapter = mod.createVueAdapter({ components: { Home } });
		expect(adapter.name).toBe("vue");
		expect(typeof adapter.render).toBe("function");
	});
});

describe("createSvelteAdapter (factory contract)", () => {
	it("exposes createSvelteAdapter with name='svelte'", async () => {
		const mod = await import("@/view/inertia/ssr/svelte-adapter");
		const Home = { render: () => ({ html: "<h1>Home</h1>" }) };
		const adapter = mod.createSvelteAdapter({ components: { Home } });
		expect(adapter.name).toBe("svelte");
	});

	it("falls back to Svelte 4 component.render when svelte/server is missing", async () => {
		const mod = await import("@/view/inertia/ssr/svelte-adapter");
		const Svelte4Component = {
			render: (props: any) => ({
				html: `<h1>${props.title}</h1>`,
				head: "<title>x</title>",
			}),
		};
		const adapter = mod.createSvelteAdapter({
			components: { Home: Svelte4Component },
		});
		const result = await adapter.render("Home", { title: "Hello" });
		expect(result.html).toBe("<h1>Hello</h1>");
		expect(result.head).toEqual(["<title>x</title>"]);
	});

	it("throws clearly for missing components", async () => {
		const mod = await import("@/view/inertia/ssr/svelte-adapter");
		const adapter = mod.createSvelteAdapter({ components: {} });
		await expect(adapter.render("Missing", {})).rejects.toThrow(
			/Component "Missing" is not registered/,
		);
	});
});

describe("createSolidAdapter (factory contract)", () => {
	it("exposes createSolidAdapter with name='solid'", async () => {
		const mod = await import("@/view/inertia/ssr/solid-adapter");
		const Home = () => "Home";
		const adapter = mod.createSolidAdapter({ components: { Home } });
		expect(adapter.name).toBe("solid");
		expect(typeof adapter.render).toBe("function");
	});
});
