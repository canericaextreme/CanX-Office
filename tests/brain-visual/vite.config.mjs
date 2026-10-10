// Offline visual review: no owner session, server calls or production data.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL('./', import.meta.url)),
  plugins: [{ name: 'offline-fixture', enforce: 'pre', resolveId(id) {
    if (['@tanstack/react-start', '@tanstack/react-router', '@/lib/owner-session', '@/lib/brain-index.functions', '@/lib/office-files.functions'].includes(id) || /\/lib\/(owner-session|brain-index\.functions|office-files\.functions)(\.ts)?$/.test(id))
      return root + 'tests/brain-visual/mocks.tsx';
  } }, react(), tailwind()],
  resolve: { alias: { '@': root + 'src' } },
  server: { fs: { allow: [root] } },
});
