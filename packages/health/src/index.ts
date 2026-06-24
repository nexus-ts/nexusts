/**
 * Public API for `nexusjs/health`.
 *
 * Quick start:
 *   // src/app/app.module.ts
 *   import { Module } from 'nexusjs';
 *   import { HealthModule } from 'nexusjs/health';
 *
 *   @Module({
 *     imports: [
 *       HealthModule.forRoot({
 *         builtIn: { memory: true, disk: { threshold: 0.1 } },
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 *
 * Endpoints (auto-mounted by HealthController):
 *   GET /health/live     — fast in-process check (no DB ping)
 *   GET /health/ready    — runs every registered indicator
 *   GET /health/startup  — same as readiness; distinct path for K8s
 *
 * Response body:
 *   {
 *     "status": "up" | "down",
 *     "results": [{ "name": "memory", "result": { "status": "up", "data": {...} } }, ...],
 *     "durationMs": 12,
 *     "timestamp": "2026-06-20T12:00:00.000Z"
 *   }
 *
 * Status code: 200 when all 'up', 503 when any 'down'.
 */

export { HealthController } from "./health.controller.js";
export { HealthModule } from "./health.module.js";
export { HealthCheckService } from "./health.service.js";
export {
	CustomPingIndicator,
	DiskHealthIndicator,
	HttpHealthIndicator,
	MemoryHealthIndicator,
} from "./indicators/index.js";
export * from "./types.js";
