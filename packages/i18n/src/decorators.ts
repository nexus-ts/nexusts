/**
 * `@CurrentLocale()` — controller parameter decorator that
 * injects the active locale string (e.g. `"en"`, `"ko"`).
 *
 * Requires that `i18nMiddleware()` has been installed upstream.
 *
 *   @Get('/')
 *   index(@CurrentLocale() locale: string) {
 *     return { locale };
 *   }
 */

import { createParamDecorator } from "@nexusts/core";
import { PARAM_TYPES } from "@nexusts/core";
import type { Locale } from "./types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

export function CurrentLocale(): ParameterDecorator {
	return createParamDecorator(PARAM_TYPES.USER, {} as never) as ParameterDecorator;
}
