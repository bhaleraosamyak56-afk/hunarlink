import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* Two targets:
   - `npm run build`        -> ../react/   (deployed under /hunarlink/react/)
   - `npm run build:root`   -> ../dist/    (when React becomes the whole site)

   The base must match wherever the build is served from. Deploying to a
   subfolder first keeps the current static site live at the repo root, so
   there is always something working to fall back to during the migration.  */
export default defineConfig(({ mode }) => {
  const atRoot = mode === 'root'
  return {
    plugins: [react()],
    base: atRoot ? '/hunarlink/' : '/hunarlink/react/',
    build: {
      outDir: atRoot ? '../dist' : '../react',
      emptyOutDir: true,
      chunkSizeWarningLimit: 900,
    },
    server: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  }
})
