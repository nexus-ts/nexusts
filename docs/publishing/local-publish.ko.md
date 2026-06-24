# 로컬 머신에서 배포하기

CI 워크플로우 외부에서 배포해야 할 때 사용합니다.

## 사전 조건

- `@nexusts` npm 조직의 메인테이너 권한
- npm 계정에 **2FA 활성화**
- `bun` ≥ 1.3.0

## 로그인 (머신 최초 1회)

```bash
npm login --auth-type=web
```

npm 11의 디바이스 인증 흐름:

1. URL이 출력되면 ENTER를 눌러 브라우저에서 열기
2. 로그인 후 2FA(TOTP 또는 WebAuthn) 및 생체 인증 완료
3. 세션 토큰이 `~/.npmrc`에 캐시됨

확인: `npm whoami`가 사용자명을 반환하면 정상입니다.

## 배포

```bash
bun run build
bun run publish:all
```

`publish.ts`는 각 패키지 배포 전 레지스트리를 확인하고 이미 배포된 버전은 건너뜁니다.
부분 실패 후 재실행하면 누락된 패키지만 처리합니다.

## CI용 토큰 발급

**Automation** 토큰을 발급합니다 (2FA 우회, 속도 제한 준수):

1. <https://www.npmjs.com/settings/kabyeon/tokens> → Generate New Token
2. 타입: **Automation**, 만료: 90일
3. `npm_xxxxx...` 토큰 저장
4. GitHub 레포지토리 설정에 `NPM_TOKEN` 시크릿으로 추가

워크플로우는 이를 `NODE_AUTH_TOKEN`으로 배포 스텝에 전달합니다.
