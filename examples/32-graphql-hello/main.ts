import { Application, Module, Controller, Get } from "@nexusts/core";
import {
	GraphQLModule,
	GraphQLService,
	Resolver,
	Query,
	Mutation,
} from "@nexusts/graphql";
/**
 * 32-graphql-hello — code-first GraphQL endpoint.
 *
 * SDL is auto-generated from @Resolver / @Query / @Mutation / @Arg
 * decorators. No hand-written typeDefs required.
 *
 *   GET  /              → plain text intro
 *   POST /graphql       → queries + mutations
 *   GET  /graphql       → GraphiQL playground
 *   GET  /graphql/schema → generated SDL as text/plain
 *
 *   Run: bun main.ts
 *   Then:
 *     curl -s -X POST http://localhost:3000/graphql \
 *       -H "Content-Type: application/json" \
 *       -d '{"query":"{ hello(name:\"world\") }"}'
 */
// Declare resolver classes BEFORE @Module so the decorator registry is
// populated when GraphQLModule.forRoot() is called.
@Resolver()
class HelloResolver {
	@Query("hello", { returns: "String!", args: { name: "String!" } })
	hello(name: string): string {
		return `Hello, ${name}!`;
	}
	@Query("add", { returns: "Int!", args: { a: "Int!", b: "Int!" } })
	add(a: number, b: number): number {
		return a + b;
	}
}
@Resolver()
class EchoResolver {
	@Mutation("echo", { returns: "String!", args: { message: "String!" } })
	echo(message: string): string {
		return message;
	}
}
@Controller("/")
class HomeController {
	@Get("/")
	home() {
		return {
			info: "Code-first GraphQL — SDL is auto-generated from decorators",
			graphql: "POST /graphql with { query: '{ hello(name: \"x\") }' }",
			playground: "GET /graphql in a browser",
			schema: "GET /graphql/schema",
		};
	}
}
@Module({
	imports: [
		GraphQLModule.forRoot({
			autoSchema: true,
			// typeDefs is not required — the schema is synthesised from
			// @Resolver / @Query / @Mutation / @Arg decorators above.
		}),
	],
	controllers: [HomeController],
})
class AppModule {}
const app = new Application(AppModule);
const g = app.container.resolve(GraphQLService) as GraphQLService;
await GraphQLModule.mount(app.server.app, g);
const port = Number(process.env.PORT ?? 3000);
await app.listen(port);
