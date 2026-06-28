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
	NexusEventEmitter,
} from './emitter.js';
import type {
	EventEmitter,
	EventListener,
	EventName,
	EmitResult,
	ListenerOptions,
	EventsConfig,
	EmitterEventListener,
} from './types.js';

@Injectable()
export class EventService {
	/** DI token — use with `@Inject(EventService.TOKEN)`. */
	static readonly TOKEN = Symbol.for('nexus:EventService');

	@Inject('EVENTS_CONFIG') declare private readonly config: EventsConfig;
	readonly emitter: EventEmitter;

	constructor() {
		this.emitter = new NexusEventEmitter(this.config);
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
}