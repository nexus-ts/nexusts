# NexusTS 패키지 npm 배포

NexusTS의 31개 패키지(`@nexusts/*` + `create-nexusts`)는 모두 npm에 배포됩니다.
이 문서는 새 버전 배포 방법을 설명합니다.

## 빠른 참조

```bash
# 전체 빌드
bun run build

# 배포 (멱등성 보장 — 이미 배포된 버전은 건너뜀)
bun run publish:all
```

또는 GitHub Actions 워크플로우를 트리거합니다:

- **자동**: GitHub 릴리스 생성 (`gh release create v0.x.x`)
- **수동**: GitHub → Actions → "Publish packages to npm" → Run workflow

## publish.ts 동작 방식

`scripts/publish.ts`는 31개 패키지를 의존성 순서대로 순회합니다:

1. `npm view <name>@<version> version` — 레지스트리 확인
2. 동일 버전이 존재하면 → 건너뜀 (멱등성)
3. 없으면 → `npm publish --access public`

기본 딜레이: **패키지 간 3초**, **5개마다 10초 배치 휴식**
(`PUBLISH_BATCH_DELAY_MS` / `PUBLISH_BATCH_BREAK_MS` / `PUBLISH_BATCH_BREAK_N` 환경 변수로 조정 가능)

## 로컬 배포

```bash
# 로그인 (머신 최초 1회)
npm login --auth-type=web

# 빌드 + 배포
bun run build
bun run publish:all
```

`npm login --auth-type=web`은 npm 11의 디바이스 인증 흐름을 사용합니다:

- 브라우저가 열리면 로그인 → 2FA 완료
- 세션 토큰이 `~/.npmrc`에 캐시됨
- 같은 세션에서 이후 배포 시 재인증 불필요

자세한 내용은 [local-publish.ko.md](./local-publish.ko.md)를 참조하세요.

## CI 배포 (GitHub Actions)

워크플로우 `.github/workflows/publish.yml`은 네 가지 모드를 지원합니다:

| 모드 | 용도 |
|------|------|
| `publish` (릴리스 기본값) | 일반 버전 업 — 패키지 간 3초 딜레이 |
| `publish-batch` | 느린 배포 (10초/30초 딜레이) — 안전 우선 |
| `dry-run` (수동 실행 기본값) | package.json 유효성 검증만 수행 |
| `build` | 빌드만 실행, 레지스트리 미접근 |

`release: published` 이벤트에서 워크플로우가 자동 트리거됩니다.
`gh release create v0.x.x`로 GitHub 릴리스를 생성하면 자동으로 배포가 시작됩니다.

## 문제 해결

| 오류 | 원인 | 해결 |
|------|------|------|
| `E401 Unauthorized` | 토큰 만료 또는 누락 | `npm login --auth-type=web` 또는 `NPM_TOKEN` 시크릿 갱신 |
| `EOTP` | 2FA 재인증 필요 | npm이 출력한 디바이스 인증 URL 접속 |
| `ENEEDAUTH` | 환경에 토큰 없음 | `NPM_TOKEN` 시크릿 또는 `~/.npmrc` 확인 |
| `dist/ not found` | 빌드 미실행 | 먼저 `bun run build` 실행 |

31개 패키지 전부 레지스트리에 등록되어 있습니다.
25/24h 신규 패키지 속도 제한은 더 이상 적용되지 않습니다
(이후 릴리스는 새 패키지 생성이 아닌 기존 패키지 업데이트이기 때문).
