import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {version:string};
const buildInfo = {
  version,
  builtAt: new Date().toISOString(),
  commit: (process.env.GITHUB_SHA || 'local').slice(0, 12),
};

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/modern-league/' : '/',
  define: { __MODERN_LEAGUE_BUILD__: JSON.stringify(buildInfo) },
  plugins: [
    react(), tailwindcss(),
    {
      name: 'modern-league-build-manifest',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(buildInfo, null, 2) + '\n' });
      },
    },
  ],
}));
