/**
 * `@ApiProperty({ description, required, schema, example })` — document
 * a property on a request / response DTO.
 *
 * ```ts
 * class UserDto {
 *   @ApiProperty({ description: 'Unique user id', example: 42 })
 *   id!: number;
 *
 *   @ApiProperty({ description: 'Email address', required: true })
 *   email!: string;
 * }
 * ```
 *
 * The `schema` field accepts either a Zod schema or a pre-computed
 * `JSONSchema`. Without a `schema`, the type is inferred from the
 * TypeScript reflection of the property's design:type metadata.
 */
import "reflect-metadata";
import { type ApiPropertyOptions, OPENAPI_META } from "../types.js";

export function ApiProperty(options: ApiPropertyOptions = {}): PropertyDecorator {
	return (target: object, propertyKey: string | symbol) => {
		const existing: Record<string | symbol, ApiPropertyOptions> =
			Reflect.getMetadata(OPENAPI_META.PROPERTIES, target.constructor) ?? {};
		existing[propertyKey] = options;
		Reflect.defineMetadata(OPENAPI_META.PROPERTIES, existing, target.constructor);
	};
}

/** Class-level: mark a DTO class so its properties can be lifted into a schema. */
export function ApiSchema(name: string): ClassDecorator {
	return (target: any) => {
		Reflect.defineMetadata("nexus:openapi:schemaName", name, target);
	};
}