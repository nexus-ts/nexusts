# npm 속도 제한 — 25/24h 신규 패키지 제한

v0.7.0 릴리스 시 경험한 npm 속도 제한과 복구 방법을 설명합니다.

## 발생한 문제

v0.7.0에서 `@nexusts/*` 패키지 대규모 초기 배포 시 다음 오류가 발생했습니다:

```
npm error code E429
npm error 429 Too Many Requests - PUT https://registry.npmjs.org/@nexusts%2Fcore
npm error You have exceeded the 25 new package publish limit in the last 24 hours.
```

npm은 계정당 **24시간 내 신규 패키지 25개** 생성 제한을 적용합니다.
이미 존재하는 패키지의 버전 업데이트는 이 제한과 무관합니다.

## 제한 조건

| 항목 | 값 |
|------|-----|
| 신규 패키지 생성 | 사용자당 25개 / 24시간 |
| 기존 패키지 버전 업 | 제한 없음 |
| 적용 범위 | 계정 기준 (org 전체 합산) |

## 복구 방법

### 즉시 조치

1. **배포 스크립트 중단** — 추가 시도는 카운터를 소진할 뿐입니다.
2. **이미 배포된 패키지 확인**:
   ```bash
   npm view @nexusts/core version  # 성공 예시
   ```
3. **24시간 대기** — 제한은 자동으로 해제됩니다.

### 재개 방법

`publish.ts`는 멱등성을 보장합니다. 24시간 후 그대로 재실행하면 됩니다:

```bash
bun run publish:all
```

이미 배포된 패키지는 건너뛰고 미완료 패키지만 배포합니다.

### 느린 배포 모드 사용

제한에 근접했다면 `publish-batch` 모드를 사용하세요:

```bash
# GitHub Actions 수동 실행 → mode: publish-batch
# 또는 직접 실행:
PUBLISH_BATCH_DELAY_MS=10000 PUBLISH_BATCH_BREAK_MS=30000 PUBLISH_BATCH_BREAK_N=3 bun run publish:all
```

## v0.7.0 이후

31개 패키지 전부 npm 레지스트리에 등록되었습니다.
이후 모든 릴리스는 **기존 패키지 버전 업**이므로 25/24h 제한이 적용되지 않습니다.

## 참고

- [npm 공식 문서 — 속도 제한](https://docs.npmjs.com/policies/rate-limit)
- [Publishing overview](./README.ko.md)
- [로컬 배포 가이드](./local-publish.ko.md)
