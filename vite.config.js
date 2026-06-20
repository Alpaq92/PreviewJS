import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: {
    include: ['pdfjs-dist', 'mammoth']
  },
  build: {
    target: 'es2020'
  }
})
