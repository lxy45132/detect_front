import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * 开发期所有后端请求走 `/api` 前缀，由 Vite 代理到网关(默认 9999)并剥掉 `/api`：
 *   /api/auth/oauth/token            -> gateway:9999/auth/oauth/token            -> detect-auth
 *   /api/admin/event/event-records/* -> gateway:9999/admin/event/event-records/* -> detect-event
 * 网关未启动时，把 VITE_PROXY_TARGET 改成 http://localhost:8082 可直连 event 服务联调。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_PROXY_TARGET || 'http://localhost:9999'

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
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks: {
            vue: ['vue', 'vue-router', 'pinia'],
            element: ['element-plus', '@element-plus/icons-vue'],
            echarts: ['echarts']
          }
        }
      }
    }
  }
})
