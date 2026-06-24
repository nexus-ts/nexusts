/**
 * Vitest configuration for Node.js parity testing.
 *
 * Excludes tests that depend on Bun-native APIs:
 *   - bun:sqlite  → drizzle bun-sqlite dialect tests
 *   - Bun.redis   → (handled by adapter skip-guards in the tests themselves)
 *   - Examples    → require Bun process APIs and long-running servers
 *   - gRPC/e2e    → require external services
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
	test: {
		environment: "node",
		globals: false,
		include: ["tests/**/*.test.ts"],
		exclude: [
			// Uses bun:sqlite — no Node.js equivalent without extra peer deps
			"tests/drizzle/drizzle.test.ts",
			"tests/cache/drizzle-store.test.ts",
			"tests/session/drizzle-backend.test.ts",
			"tests/limiter/drizzle-storage.test.ts",
			// Smoke tests spin up full Bun servers
			"tests/examples/**",
			// gRPC requires native bindings + external service
			"tests/grpc/**",
			// Full e2e requires a running application
			"tests/e2e/**",
		],
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
			{ find: /^@nexusts\/core$/, replacement: `${root}/packages/core/src/index.ts` },
			{ find: /^@nexusts\/cli$/, replacement: `${root}/packages/cli/src/index.ts` },
			{ find: /^@nexusts\/view$/, replacement: `${root}/packages/view/src/index.ts` },
			{ find: /^@nexusts\/auth$/, replacement: `${root}/packages/auth/src/index.ts` },
			{ find: /^@nexusts\/cache$/, replacement: `${root}/packages/cache/src/index.ts` },
			{ find: /^@nexusts\/config$/, replacement: `${root}/packages/config/src/index.ts` },
			{ find: /^@nexusts\/crypto$/, replacement: `${root}/packages/crypto/src/index.ts` },
			{ find: /^@nexusts\/drive$/, replacement: `${root}/packages/drive/src/index.ts` },
			{ find: /^@nexusts\/drizzle$/, replacement: `${root}/packages/drizzle/src/index.ts` },
			{ find: /^@nexusts\/drizzle\/validation$/, replacement: `${root}/packages/drizzle/src/validation/index.ts` },
			{ find: /^@nexusts\/events$/, replacement: `${root}/packages/events/src/index.ts` },
			{ find: /^@nexusts\/feature-flag$/, replacement: `${root}/packages/feature-flag/src/index.ts` },
			{ find: /^@nexusts\/graphql$/, replacement: `${root}/packages/graphql/src/index.ts` },
			{ find: /^@nexusts\/grpc$/, replacement: `${root}/packages/grpc/src/index.ts` },
			{ find: /^@nexusts\/health$/, replacement: `${root}/packages/health/src/index.ts` },
			{ find: /^@nexusts\/i18n$/, replacement: `${root}/packages/i18n/src/index.ts` },
			{ find: /^@nexusts\/limiter$/, replacement: `${root}/packages/limiter/src/index.ts` },
			{ find: /^@nexusts\/logger$/, replacement: `${root}/packages/logger/src/index.ts` },
			{ find: /^@nexusts\/mail$/, replacement: `${root}/packages/mail/src/index.ts` },
			{ find: /^@nexusts\/metrics$/, replacement: `${root}/packages/metrics/src/index.ts` },
			{ find: /^@nexusts\/openapi$/, replacement: `${root}/packages/openapi/src/index.ts` },
			{ find: /^@nexusts\/queue$/, replacement: `${root}/packages/queue/src/index.ts` },
			{ find: /^@nexusts\/redis$/, replacement: `${root}/packages/redis/src/index.ts` },
			{ find: /^@nexusts\/resilience$/, replacement: `${root}/packages/resilience/src/index.ts` },
			{ find: /^@nexusts\/schedule$/, replacement: `${root}/packages/schedule/src/index.ts` },
			{ find: /^@nexusts\/session$/, replacement: `${root}/packages/session/src/index.ts` },
			{ find: /^@nexusts\/shield$/, replacement: `${root}/packages/shield/src/index.ts` },
			{ find: /^@nexusts\/sse$/, replacement: `${root}/packages/sse/src/index.ts` },
			{ find: /^@nexusts\/static$/, replacement: `${root}/packages/static/src/index.ts` },
			{ find: /^@nexusts\/tracing$/, replacement: `${root}/packages/tracing/src/index.ts` },
			{ find: /^@nexusts\/upload$/, replacement: `${root}/packages/upload/src/index.ts` },
			{ find: /^@nexusts\/ws$/, replacement: `${root}/packages/ws/src/index.ts` },
		],
	},
});
