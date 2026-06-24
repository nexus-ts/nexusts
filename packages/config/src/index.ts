/**
 * Public API for `nexusjs/config`.
 *
 * Quick start:
 *
 *   // src/config/schema.ts
 *   import { z } from 'zod';
 *   export const configSchema = z.object({
 *     DATABASE_URL: z.string().url(),
 *     PORT: z.coerce.number().default(3000),
 *   });
 *
 *   // src/app/app.module.ts
 *   import { Module } from 'nexusjs';
 *   import { ConfigModule } from 'nexusjs/config';
 *
 *   @Module({
 *     imports: [
 *       ConfigModule.forRoot({
 *         schema: configSchema,
 *       }),
 *     ],
 *   })
 *   export class AppModule {}
 *
 *   // any service
 *   import { ConfigService } from 'nexusjs/config';
 *
 *   class MyService {
 *     constructor(
 *       @Inject(ConfigService.TOKEN)
 *       private config: ConfigService<typeof configSchema>,
 *     ) {}
 *   }
 */

export { ConfigModule } from "./config.module.js";
export { ConfigService } from "./config.service.js";
export * from "./types.js";
