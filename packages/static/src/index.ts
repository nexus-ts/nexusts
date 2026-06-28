/**
 * Public API for `@nexusts/static`.
 *
 * Quick start:
 *
 *   // src/app/app.module.ts
 *   import { Module } from '@nexusts/core';
 *   import { StaticModule } from '@nexusts/static';
 *
 *   @Module({
 *     imports: [
 *       StaticModule.forRoot({
 *         root: './public',
 *         prefix: '/public',
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 *
 *   // any service that needs to mount the middleware on a sub-app
 *   import { StaticService } from '@nexusts/static';
 *
 *   @Injectable()
 *   class CustomServer {
 *     @Inject(StaticService.TOKEN) declare private static: StaticService;
 *     mount(app: Hono) {
 *       app.use('/public/*', this.static.middleware());
 *     }
 *   }
 *
 * Features:
 *   - Path-traversal protection (no `..`, no absolute paths)
 *   - ETag-based conditional GET (304 Not Modified)
 *   - Range requests (HTTP 206) for video / large files
 *   - Sensible `Cache-Control` defaults
 *   - `index.html` fallback for directory requests
 *   - MIME-type inference for common formats
 */

export { StaticService, type ServeStaticOptions } from "./static.service.js";
export { StaticModule } from "./static.module.js";
