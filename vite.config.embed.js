import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// Embed build #2 — the tiny loader IIFE (readerjs.js) exposing window.ReaderJS.
// Runs AFTER the app build, into the SAME folder, WITHOUT emptying it.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-embed',
    emptyOutDir: false,            // keep the app build's reader.html + chunks
    target: 'es2020',
    lib: {
      entry: fileURLToPath(new URL('./src/readerjs.js', import.meta.url)),
      name: 'ReaderJS',
      formats: ['iife'],
      fileName: () => 'readerjs.js',
    },
    rollupOptions: { output: { extend: true } },
  },
})
