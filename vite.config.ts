import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * 开发期所有后端请求走 `/api` 前缀，由 Vite 代理到网关(默认 9999)并剥掉 `/api`：
 *   /api/auth/oauth/token            -> gateway:9999/auth/oauth/token            -> detect-auth
 *   /api/admin/event/event-records/* -> gateway:9999/admin/event/event-records/* -> detect-event
 *
 * 代理规则提为顶层常量后**同时挂到 `server` 与 `preview`** —— Vite 的 `preview` 不继承
 * `server.proxy`，只配 server 时 `npm run preview` 的所有接口都会 404。
 *
 * 网关未启动时，把 VITE_PROXY_TARGET 改成 http://localhost:8082 可直连 event 服务联调
 * （此时还需把 `EVENT_BASE` 临时改为 ''，因为 StripPrefix=2 是在网关上生效的）。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_PROXY_TARGET || 'http://localhost:9999'

  const proxy = {
    '/api': {
      target,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, '')
    }
  }

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      host: true,
      port: 5173,
      open: false,
      proxy
    },
    preview: {
      host: true,
      port: 4173,
      proxy
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          /**
           * 只手动分包 vue 与 element-plus。**刻意不给 echarts 配 manualChunks** ——
           * 写成 `echarts: ['echarts']` 会把 echarts 的**全量根入口**拉进 chunk（实测 554.72 kB），
           * 直接抵消 `echarts/core` + 按需注册的效果；交给 Rollup 自己拆，只打真正用到的模块。
           */
          manualChunks: {
            vue: ['vue', 'vue-router', 'pinia'],
            element: ['element-plus', '@element-plus/icons-vue']
          }
        }
      }
    }
  }
})
