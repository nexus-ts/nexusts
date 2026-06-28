# Publishing from your local machine

Use this when you need to publish outside the CI workflow.

## Prerequisites

- Maintainer of the `@nexusts` npm org
- **2FA enabled** on your npm account
- `bun` ≥ 1.3.10

## Login (one time per machine)

```bash
npm login --auth-type=web
```

npm 11's device authorization flow:

1. A URL is printed — press ENTER to open it in your browser
2. Log in, complete 2FA (TOTP or WebAuthn), complete biometric check
3. The session token is cached in `~/.npmrc`

Verify: `npm whoami` should return your username.

## Publish

```bash
bun run build
bun run publish:all
```

`publish.ts` checks the registry before each package and skips
already-published versions. A re-run after a partial failure only
touches the missing packages.

## For CI

Mint an **Automation** token (bypasses 2FA, respects rate limits):

1. <https://www.npmjs.com/settings/kabyeon/tokens> → Generate New Token
2. Type: **Automation**, expiry: 90 days
3. Save the `npm_xxxxx...` token
4. Add as `NPM_TOKEN` secret in GitHub repo settings

The workflow passes it as `NODE_AUTH_TOKEN` to the publish step.
