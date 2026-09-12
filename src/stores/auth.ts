import { defineStore } from 'pinia'
import { login as loginApi } from '@/api/auth'
import { useDictStore } from '@/stores/dict'
import {
  clearStoredUser,
  clearToken,
  getStoredUser,
  getToken,
  isTokenExpired,
  setStoredUser,
  setToken,
  type StoredUser
} from '@/utils/token'

interface AuthState {
  token: string
  user: StoredUser | null
  loading: boolean
}

/**
 * 登录态。
 *
 * 后端为无状态 JWT 且无 refresh token 端点（设计规格 §3.4），故令牌持久化在 localStorage，
 * 刷新页面由 `restore()` 恢复；过期判定用前端补记的 `issuedAt` + 后端给的 `expires_in`。
 *
 * store 内**不做 UI 提示**（不 import ElMessage）：错误提示由拦截器与页面负责，store 只管状态。
 */
export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({ token: '', user: null, loading: false }),

  getters: {
    /** 有令牌且未过期才算已登录（守卫与顶栏共用同一判据） */
    isLoggedIn: (s): boolean => !!s.token && !isTokenExpired(s.user)
  },

  actions: {
    /**
     * 登录：成功后写入令牌 + 用户信息（补记 issuedAt）。
     *
     * 刻意不在此预载字典 —— 路由守卫在放行前已 `await dict.load()`，
     * 这里再拉一次只会让登录多等一个往返；auth → dict 的耦合只保留在 logout 的清缓存上。
     * 失败时不写任何凭据，异常原样抛给页面（页面据此复位表单，提示已由调用方处理）。
     */
    async login(username: string, password: string): Promise<void> {
      this.loading = true
      try {
        const res = await loginApi(username, password)
        this.token = res.access_token
        this.user = {
          userId: res.user_id,
          username: res.username,
          authorities: res.authorities ?? [],
          issuedAt: Date.now(),
          expiresIn: res.expires_in
        }
        setToken(res.access_token)
        setStoredUser(this.user)
      } finally {
        this.loading = false
      }
    },

    /**
     * 从 localStorage 恢复会话（main.ts 里 pinia 装好后调一次）。
     * 令牌已过期或用户信息缺失则清空凭据，避免守卫放行后第一个请求就 401。
     */
    restore(): void {
      const token = getToken()
      const user = getStoredUser()
      if (!token || !user || isTokenExpired(user)) {
        clearToken()
        clearStoredUser()
        this.token = ''
        this.user = null
        return
      }
      this.token = token
      this.user = user
    },

    /** 退出登录：清 store + localStorage + 字典缓存（切换账号不残留） */
    logout(): void {
      this.token = ''
      this.user = null
      clearToken()
      clearStoredUser()
      useDictStore().reset()
    }
  }
})
