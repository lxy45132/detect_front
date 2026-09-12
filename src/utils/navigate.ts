import { clearStoredUser, clearToken } from '@/utils/token'

/** window.location.assign 薄封装：单独成函数便于单测拦截 */
export function hardNavigate(url: string): void {
  window.location.assign(url)
}

/**
 * 401 统一出口：清本地凭据后硬跳登录页。
 *
 * 用硬跳转而非 router.push —— 一是规避 `request.ts ↔ router` 的循环依赖，
 * 二是整页重载可确保 Pinia 内存态（含字典缓存）一并清空，不留脏数据。
 * 已在登录页时 redirect 归为 `/`，否则登录成功后又跳回登录页。
 * `navigate` 参数供单测注入，避免用 vi.mock 打模块级 mock（ESM 提升顺序会污染用例）。
 */
export function redirectToLogin(navigate: (url: string) => void = hardNavigate): void {
  clearToken()
  clearStoredUser()
  const current = window.location.pathname + window.location.search
  const redirect = current.startsWith('/login') ? '/' : current
  navigate(`/login?redirect=${encodeURIComponent(redirect)}`)
}
