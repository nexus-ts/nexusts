import { Inject, Injectable, type OnApplicationInit } from '@nexusts/core';
import {
	CloudflareSchedulesBackend,
	MemorySchedulesBackend,
} from './backends/index.js';
import { __setScheduleService } from './scanner.js';
import type {
	CronExpression,
	CronOptions,
	ScheduleConfig,
	ScheduledTask,
	ScheduleEvent,
	ScheduleEventListener,
	ScheduleHandler,
	ScheduleRegistry,
} from './types.js';



@Injectable()
export class ScheduleService implements OnApplicationInit {
	/** DI token — use with `@Inject(ScheduleService.TOKEN)`. */
	static readonly TOKEN = Symbol.for('nexus:ScheduleService');

	readonly registry: ScheduleRegistry;
	#listeners = new Set<ScheduleEventListener>();
	#started = false;
	#memoryBackend: MemorySchedulesBackend | null = null;

	constructor(@Inject('SCHEDULE_CONFIG') private _config: ScheduleConfig = {}) {
		this.registry = this.#createBackend(this._config);
		// Register this instance immediately so the Application's scanner
		// callback can use it for subsequent providers resolved after this one.
		__setScheduleService(this);
		// Bun hot-reload support: when the module is about to be disposed,
		// stop all timers so stale intervals from the previous version don't
		// keep running alongside the new version.
		if (typeof module !== 'undefined' && (module as any).hot) {
			(module as any).hot?.dispose?.(() => {
				void this.stop();
			});
		}
	}

	/** @internal called by Application.bootstrap() for each resolved instance. */
	scanInstance(instance: object): void {
		const { getCronHooks, getIntervalHooks, getTimeoutHooks } =
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			require('./decorators/cron.js');
		for (const h of getCronHooks(instance)) {
			const fn = (instance as Record<string, unknown>)[h.method] as
				| ScheduleHandler
				| undefined;
			if (typeof fn !== 'function') continue;
			this.addCron(h.expression, fn.bind(instance), {
				...h.options,
				name: h.options.name ?? `${instance.constructor.name}.${h.method}`,
			});
		}
		for (const h of getIntervalHooks(instance)) {
			const fn = (instance as Record<string, unknown>)[h.method] as
				| ScheduleHandler
				| undefined;
			if (typeof fn !== 'function') continue;
			this.addInterval(h.milliseconds, fn.bind(instance), h.name ?? `${instance.constructor.name}.${h.method}`);
		}
		for (const h of getTimeoutHooks(instance)) {
			const fn = (instance as Record<string, unknown>)[h.method] as
				| ScheduleHandler
				| undefined;
			if (typeof fn !== 'function') continue;
			this.addTimeout(h.milliseconds, fn.bind(instance), h.name ?? `${instance.constructor.name}.${h.method}`);
		}
	}

	async onApplicationInit(): Promise<void> {
		// Register this instance so the scanner callback can use it.
		const { __setScheduleService } = await import('./scanner.js');
		__setScheduleService(this);
		// Auto-start the scheduler
		this.start();
	}

	// ===========================================================================
	// Static-style API (used by @Cron / @Interval / @Timeout decorators)
	// ===========================================================================

	addCron(
		expression: CronExpression,
		handler: ScheduleHandler,
		options: CronOptions & { name?: string } = {},
	): string {
		const name = options.name ?? `cron-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
		return this.registry.addCron(name, expression, handler, options);
	}

	addInterval(milliseconds: number, handler: ScheduleHandler, name?: string): string {
		return this.registry.addInterval(name ?? `interval-${Date.now()}`, milliseconds, handler);
	}

	addTimeout(milliseconds: number, handler: ScheduleHandler, name?: string): string {
		return this.registry.addTimeout(name ?? `timeout-${Date.now()}`, milliseconds, handler);
	}

	list(): ScheduledTask[] {
		return this.registry.list();
	}

	get(idOrName: string): ScheduledTask | undefined {
		return this.registry.get(idOrName);
	}

	pause(idOrName: string): boolean {
		return this.registry.pause(idOrName);
	}

	resume(idOrName: string): boolean {
		return this.registry.resume(idOrName);
	}

	delete(idOrName: string): boolean {
		return this.registry.delete(idOrName);
	}

	on(listener: ScheduleEventListener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	start(): void {
		if (this.#started) return;
		this.#started = true;
		if (this.#memoryBackend) this.#memoryBackend.start();
		this.registry.on((event) => this.#broadcast(event));
	}

	async stop(): Promise<void> {
		if (!this.#started) return;
		this.#started = false;
		await this.registry.stop();
	}

	getMemoryBackend(): MemorySchedulesBackend | null {
		return this.#memoryBackend;
	}

	getCloudflareBackend(): CloudflareSchedulesBackend | null {
		return this.registry instanceof CloudflareSchedulesBackend ? this.registry : null;
	}

	#createBackend(config: ScheduleConfig): ScheduleRegistry {
		switch (config.backend ?? 'memory') {
			case 'memory': {
				const backend = new MemorySchedulesBackend({
					tickMs: config.memory?.tickMs ?? 1000,
					maxDriftMs: config.memory?.maxDriftMs,
					defaultTimezone: config.defaultTimezone,
				});
				this.#memoryBackend = backend;
				return backend;
			}
			case 'cloudflare':
				return new CloudflareSchedulesBackend();
		}
	}

	#broadcast(event: ScheduleEvent): void {
		for (const l of this.#listeners) {
			void Promise.resolve(l(event));
		}
	}
}
