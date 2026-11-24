import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        'surface-hover': 'var(--bg-hover)',
        border: 'var(--border-subtle)',
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
        accent: {
          DEFAULT: 'var(--accent-primary)',
          bright: 'var(--accent-bright)',
        },
        status: {
          online: 'var(--status-online)',
          away: 'var(--status-away)',
          busy: 'var(--status-busy)',
          offline: 'var(--status-offline)',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      borderRadius: {
        '2xl': '16px',
        xl: '12px',
      },
      boxShadow: {
        neon: '0 0 20px -5px rgba(124, 58, 237, 0.35)',
        'neon-strong': '0 0 30px -4px rgba(139, 92, 246, 0.5)',
      },
    },
  },
  plugins: [],
};

export default config;
