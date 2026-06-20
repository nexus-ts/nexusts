/**
 * Public API for the NexusJS events module.
 *
 * Mirrors `@nestjs/event-emitter` and AdonisJS's emitter:
 *   - `emit(name, payload)` to dispatch
 *   - `@OnEvent(pattern)` to subscribe
 *   - Wildcards: `*` (single segment) and `**` (multi-segment)
 *   - Priorities, guards, one-shot listeners
 *
 * Quick start:
 *
 *   // src/app/app.module.ts
 *   import { Module } from 'nexus';
 *   import { EventsModule } from 'nexus/events';
 *
 *   @Module({ imports: [EventsModule.forRoot()] })
 *   export class AppModule {}
 *
 *   // any service
 *   import { EventService, OnEvent, scanForListeners } from 'nexus/events';
 *
 *   @Injectable()
 *   class EmailListeners {
 *     constructor(@Inject(EventService.TOKEN) private events: EventService) {}
 *
 *     @OnEvent('user.created')
 *     async onUserCreated(p: { userId: string; email: string }) {
 *       await this.sendWelcome(p.email);
 *     }
 *   }
 *
 *   // bootstrap
 *   const app = new Application(AppModule);
 *   const events = app.container.resolve(EventService);
 *   scanForListeners(emailListenersInstance, events);
 *   await events.emit('user.created', { userId: '1', email: 'a@b.c' });
 */

export * from "./types.js";
export { NexusEventEmitter, compilePattern } from "./emitter.js";
export { EventService } from "./event.service.js";
export { EventsModule } from "./events.module.js";
export {
	OnEvent,
	scanForListeners,
	getOnEventHooks,
} from "./decorators/on-event.js";
