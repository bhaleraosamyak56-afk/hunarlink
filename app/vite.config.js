import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const atRoot = mode === 'root'
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
    base: adminPreview ? '/' : atRoot ? '/hunarlink/' : '/hunarlink/react/',
    build: {
      outDir: atRoot ? '../dist' : '../react',
      emptyOutDir: true,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          /* React and the router change far less often than the app, so they
             get their own long-lived chunks. A deploy that only touches page
             code then leaves the vendor chunks cached in the browser. */
          manualChunks(id) {
            if (id.includes('node_modules')) {
              /* Clerk MUST be tested before the 'react' test below, because
                 `@clerk/react` and `@clerk/clerk-react` both contain the
                 substring 'react' and would otherwise be swept into
                 vendor-react. That chunk is modulepreloaded by index.html on
                 every page, so Clerk would download for every visitor —
                 including the many who never see a login screen. Returning
                 undefined leaves Clerk in the lazy ClerkBoundary chunk. */
              if (id.includes('@clerk')) return undefined
              if (id.includes('react-router')) return 'vendor-router'
              if (id.includes('react')) return 'vendor-react'
              return 'vendor'
            }
            return undefined
          }
        }
      }
    },
    server: { host: '0.0.0.0', port: 5173, allowedHosts: true }
  }
})
