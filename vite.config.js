import { defineConfig } from 'vite';

// get-in-line.de sendet keine CORS-Header, daher laufen Abrufe über diesen Proxy.
const proxy = {
  '/sheet': {
    target: 'https://www.get-in-line.de',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/sheet/, '/dances'),
  },
};

export default defineConfig({
  base: './', // relative Pfade, damit der Build auch unter bric.github.io/linedancer/ läuft
  server: { proxy },
  preview: { proxy },
  test: { environment: 'node' },
});
