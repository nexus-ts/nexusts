# 21 · i18n

Multi-language messages with `@nexusts/i18n`.

## What it shows

- `I18nModule.forRoot({ defaultLocale: 'en', messages: {...} })`
- `t('key', { ...args })` in services
- `TranslatorMiddleware` for per-request locale
- `@t` decorator for controller methods

## How to run

```bash
cd examples/21-i18n
bun main.ts
```

```bash
# Default (English)
curl http://localhost:3000/greet

# Korean
curl -H "Accept-Language: ko" http://localhost:3000/greet

# Override via query
curl http://localhost:3000/greet?lang=ja
```

## Code

```ts
import "reflect-metadata";
import { Application, Module, Controller, Get, Ctx, Inject, Injectable } from "@nexusts/core";
import { I18nModule, I18nService, I18N_SERVICE_TOKEN } from "@nexusts/i18n";

const messages = {
  en: { greeting: "Hello, {name}!" },
  ko: { greeting: "안녕하세요, {name}님!" },
  ja: { greeting: "こんにちは、{name}さん!" },
};

@Injectable()
@Controller("/")
class AppController {
  @Inject(I18N_SERVICE_TOKEN) declare private i18n: I18nService;

  @Get("/greet")
  greet(@Ctx() c: any) {
    const name = c.req.query("name") || "world";
    const lang = c.req.query("lang") || c.get?.("locale") || "en";
    return { message: this.i18n.t("greeting", { name }, lang) };
  }
}

@Module({
  imports: [I18nModule.forRoot({ defaultLocale: "en", messages })],
  controllers: [AppController],
})
class AppModule {}

const app = new Application(AppModule);
await app.listen(3000);
```

## Locale resolution order

1. `?lang=...` query param
2. `Accept-Language` header
3. Cookie set by user
4. Default from `forRoot()`

## Adding languages

```ts
I18nModule.forRoot({
  defaultLocale: "en",
  messages: {
    en: { greeting: "Hello" },
    ko: { greeting: "안녕" },
    // dynamically add at runtime:
  },
});
// Or load JSON files
```

## In services

```ts
@Injectable()
class WelcomeService {
  @Inject(I18nService.TOKEN) declare private i18n: I18nService;

  send(user: { locale: string; name: string }) {
    return this.i18n.t(user.locale, "welcome_message", { name: user.name });
  }
}
```
