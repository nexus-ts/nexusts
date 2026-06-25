import { defineConfig } from 'vitepress';

export default defineConfig({
  lang: 'en-US',
  title: 'NexusTS',
  description: 'Bun-native fullstack framework — 32 modular packages under @nexusts/*',

  base: process.env.BASE_URL || '/',

  cleanUrls: true,
  lastUpdated: true,

  markdown: {
    theme: { light: 'github-light', dark: 'github-dark' },
    lineNumbers: true,
  },

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      title: 'NexusTS',
      description: 'Bun-native fullstack framework — 32 modular packages',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/' },
          { text: 'Features', link: '/features' },
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'CLI', link: '/cli' },
          { text: 'Modules', link: '/modules' },
          { text: 'GitHub', link: 'https://github.com/nexus-ts/nexusts' },
        ],
        sidebar: [
          {
            text: 'Introduction',
            items: [
              { text: 'What is NexusTS?', link: '/' },
              { text: 'Features', link: '/features' },
              { text: 'Getting Started', link: '/getting-started' },
            ],
          },
          {
            text: 'Ecosystem',
            items: [
              { text: 'Module Overview', link: '/modules' },
              { text: 'CLI Reference', link: '/cli' },
            ],
          },
          {
            text: 'Resources',
            items: [
              { text: 'GitHub Repository', link: 'https://github.com/nexus-ts/nexusts' },
              { text: 'User Guide', link: 'https://github.com/nexus-ts/nexusts/tree/main/docs/user-guide' },
              { text: 'API Reference', link: 'https://github.com/nexus-ts/nexusts/blob/main/docs/api-reference.md' },
              { text: 'Changelog', link: 'https://github.com/nexus-ts/nexusts/blob/main/CHANGELOG.md' },
            ],
          },
        ],
      },
    },
    ko: {
      label: '한국어',
      lang: 'ko',
      title: 'NexusTS',
      description: 'Bun 네이티브 풀스택 프레임워크 — 32개 모듈 패키지',
      link: '/ko/',
      themeConfig: {
        nav: [
          { text: '홈', link: '/ko/' },
          { text: '기능', link: '/ko/features' },
          { text: '시작하기', link: '/ko/getting-started' },
          { text: 'CLI', link: '/ko/cli' },
          { text: '모듈', link: '/ko/modules' },
          { text: 'GitHub', link: 'https://github.com/nexus-ts/nexusts' },
        ],
        sidebar: [
          {
            text: '소개',
            items: [
              { text: 'NexusTS란?', link: '/ko/' },
              { text: '기능', link: '/ko/features' },
              { text: '시작하기', link: '/ko/getting-started' },
            ],
          },
          {
            text: '생태계',
            items: [
              { text: '모듈 개요', link: '/ko/modules' },
              { text: 'CLI 레퍼런스', link: '/ko/cli' },
            ],
          },
          {
            text: '자료',
            items: [
              { text: 'GitHub 저장소', link: 'https://github.com/nexus-ts/nexusts' },
              { text: '사용자 가이드', link: 'https://github.com/nexus-ts/nexusts/tree/main/docs/user-guide' },
              { text: 'API 레퍼런스', link: 'https://github.com/nexus-ts/nexusts/blob/main/docs/api-reference.md' },
              { text: '변경 로그', link: 'https://github.com/nexus-ts/nexusts/blob/main/CHANGELOG.md' },
            ],
          },
        ],
      },
    },
  },

  themeConfig: {
    logo: '/logo.svg',

    socialLinks: [
      { icon: 'github', link: 'https://github.com/nexus-ts/nexusts' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026-present NexusTS Team',
    },

    search: { provider: 'local' },

    editLink: {
      pattern: 'https://github.com/nexus-ts/nexusts/edit/main/webpage/:path',
      text: 'Edit this page on GitHub',
    },

    outline: { level: [2, 3] },
  },

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#6366f1' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'NexusTS' }],
    ['meta', { property: 'og:description', content: 'Bun-native fullstack framework — 32 modular packages under @nexusts/*' }],
  ],
});