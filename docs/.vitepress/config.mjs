import { defineConfig } from 'vitepress';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

export default defineConfig({
  title: 'flow-select',
  description: 'A fast, keyboard-first select for plain HTML forms. No dependencies.',
  base: process.env.DOCS_BASE || '/',
  cleanUrls: true,
  lastUpdated: false,
  head: [['link', { rel: 'icon', href: 'data:,' }]],
  vite: {
    resolve: {
      alias: {
        'flow-select/css': resolve(root, 'src/flow-select.css'),
        'flow-select': resolve(root, 'src/index.js')
      }
    }
  },
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'Features', link: '/features/variants' },
      { text: 'Integrations', link: '/integrations/forms' },
      { text: 'Reference', link: '/reference/options' }
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Introduction', link: '/guide/introduction' },
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'How it works', link: '/guide/how-it-works' }
        ]
      },
      {
        text: 'Features',
        items: [
          { text: 'Variants and sizes', link: '/features/variants' },
          { text: 'Search', link: '/features/search' },
          { text: 'Multiple selection', link: '/features/multiple' },
          { text: 'Groups and rich options', link: '/features/rich-options' },
          { text: 'Placeholder and clearing', link: '/features/placeholder' },
          { text: 'Creating options', link: '/features/create' },
          { text: 'Remote data', link: '/features/remote' }
        ]
      },
      {
        text: 'Integrations',
        items: [
          { text: 'Forms and servers', link: '/integrations/forms' },
          { text: 'htmx', link: '/integrations/htmx' },
          { text: 'Bootstrap 5', link: '/integrations/bootstrap' },
          { text: 'JavaScript and modules', link: '/integrations/javascript' }
        ]
      },
      {
        text: 'Customization',
        items: [
          { text: 'Theming', link: '/customization/theming' },
          { text: 'Custom rendering', link: '/customization/rendering' },
          { text: 'Messages and translation', link: '/customization/messages' },
          { text: 'Extending', link: '/customization/extending' }
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'Options', link: '/reference/options' },
          { text: 'Methods and properties', link: '/reference/api' },
          { text: 'Events', link: '/reference/events' },
          { text: 'Keyboard', link: '/reference/keyboard' },
          { text: 'Accessibility', link: '/reference/accessibility' },
          { text: 'Browser support', link: '/reference/browsers' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/waqasahmaddev/flow-select' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/flow-select' }
    ],
    editLink: {
      pattern: 'https://github.com/waqasahmaddev/flow-select/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    footer: {
      message: 'Released under the MIT License.'
    }
  }
});
