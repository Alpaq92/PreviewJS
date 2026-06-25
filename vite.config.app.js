import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import baseConfig from './vite.config.js'

// Embed build #1 — the read-only viewer page (reader.html) plus per-format lazy
// chunks, workers, and the copied public/ assets (rtfjs/, libarchive/, jsdoc/).
// `base: './'` makes every asset URL resolve relative to wherever the host
// vendors the dist-embed/ folder. Reuses the base config's stubFoliatePdf
// plugin + optimizeDeps + target.
export default defineConfig({
  ...baseConfig,
  base: './',
  worker: { format: 'es' },        // pdf.js + dejaview are module workers
  build: {
    ...baseConfig.build,           // target: 'es2020'
    outDir: 'dist-embed',
    emptyOutDir: true,             // first build: start from a clean folder
    rollupOptions: {
      input: { reader: fileURLToPath(new URL('./reader.html', import.meta.url)) },
    },
  },
})
