/**
 * Public entry point for `nexusjs/graphql`.
 */

export {
	Arg,
	clearResolverRegistry,
	getMethodArgs,
	getRegisteredResolvers,
	getResolverFields,
	getResolverTypeName,
	isResolverClass,
	Mutation,
	normalizeGQLType,
	Query,
	Resolver,
	Subscription,
} from "./decorators/index.js";
export { GraphQLModule } from "./graphql.module.js";
export { GraphQLService, loadGraphQLJs } from "./graphql.service.js";
export * from "./types.js";
