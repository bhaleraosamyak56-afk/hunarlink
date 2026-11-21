import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Deployed to GitHub Pages under /hunarlink/, so the base must match.
export default defineConfig({
  plugins: [react()],
  base: '/hunarlink/',
  build: { outDir: '../dist', emptyOutDir: true },
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true }
})
