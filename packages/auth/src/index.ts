/**
 * Public API for the NexusTS auth module.
 *
 * This is a thin layer over `better-auth` — it does not re-implement
 * any auth primitives. It adapts better-auth's surface to NexusTS's
 * DI / decorator model.
 *
 * Quick start:
 *
 *   // src/auth/auth.ts
 *   import { createAuth } from 'nexusjs/auth';
 *   export const auth = createAuth({
 *     emailAndPassword: { enabled: true },
 *     socialProviders: { github: { clientId: '...', clientSecret: '...' } },
 *   });
 *
 *   // src/app/app.module.ts
 *   import { Module } from 'nexusjs';
 *   import { AuthModule } from 'nexusjs/auth';
 *
 *   @Module({ imports: [AuthModule.forRoot({ ... })] })
 *   export class AppModule {}
 *
 *   // any controller
 *   import { CurrentUser } from 'nexusjs/auth';
 *
 *   @Controller('/profile')
 *   class ProfileController {
 *     @Get('/')
 *     me(@CurrentUser({ required: true }) user) {
 *       return user;
 *     }
 *   }
 */

export { AuthController } from "./auth.controller.js";
export type { NexusAuth } from "./auth.js";
export { createAuth } from "./auth.js";
export { AuthModule } from "./auth.module.js";
export { AuthService } from "./auth.service.js";
export {
	CurrentUser,
	type CurrentUserOptions,
	ForbiddenError,
	UnauthenticatedError,
} from "./decorators/current-user.js";
export {
	type AuthMiddlewareMode,
	type AuthMiddlewareOptions,
	authHandler,
	authMiddleware,
} from "./middleware.js";
export * from "./types.js";
