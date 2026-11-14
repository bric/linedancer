import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative Pfade, damit der Build auch unter bric.github.io/linedancer/ läuft
  test: { environment: 'node' },
});
