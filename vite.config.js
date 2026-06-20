import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: {
    include: ['pdfjs-dist', 'mammoth', 'rtf.js']
  },
  build: {
    target: 'es2020'
  }
})
