import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Shared proxy config: inject Cookie from X-Fnos-Cookie header (browser can't set Cookie directly)
  const fnosProxyConfigure = (proxy) => {
    proxy.on('proxyReq', (proxyReq, req) => {
      const cookie = req.headers['x-fnos-cookie']
      if (cookie) {
        proxyReq.setHeader('Cookie', cookie)
        proxyReq.removeHeader('X-Fnos-Cookie')
      }
      // Also support X-Fnos-Token for backward compat
      const token = req.headers['x-fnos-token']
      if (token && !cookie) {
        proxyReq.setHeader('Cookie', `fnos-long-token=${token}`)
        proxyReq.removeHeader('X-Fnos-Token')
      }
      // Convert X-Fnos-Authx → authx header (browser can't set 'authx' directly due to CORS)
      const authx = req.headers['x-fnos-authx']
      if (authx) {
        proxyReq.setHeader('authx', authx)
        proxyReq.removeHeader('X-Fnos-Authx')
      }
      // For /fnos-stream: support cookie via _fc query param (img tags can't set custom headers)
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
      const fcParam = url.searchParams.get('_fc')
      if (fcParam && !cookie) {
        proxyReq.setHeader('Cookie', fcParam)
        url.searchParams.delete('_fc')
      }
      // For /fnos-stream: support authx via _fax query param
      const faxParam = url.searchParams.get('_fax')
      if (faxParam) {
        proxyReq.setHeader('authx', faxParam)
        url.searchParams.delete('_fax')
      }
      if (fcParam || faxParam) {
        proxyReq.path = url.pathname + (url.search ? url.search : '')
      }
    })
  }

  return {
    build: {
      ssr: false
    },
    server: {
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: env.VITE_BB_URL || 'http://192.168.100.223:8900',
          changeOrigin: true,
          secure: false
        },
        '/fnos-api': {
          target: env.VITE_FNOS_URL || 'http://192.168.100.223:5666',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/fnos-api/, '/p/api/v1'),
          configure: fnosProxyConfigure
        },
        '/fnos-stream': {
          target: env.VITE_FNOS_URL || 'http://192.168.100.223:5666',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/fnos-stream/, ''),
          configure: fnosProxyConfigure
        }
      }
    },
    plugins: [
      vue(),
      tailwindcss()
    ]
  }
})
