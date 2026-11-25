import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  const atRoot = mode === 'root'
  const isDevServer = command === 'serve'
  const adminPreview = process.env.HUNARLINK_ADMIN_PREVIEW === '1'
  const adminPreviewEntry = adminPreview ? {
    name: 'admin-login-preview-entry',
    configureServer(server) {
      /* This review server opens at /; show the user sign-in page immediately
         so its new Admin Login link is visible and clickable in the preview. */
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0]
        if (path === '/' || path === '/index.html') {
          res.statusCode = 302
          res.setHeader('Location', '/login')
          res.end()
          return
        }
        next()
      })
    }
  } : null
  return {
    plugins: [react(), ...(adminPreviewEntry ? [adminPreviewEntry] : [])],
    base: adminPreview || isDevServer ? '/' : atRoot ? '/hunarlink/' : '/hunarlink/react/',
    build: {
      outDir: atRoot ? '../dist' : '../react',
      emptyOutDir: true,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          /* React and the router change far less often than the app, so they
             get their own long-lived chunks. Leave @clerk (and its internal
             query/dequal deps) unassigned so they stay inside the lazy
             ClerkBoundary chunk and never pull into vendor-react or index
             preloads. */
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('@clerk') || id.includes('@tanstack') || id.includes('dequal')) {
                return undefined
              }
              if (id.includes('react-router')) return 'vendor-router'
              if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
                return 'vendor-react'
              }
              return 'vendor'
            }
            return undefined
          }
        }
      }
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: true,
      proxy: {
        '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/healthz': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/readyz': { target: 'http://127.0.0.1:8000', changeOrigin: true }
      }
    }
  }
})
