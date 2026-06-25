/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Treat committed sample PDFs as static assets so `import x from './x.pdf'` yields a URL.
  assetsInclude: ['**/*.pdf'],
  build: {
    // Emit sample PDFs as real files instead of inlining them as base64 data URLs
    // (they are under the 4kB default), so pdf.js fetches them from a normal URL.
    assetsInlineLimit: (file) => (file.endsWith('.pdf') ? false : undefined),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
