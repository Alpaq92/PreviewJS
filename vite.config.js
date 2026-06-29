import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// foliate-js's pdf.js bundles pdf.mjs via a `new URL(`vendor/pdfjs/…`)` pattern
// that Vite's production build can't resolve. ReaderJS never opens PDFs through
// foliate (PDFRenderer handles them), so intercept foliate's conditional
// `import('./pdf.js')` at resolve time and redirect it to a harmless stub.
const stubFoliatePdf = {
  name: 'stub-foliate-pdf',
  enforce: 'pre',
  resolveId(source, importer) {
    if (source === './pdf.js' && importer?.replace(/\\/g, '/').includes('/foliate-js/')) {
      return fileURLToPath(new URL('./src/foliate-pdf-stub.js', import.meta.url))
    }
  },
}

export default defineConfig({
  plugins: [stubFoliatePdf],
  resolve: {
    alias: {
      // CHMate only declares its reader (".") in package.json exports, which
      // blocks a bare `chmate/render` import. Alias the browser renderer
      // (renderTopic/BlobCache) straight to its file so the CHM renderer can
      // reuse CHMate's hardened sanitizer instead of reimplementing it.
      // TODO: drop this alias once CHMate adds "./render" to its package exports.
      'chmate/render': fileURLToPath(new URL('./node_modules/chmate/src/render.js', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['pdfjs-dist', 'mammoth'],
    // Don't esbuild-prebundle foliate-js: it's source-style ESM and its
    // (stubbed, unused) pdf.js uses top-level await, which fails the es2020
    // optimizer target. Served as source, it goes through stubFoliatePdf.
    exclude: ['foliate-js'],
  },
  build: {
    target: 'es2020'
  }
})
