/**
 * Tests for file-based view loading in the view engine.
 *
 * Coverage:
 * 1. renderView with a `.html` file path + setViewPaths → loads the file
 * 2. renderView with inline template (no extension) → uses as-is
 * 3. renderView with file path but no setViewPaths → uses path as inline
 * 4. renderView with file path that doesn't exist → throws
 * 5. setViewPaths / getViewPaths round-trip
 * 6. RenduAdapter.render coerces non-string values (Rendu 0.1.0 bug workaround)
 */

import "reflect-metadata";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	getViewPaths,
	loadTemplate,
	renderView,
	setViewPaths,
} from "../../src/view/view-engine.js";

async function makeTmp(): Promise<string> {
	return mkdtemp(join(tmpdir(), "nx-view-"));
}

describe("view-engine — setViewPaths / getViewPaths", () => {
	afterEach(() => setViewPaths(""));

	it("round-trips the path", () => {
		setViewPaths("views");
		const got = getViewPaths();
		expect(got).toBe("views/");
	});

	it("appends trailing slash if missing", () => {
		setViewPaths("views");
		expect(getViewPaths()).toBe("views/");
	});

	it("preserves trailing slash if present", () => {
		setViewPaths("views/");
		expect(getViewPaths()).toBe("views/");
	});

	it("reset to empty by passing \"\"", () => {
		setViewPaths("views");
		setViewPaths("");
		expect(getViewPaths()).toBe("");
	});
});

describe("view-engine — file-based view", () => {
let tmp: string;
beforeEach(async () => {
tmp = await makeTmp();
setViewPaths(tmp);
});
afterEach(async () => {
await rm(tmp, { recursive: true, force: true });
setViewPaths("");
});

	it("loads a .html file from the configured view path", async () => {
		await writeFile(
			join(tmp, "about.html"),
			"<h1>About</h1><p>Year: <?= year ?>.</p>",
		);

		const out = await renderView("about.html", { year: 2026 });
		expect(out).toBe("<h1>About</h1><p>Year: 2026.</p>");
	});

	it("loads nested paths (emails/welcome.html)", async () => {
		await mkdir(join(tmp, "emails"), { recursive: true });
		await writeFile(
			join(tmp, "emails", "welcome.html"),
			"<p>Welcome, <?= name ?>!</p>",
		);

		const out = await renderView("emails/welcome.html", { name: "Alice" });
		expect(out).toBe("<p>Welcome, Alice!</p>");
	});

	it("loads .edge files (Rendu syntax also works)", async () => {
		await writeFile(join(tmp, "page.edge"), "<h1><?= title ?></h1>");
		const out = await renderView("page.edge", { title: "Hello" });
		expect(out).toBe("<h1>Hello</h1>");
	});

	it("uses inline source when no file extension is matched", async () => {
		// No matching extension → treat as inline template source
		const out = await renderView("<p>inline <?= v ?></p>", { v: "x" });
		expect(out).toBe("<p>inline x</p>");
	});

	it("uses path as inline when setViewPaths(\"\") even with .html", async () => {
		setViewPaths("");
		// Without view path, .html is treated as inline source
		const out = await renderView("about.html", { year: 2026 });
		// Rendu will compile it; since there's no template syntax,
		// it just outputs the string as text.
		expect(out).toContain("about.html");
	});

	it("throws a clear error when the file is not found", async () => {
		await expect(renderView("missing.html", { year: 2026 })).rejects.toThrow(
			/missing\.html/,
		);
	});
});

describe("view-engine — loadTemplate", () => {
let tmp: string;
beforeEach(async () => {
tmp = await makeTmp();
});
afterEach(async () => {
await rm(tmp, { recursive: true, force: true });
});

it("returns the file contents from the dir", async () => {
await writeFile(join(tmp, "x.html"), "hello");
const got = await loadTemplate(tmp, "x.html");
expect(got).toBe("hello");
});

it("returns null when the dir doesn't contain the file", async () => {
const got = await loadTemplate("/nonexistent-dir", "missing.html");
expect(got).toBeNull();
});
});

describe("RenduAdapter — non-string value coercion (Rendu 0.1.0 workaround)", () => {
let tmp: string;
beforeEach(async () => {
tmp = await makeTmp();
setViewPaths(tmp);
});
afterEach(async () => {
await rm(tmp, { recursive: true, force: true });
setViewPaths("");
});

	it("renders numbers as strings", async () => {
		await writeFile(join(tmp, "n.html"), "Year: <?= year ?>");
		const out = await renderView("n.html", { year: 2026 });
		expect(out).toBe("Year: 2026");
	});

	it("renders booleans as strings", async () => {
		await writeFile(join(tmp, "b.html"), "active: <?= active ?>");
		const out = await renderView("b.html", { active: true });
		expect(out).toBe("active: true");
	});

	it("renders null/undefined as empty string", async () => {
		await writeFile(join(tmp, "u.html"), "v=[<?= v ?>]");
		expect(await renderView("u.html", { v: null })).toBe("v=[]");
		expect(await renderView("u.html", { v: undefined })).toBe("v=[]");
	});

	it("leaves strings untouched", async () => {
		await writeFile(join(tmp, "s.html"), "name=<?= name ?>");
		const out = await renderView("s.html", { name: "Alice" });
		expect(out).toBe("name=Alice");
	});
});
