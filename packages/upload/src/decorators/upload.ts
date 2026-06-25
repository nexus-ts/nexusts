/**
 * `@Upload('fieldName', opts?)` — declare that a controller method
 * expects one or more uploaded files in `multipart/form-data`.
 *
 *   @Post('/avatars')
 *   @Upload('avatar')
 *   async upload(@UploadedFile('avatar') file: UploadedFile) { ... }
 *
 *   @Post('/photos')
 *   @Upload('photos', { maxFiles: 10 })
 *   async multi(@UploadedFiles('photos') files: UploadedFile[]) { ... }
 */
import { UPLOAD_META, type UploadOptions } from "../types.js";
import { safeGetMeta, safeDefineMeta, safeHasMeta } from "@nexusts/core/di/safe-reflect";

/** Default name when the decorator is applied without arguments. */
const DEFAULT_NAME = "__upload__";

export function Upload(name: string = DEFAULT_NAME, options: UploadOptions = {}): MethodDecorator {
	return (target: object, propertyKey: string | symbol) => {
		const existing: Array<{ name: string; options: UploadOptions }> =
			safeGetMeta(UPLOAD_META, target.constructor, propertyKey) ?? [];
		existing.push({ name, options });
		safeDefineMeta(UPLOAD_META, existing, target.constructor, propertyKey);
	};
}
