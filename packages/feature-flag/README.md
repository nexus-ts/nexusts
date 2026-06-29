> ⚠️ **Experimental / 실험 중** — This package is actively developed. The API may change without notice until v1.0.

# `@nexusts/feature-flag`

Feature flags, canary deployments, and A/B testing for NexusTS.

## Install

```bash
bun add @nexusts/feature-flag
```

## Quick start

```ts
import { FeatureFlagModule, FeatureFlagService, FeatureFlag } from '@nexusts/feature-flag';

@Module({
  imports: [
    FeatureFlagModule.forRoot({
      flags: {
        'new-dashboard': { enabled: true, rollout: 0.5 },
        'beta-api':      false,
      },
    }),
  ],
})
class AppModule {}

// In a controller:
const showBeta = await flags.isEnabled('new-checkout', { userId: 'u-1' });

// Or as a decorator:
@FeatureFlag('new-dashboard')
async index() { ... }
```

## API

| Method | Description |
| ------ | ----------- |
| `isEnabled(flag, context?)` | `Promise<boolean>` — `true` if the flag is active |
| `setFlag(name, definition)` | Add or update a flag at runtime |
| `getFlag(name)` | Return the current definition |

Flag evaluation order: `denylist` → `allowlist` → `enabled: false` →
`rollout` (djb2 hash) → default.

## Links

- [User guide](../../docs/user-guide/feature-flags.md)
- [NestJS comparison — feature flags](../../docs/analysis/nestjs-comparison.md)
