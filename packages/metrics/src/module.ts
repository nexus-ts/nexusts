/**
 * `MetricsModule` — wires up the metrics service into the DI
 * container, registers default Node.js process metrics, and mounts
 * the `GET /metrics` controller.
 *
 * Usage:
 *   @Module({
 *     imports: [
 *       MetricsModule.forRoot({
 *         enableDefaultMetrics: true,
 *         path: "/metrics",
 *         globalLabels: { service: "my-app" },
 *       }),
 *     ],
 *   })
 *   class AppModule {}
 *
 * Without `forRoot()`, `MetricsService` is still available (it's
 * a no-op-friendly singleton), but no metrics are pre-registered
 * and the controller is not mounted. Apps can register their own
 * metrics and mount the controller manually.
 */

import { Module } from "@nexusts/core";
import { MetricsController } from "./controller.js";
import { METRICS_SERVICE_TOKEN, MetricsService } from "./service.js";
import type { MetricsConfig } from "./types.js";

@Module({
	providers: [
		MetricsService,
		{ provide: METRICS_SERVICE_TOKEN, useExisting: MetricsService },
	],
	exports: [MetricsService, METRICS_SERVICE_TOKEN],
})
export class MetricsModule {
	static forRoot(config: MetricsConfig = {}) {
		const fullConfig: Required<MetricsConfig> = {
			defaultBuckets: config.defaultBuckets ?? [],
			defaultPercentiles: config.defaultPercentiles ?? [],
			path: config.path ?? "/metrics",
			enableDefaultMetrics: config.enableDefaultMetrics ?? true,
			mountController: config.mountController ?? true,
			globalLabels: config.globalLabels ?? {},
		};

		@Module({
			providers: [
				MetricsService,
				{ provide: METRICS_SERVICE_TOKEN, useExisting: MetricsService },
				{ provide: "METRICS_CONFIG", useValue: fullConfig },
			],
			exports: [MetricsService, METRICS_SERVICE_TOKEN, "METRICS_CONFIG"],
		})
		class ConfiguredMetricsModule {
			constructor(private svc: MetricsService = new MetricsService()) {
				if (Object.keys(fullConfig.globalLabels).length > 0) {
					svc.registry.setGlobalLabels(fullConfig.globalLabels);
				}
				if (fullConfig.enableDefaultMetrics) {
					registerDefaultMetrics(svc);
				}
			}

			static get path(): string {
				return fullConfig.path;
			}

			static get service(): MetricsService {
				return new MetricsService();
			}

			static get controllerPath(): string {
				return fullConfig.path;
			}
		}
		Object.defineProperty(ConfiguredMetricsModule, "name", {
			value: "ConfiguredMetricsModule",
		});

		// Attach helpers as static methods on the module class.
		(ConfiguredMetricsModule as unknown as { mount: (app: unknown, service: MetricsService) => void }).mount = (
			app: unknown,
			service: MetricsService,
		) => {
			MetricsController.mount(
				app as { get: (path: string, ...handlers: unknown[]) => unknown },
				service,
				fullConfig.path,
			);
		};

		return ConfiguredMetricsModule as unknown as typeof MetricsModule & {
			mount: (app: unknown, service: MetricsService) => void;
			path: string;
			controllerPath: string;
			service: MetricsService;
		};
	}
}

/* ------------------------------------------------------------------ *
 * Default Node.js process metrics
 * ------------------------------------------------------------------ */

function registerDefaultMetrics(service: MetricsService): void {
	// Process metrics
	const processStartTime = service.gauge({
		name: "process_start_time_seconds",
		help: "Start time of the process since unix epoch in seconds.",
		labelNames: [],
		collect: () => {
			processStartTime.set(Math.floor(Date.now() / 1000));
		},
	});

	const processResidentMemory = service.gauge({
		name: "process_resident_memory_bytes",
		help: "Resident memory size in bytes.",
		labelNames: [],
		collect: () => {
			const mem = process.memoryUsage();
			processResidentMemory.set(mem.rss);
		},
	});

	const processHeapUsed = service.gauge({
		name: "nodejs_heap_size_used_bytes",
		help: "Node.js heap size used in bytes.",
		labelNames: [],
		collect: () => {
			const mem = process.memoryUsage();
			processHeapUsed.set(mem.heapUsed);
		},
	});

	const processHeapTotal = service.gauge({
		name: "nodejs_heap_size_total_bytes",
		help: "Node.js heap size total in bytes.",
		labelNames: [],
		collect: () => {
			const mem = process.memoryUsage();
			processHeapTotal.set(mem.heapTotal);
		},
	});

	const processExternalMemory = service.gauge({
		name: "nodejs_external_memory_bytes",
		help: "Node.js external memory size in bytes.",
		labelNames: [],
		collect: () => {
			const mem = process.memoryUsage();
			processExternalMemory.set(mem.external);
		},
	});

	const processCpuUser = service.gauge({
		name: "process_cpu_user_seconds_total",
		help: "Total user CPU time spent in seconds.",
		labelNames: [],
		collect: () => {
			const cpu = process.cpuUsage();
			processCpuUser.set(cpu.user / 1_000_000);
		},
	});

	const processCpuSystem = service.gauge({
		name: "process_cpu_system_seconds_total",
		help: "Total system CPU time spent in seconds.",
		labelNames: [],
		collect: () => {
			const cpu = process.cpuUsage();
			processCpuSystem.set(cpu.system / 1_000_000);
		},
	});

	const eventLoopLag = service.gauge({
		name: "nodejs_eventloop_lag_seconds",
		help: "Lag of the event loop in seconds.",
		labelNames: [],
		collect: () => {
			// Sample event loop lag using a setImmediate.
			const start = process.hrtime.bigint();
			setImmediate(() => {
				const lagNs = Number(process.hrtime.bigint() - start);
				eventLoopLag.set(lagNs / 1e9);
			});
		},
	});

	const processActiveHandles = service.gauge({
		name: "nodejs_active_handles_total",
		help: "Number of active handles.",
		labelNames: [],
		collect: () => {
			const handles = (process as any)._getActiveHandles?.() ?? [];
			processActiveHandles.set(handles.length);
		},
	});

	const processActiveRequests = service.gauge({
		name: "nodejs_active_requests_total",
		help: "Number of active requests.",
		labelNames: [],
		collect: () => {
			const reqs = (process as any)._getActiveRequests?.() ?? [];
			processActiveRequests.set(reqs.length);
		},
	});

	// Touch all gauges to make sure they're eagerly evaluated once
	void processStartTime;
	void processResidentMemory;
	void processHeapUsed;
	void processHeapTotal;
	void processExternalMemory;
	void processCpuUser;
	void processCpuSystem;
	void eventLoopLag;
	void processActiveHandles;
	void processActiveRequests;
}
