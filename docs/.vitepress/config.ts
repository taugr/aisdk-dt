import { defineConfig } from 'vitepress';
import {
  groupIconMdPlugin,
  groupIconVitePlugin,
} from 'vitepress-plugin-group-icons';
import llmstxt from 'vitepress-plugin-llms';
import pkg from '../../package.json';

type VitePlugins = NonNullable<
  NonNullable<Parameters<typeof defineConfig>[0]['vite']>['plugins']
>;

const siteUrl = 'https://taugr.github.io/aisdk-dt/';
const description =
  'CLI for inspecting AI SDK DevTools generations.json files with coding agents.';

export default defineConfig({
  title: 'aisdk-dt',
  description,
  base: '/aisdk-dt/',
  sitemap: {
    hostname: siteUrl,
  },
  cleanUrls: true,
  head: [
    ['link', { rel: 'icon', href: '/aisdk-dt/favicon.ico', sizes: 'any' }],
    [
      'link',
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/aisdk-dt/favicon.svg',
      },
    ],
    [
      'link',
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/aisdk-dt/favicon-32x32.png',
      },
    ],
    [
      'link',
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '48x48',
        href: '/aisdk-dt/favicon-48x48.png',
      },
    ],
    [
      'link',
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/aisdk-dt/apple-touch-icon.png',
      },
    ],
    ['link', { rel: 'canonical', href: siteUrl }],
    ['meta', { name: 'description', content: description }],
    [
      'meta',
      {
        name: 'keywords',
        content:
          'ai sdk,vercel ai sdk,ai sdk devtools,coding agents,generations.json,cli',
      },
    ],
    ['meta', { name: 'author', content: 'Tom Auger' }],
    ['meta', { name: 'robots', content: 'index,follow' }],
    ['meta', { property: 'og:title', content: 'aisdk-dt' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:description', content: description }],
    ['meta', { property: 'og:url', content: siteUrl }],
    ['meta', { property: 'og:image', content: `${siteUrl}logo.svg` }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['meta', { name: 'twitter:title', content: 'aisdk-dt' }],
    ['meta', { name: 'twitter:description', content: description }],
    ['meta', { name: 'twitter:image', content: `${siteUrl}logo.svg` }],
    ['meta', { name: 'theme-color', content: '#3b82f6' }],
  ],
  themeConfig: {
    logo: '/logo.svg',
    search: {
      provider: 'local',
    },
    nav: [
      {
        text: 'Guide',
        items: [
          { text: 'Overview', link: '/guide/' },
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Agent Skill', link: '/guide/agent-skill' },
          { text: 'Workflows', link: '/guide/workflows' },
          { text: 'Troubleshooting', link: '/guide/troubleshooting' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'CLI Reference', link: '/guide/commands' },
          { text: 'Safe Inspection', link: '/guide/safe-inspection' },
          { text: 'Compatibility', link: '/guide/compatibility' },
          { text: 'Development', link: '/guide/development' },
        ],
      },
      {
        text: `v${pkg.version}`,
        items: [
          {
            text: `Package v${pkg.version}`,
            link: 'https://www.npmjs.com/package/aisdk-dt',
          },
          {
            text: 'Releases',
            link: 'https://github.com/taugr/aisdk-dt/releases',
          },
          {
            text: 'Contributing',
            link: 'https://github.com/taugr/aisdk-dt/blob/main/CONTRIBUTING.md',
          },
        ],
      },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          collapsed: false,
          items: [
            { text: 'What Is aisdk-dt?', link: '/guide/' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Agent Skill', link: '/guide/agent-skill' },
          ],
        },
        {
          text: 'Usage',
          collapsed: false,
          items: [
            { text: 'Workflows', link: '/guide/workflows' },
            { text: 'Safe Inspection', link: '/guide/safe-inspection' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
          ],
        },
        {
          text: 'Reference',
          collapsed: false,
          items: [
            { text: 'CLI Reference', link: '/guide/commands' },
            { text: 'Compatibility', link: '/guide/compatibility' },
          ],
        },
        {
          text: 'Repository',
          collapsed: false,
          items: [{ text: 'Development', link: '/guide/development' }],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/taugr/aisdk-dt' },
    ],
    footer: {
      message:
        'Released under the MIT License. aisdk-dt is not affiliated with, endorsed by, or maintained by Vercel.',
      copyright: 'Copyright © 2026 Tom Auger',
    },
  },
  markdown: {
    config(md) {
      md.use(groupIconMdPlugin);
    },
  },
  vite: {
    plugins: [groupIconVitePlugin(), llmstxt()] as unknown as VitePlugins,
  },
});
