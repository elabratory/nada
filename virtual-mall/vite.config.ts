import { defineConfig } from 'vite';

// Relative base so the built site works from any static host or sub-folder.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
});
