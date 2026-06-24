/**
 * `EventService` — DI-friendly facade over the emitter.
 *
 * Controllers and services inject this to emit events. Listeners
 * can either:
 *   - Call `event.on(pattern, fn)` directly
 *   - Use the `@OnEvent(pattern)` decorator + `scanForListeners`
 */

import { Inject, Injectable } from '@nexusts/core';
import {
	compilePattern,
	NexusEventEmitter,
} from './emitter.js';
import type {
	EmitResult,
	EmitterEvent,
	EmitterEventListener,
	EventEmitter,
	EventListener,
	EventName,
	EventsConfig,
	ListenerOptions,
} from './types.js';

@Injectable()
export class EventService {
	/** DI token — use with `@Inject(EventService.TOKEN)`. */
	static readonly TOKEN = Symbol.for('nexus:EventService');

	readonly emitter: EventEmitter;

	constructor(@Inject('EVENTS_CONFIG') private readonly config: EventsConfig = {}) {
		this.emitter = new NexusEventEmitter(config);
	}

	// ===========================================================================
	// Public API
	// ===========================================================================

	on<T = unknown>(
		pattern: EventName,
		listener: EventListener<T>,
		options?: ListenerOptions,
	): string {
		return this.emitter.on(pattern, listener, options);
	}

	once<T = unknown>(
		pattern: EventName,
		listener: EventListener<T>,
		options?: Omit<ListenerOptions, 'once'>,
	): string {
		return this.emitter.once(pattern, listener, options);
	}

	off(idOrPattern: string): number {
		return this.emitter.off(idOrPattern);
	}

	emit<T = unknown>(name: EventName, payload?: T): Promise<EmitResult> {
		return this.emitter.emit(name, payload);
	}

	emitSync<T = unknown>(name: EventName, payload?: T): EmitResult {
		return this.emitter.emitSync(name, payload);
	}

	listenerCount(pattern?: EventName): number {
		return this.emitter.listenerCount(pattern);
	}

	listListeners(pattern?: EventName): ReturnType<EventEmitter['listListeners']> {
		return this.emitter.listListeners(pattern);
	}

	removeAllListeners(): void {
		this.emitter.removeAllListeners();
	}

	onEmitterEvent(listener: EmitterEventListener): () => void {
		const internal = this.emitter as NexusEventEmitter;
		if (typeof internal.onEmitterEvent === 'function') {
			return internal.onEmitterEvent(listener);
		}
		return () => {};
	}

	// ===========================================================================
	// Internal
	// ===========================================================================

	#bridgeEmitterEvents(): void {
		// Forward emitter events through our public EventService — useful
		// for testing / debugging.
		const internal = this.emitter as NexusEventEmitter;
		if (typeof internal.onEmitterEvent === 'function') {
			internal.onEmitterEvent((event: EmitterEvent) => {
				// Reserved for future log/metric integration.
				void event;
			});
		}
	}
}