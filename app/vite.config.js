import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const atRoot = mode === 'root'
  return {
    plugins: [react()],
    base: atRoot ? '/hunarlink/' : '/hunarlink/react/',
    build: {
      outDir: atRoot ? '../dist' : '../react',
      emptyOutDir: true,
      chunkSizeWarningLimit: 1200
    },
    server: { host: '0.0.0.0', port: 5173, allowedHosts: true }
  }
})
