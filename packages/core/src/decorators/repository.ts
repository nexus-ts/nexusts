/**
 * @Repository decorator.
 *
 * Marks a class as a Spring-style repository. Repositories are normal
 * `@Injectable()` classes; the decorator is a marker so the framework
 * can register them with a database adapter (Drizzle/Kysely) and emit
 * a friendly error if you forget to wire one.
 *
 * @example
 * ```ts
 * @Repository()
 * class UserRepository {
 *   findAll() { return db.select().from(users); }
 * }
 * ```
 */
import { safeGetMeta, safeDefineMeta, safeHasMeta, } from "../di/safe-reflect.js";
import { METADATA_KEY } from "../constants.js";
import type { InjectionToken } from "../di/tokens.js";

export function Repository(entityToken?: InjectionToken<any>): ClassDecorator {
	return (target: object) => {
		safeDefineMeta(
			METADATA_KEY.REPOSITORY,
			{ entity: entityToken },
			target,
		);
		safeDefineMeta(METADATA_KEY.INJECTABLE, true, target);
	};
}

export function getRepositoryMetadata(
	target: any,
): { entity?: InjectionToken<any> } | undefined {
	return safeGetMeta(METADATA_KEY.REPOSITORY, target);
}

export function isRepository(target: any): boolean {
	return safeHasMeta(METADATA_KEY.REPOSITORY, target);
}
