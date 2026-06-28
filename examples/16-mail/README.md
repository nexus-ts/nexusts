# 16 · Mail

Send emails via SMTP, file transport, or null (test) with `@nexusts/mail`.

## What it shows

- `MailModule.forRoot({ transport: 'smtp' | 'file' | 'null' })`
- `MailService.send({ to, from, subject, text, html })`
- Compile MJML-style templates via `mailable()` factory

## How to run

```bash
cd examples/16-mail
bun main.ts
```

This example uses the `file` transport — sent emails land in `./outbox/*.eml`.

```bash
# Send an email
curl -X POST http://localhost:3000/mail \
  -H "Content-Type: application/json" \
  -d '{"to":"alice@example.com","subject":"hi","text":"hello"}'

# Check outbox
ls outbox/
```

## Code

```ts
import "reflect-metadata";
import { Application, Module, Controller, Post, Body, Inject, Injectable } from "@nexusts/core";
import { MailService, MailModule } from "@nexusts/mail";

@Injectable()
@Controller("/mail")
class MailController {
  @Inject(MailService) declare private mail: MailService;

  @Post("/")
  async send(@Body() body: { to: string; subject: string; text: string }) {
    await this.mail.send({
      from: "noreply@example.com",
      to: body.to,
      subject: body.subject,
      text: body.text,
    });
    return { ok: true };
  }
}

@Module({
  imports: [
    MailModule.forRoot({
      transport: new FileTransport({ dir: "./outbox" }),
    }),
  ],
  controllers: [MailController],
})
class AppModule {}

const app = new Application(AppModule);
await app.listen(3000);
```

## SMTP transport

```ts
import { SmtpTransport } from "@nexusts/mail";
MailModule.forRoot({
  transport: new SmtpTransport({
    host: "smtp.example.com",
    port: 587,
    auth: { user: "...", pass: "..." },
  }),
})
```

## Templated email

```ts
@Injectable()
class WelcomeMail {
  @Inject(MailService) declare private mail: MailService;
  async send(to: string, name: string) {
    await this.mail.send({
      to,
      subject: `Welcome, ${name}!`,
      html: `<h1>Hi ${name}</h1><p>Welcome aboard.</p>`,
    });
  }
}
```
