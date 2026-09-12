import { TOKEN_KEY, USER_KEY } from '@/constants/error-code'

/** 登录用户信息（取自 /oauth/token 响应，非 R 包装） */
export interface StoredUser {
  userId: number
  username: string
  authorities: string[]
  /** 令牌签发时间戳（毫秒） */
  issuedAt: number
  /** 有效期（秒） */
  expiresIn: number
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function getStoredUser(): StoredUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredUser
  } catch {
    localStorage.removeItem(USER_KEY)
    return null
  }
}

export function setStoredUser(user: StoredUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearStoredUser(): void {
  localStorage.removeItem(USER_KEY)
}

/** 前端预判令牌是否已过期（留 30s 余量，避免请求在途失效） */
export function isTokenExpired(user: StoredUser | null): boolean {
  if (!user) return true
  return Date.now() >= user.issuedAt + (user.expiresIn - 30) * 1000
}
