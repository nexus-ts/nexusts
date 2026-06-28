---
title: 시작하기
description: NexusTS 시작하기
---

# 시작하기

## 사전 요구사항

- [Bun](https://bun.sh) ≥ 1.3.10
- **Bun** ≥ 1.3.10

## 빠른 시작

새 NexusTS 프로젝트를 만드는 가장 빠른 방법:

```bash
bun create nexusts@latest my-app
cd my-app
bun install
bun run dev
```

이 명령어로 다음과 같은 완전한 프로젝트가 생성됩니다:

- MVC 구조 (`app/` 디렉토리: 컨트롤러, 모듈)
- Drizzle ORM (bun-sqlite — 설정 없는 SQLite)
- 정적 파일 서빙
- `.env` / `.env.local` 설정

## CLI 사용하기

더 세부적인 스캐폴딩 제어를 원한다면 `nx` CLI를 직접 사용하세요:

```bash
# 최소 프로젝트 생성
bunx nx new my-app

# 특정 옵션으로 생성
bunx nx new my-app --style nest --view inertia --orm drizzle --db sqlite --frontend react

# 기존 디렉토리에 초기화 (비파괴적)
bunx nx init --style nest --view inertia --orm drizzle
```

## 프로젝트 구조

```
my-app/
├── app/
│   ├── main.ts                 # 진입점
│   ├── app.module.ts           # 루트 모듈
│   └── controllers/
│       └── home.controller.ts  # 샘플 컨트롤러
├── resources/
│   ├── views/                  # 템플릿 (Rendu/Edge/Eta)
│   └── js/                     # Inertia 페이지 (React/Vue)
├── public/                     # 정적 에셋
├── nx.config.ts                # 프레임워크 설정
├── drizzle.config.ts           # Drizzle 설정
├── tsconfig.json
└── package.json
```

## 다음 단계

프로젝트가 실행되면 다음을 시도해보세요:

```bash
# CRUD API 생성
bunx nx make:crud Post

# 컨트롤러 생성
bunx nx make:controller User

# 데이터베이스 마이그레이션 실행
bunx nx db:generate
bunx nx db:migrate

# 대화형 REPL 열기
bunx nx repl
```

## 더 알아보기

- [사용자 가이드](https://github.com/nexus-ts/nexusts/tree/main/docs/user-guide) — 32개 모듈 상세 가이드
- [API 레퍼런스](https://github.com/nexus-ts/nexusts/blob/main/docs/api-reference.md) — 전체 API 문서
- [예제](https://github.com/nexus-ts/nexusts/tree/main/examples) — 34개 작동 예제 앱
