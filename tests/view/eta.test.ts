import { describe, expect, it } from "vitest";
import { EtaAdapter } from "../../src/view/eta.js";

describe("EtaAdapter", () => {
	it("renders a basic template with interpolation", async () => {
		const adapter = new EtaAdapter();
		const html = await adapter.render("<h1><%= it.title %></h1>", { title: "Hello" });
		expect(html).toBe("<h1>Hello</h1>");
	});

	it("handles EJS-style conditionals", async () => {
		const adapter = new EtaAdapter();
		const template = `<% if (it.show) { %><p>visible</p><% } else { %><p>hidden</p><% } %>`;
		const html = await adapter.render(template, { show: true });
		expect(html).toBe("<p>visible</p>");
	});

	it("handles loops", async () => {
		const adapter = new EtaAdapter();
		const template = `<ul><% it.items.forEach(function(item) { %><li><%= item %></li><% }) %></ul>`;
		const html = await adapter.render(template, { items: ["a", "b", "c"] });
		expect(html).toBe("<ul><li>a</li><li>b</li><li>c</li></ul>");
	});

	it("compiles a template to a reusable function", async () => {
		const adapter = new EtaAdapter();
		const fn = adapter.compile("<h1><%= it.name %></h1>");
		const html1 = await fn({ name: "Alice" });
		const html2 = await fn({ name: "Bob" });
		expect(html1).toBe("<h1>Alice</h1>");
		expect(html2).toBe("<h1>Bob</h1>");
	});

	it("returns name 'eta'", () => {
		const adapter = new EtaAdapter();
		expect(adapter.name).toBe("eta");
	});

	it("caches compiled templates", async () => {
		const adapter = new EtaAdapter();
		const html1 = await adapter.render("<%= it.x %>", { x: "first" });
		const html2 = await adapter.render("<%= it.x %>", { x: "second" });
		expect(html1).toBe("first");
		expect(html2).toBe("second");
	});
});
