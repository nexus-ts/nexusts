import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
	test: {
		environment: "node",
		globals: false,
		include: ["tests/**/*.test.ts"],
		// Known issue: better-auth pulls in zod v4 via
		// @better-auth/core. When run alongside tests that import the
		// top-level zod (v3), a race during module init makes `z.object`
		// undefined. Workaround: run auth tests separately, or upgrade
		// zod to v4. See the "Auth module integration" section in the
		// auth docs.
	},
	esbuild: {
		target: "es2022",
		tsconfigRaw: {
			compilerOptions: {
				experimentalDecorators: true,
				useDefineForClassFields: false,
			},
		},
	},
	resolve: {
		alias: [
			{ find: /^@core\/(.+)$/, replacement: `${root}/src/core/$1` },
			{ find: /^@app\/(.+)$/, replacement: `${root}/src/app/$1` },
			{ find: /^@\/(.+)$/, replacement: `${root}/src/$1` },
		],
	},
});
