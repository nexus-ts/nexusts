/**
 * Public API for the NexusJS auth module.
 *
 * This is a thin layer over `better-auth` — it does not re-implement
 * any auth primitives. It adapts better-auth's surface to NexusJS's
 * DI / decorator model.
 *
 * Quick start:
 *
 *   // src/auth/auth.ts
 *   import { createAuth } from 'nexus/auth';
 *   export const auth = createAuth({
 *     emailAndPassword: { enabled: true },
 *     socialProviders: { github: { clientId: '...', clientSecret: '...' } },
 *   });
 *
 *   // src/app/app.module.ts
 *   import { Module } from 'nexus';
 *   import { AuthModule } from 'nexus/auth';
 *
 *   @Module({ imports: [AuthModule.forRoot({ ... })] })
 *   export class AppModule {}
 *
 *   // any controller
 *   import { CurrentUser } from 'nexus/auth';
 *
 *   @Controller('/profile')
 *   class ProfileController {
 *     @Get('/')
 *     me(@CurrentUser({ required: true }) user) {
 *       return user;
 *     }
 *   }
 */

export * from "./types.js";
export { createAuth } from "./auth.js";
export type { NexusAuth } from "./auth.js";
export { AuthService } from "./auth.service.js";
export { AuthController } from "./auth.controller.js";
export { AuthModule } from "./auth.module.js";
export {
	authMiddleware,
	authHandler,
	type AuthMiddlewareMode,
	type AuthMiddlewareOptions,
} from "./middleware.js";
export {
	CurrentUser,
	UnauthenticatedError,
	ForbiddenError,
	type CurrentUserOptions,
} from "./decorators/current-user.js";