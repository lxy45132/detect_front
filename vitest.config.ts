/// <reference types="vitest" />
import { defineConfig, mergeConfig, type ConfigEnv, type UserConfig } from 'vite'
import viteConfig from './vite.config'

/**
 * 复用 `vite.config.ts` 的 `@` 别名与 vue 插件，只覆盖测试相关项。
 *
 * 注意：`vite.config.ts` 默认导出的是**函数式** config（内部要 `loadEnv(mode)` 读
 * `VITE_PROXY_TARGET`），而 `mergeConfig` 只接受对象 —— 直接传函数会拿到错误结果，
 * 表现为测试里 `Cannot find module '@/...'`。故先按 env 解析出对象再合并。
 */
export default defineConfig(async (env: ConfigEnv) => {
  const base: UserConfig =
    typeof viteConfig === 'function' ? await viteConfig(env) : (viteConfig as UserConfig)

  return mergeConfig(base, {
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.ts'],
      css: false
    }
  } as UserConfig)
})
