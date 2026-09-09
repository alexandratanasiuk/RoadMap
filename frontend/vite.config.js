import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

/** Прокси /api → backend (порт как в backend/.env PORT, по умолчанию 3011). */
const apiProxyTarget = (env) =>
  String(env.DEV_PROXY_TARGET || env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:3011').replace(/\/$/, '')

const apiProxy = (target) => ({
  target,
  changeOrigin: true,
  configure(proxy) {
    proxy.on('error', (err, _req, res) => {
      console.error('[vite /api proxy]', err?.message || err)
      if (res && typeof res.writeHead === 'function' && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(
          JSON.stringify({
            error:
              'Прокси: backend недоступен. Запустите backend (npm start в backend/) и при необходимости задайте DEV_PROXY_TARGET во frontend/.env'
          })
        )
      }
    })
  }
})

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = apiProxyTarget(env)

  return {
    plugins: [vue()],
    server: {
      host: true,
      port: 3000,
      strictPort: true,
      open: false,
      cors: true,
      allowedHosts: ['localhost', '127.0.0.1', 'put-roadmap.duckdns.org'],
      proxy: {
        '/api': apiProxy(target)
      }
    },
    preview: {
      port: 3000,
      host: true,
      allowedHosts: ['localhost', '127.0.0.1', 'put-roadmap.duckdns.org'],
      proxy: {
        '/api': apiProxy(target)
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    }
  }
})
