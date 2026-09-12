import { beforeEach, describe, expect, it } from 'vitest'
import { USER_KEY } from '@/constants/error-code'
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

const SECOND = 1000

function user(issuedAt: number, expiresIn = 43200): StoredUser {
  return { userId: 1, username: 'admin', authorities: ['ROLE_ADMIN'], issuedAt, expiresIn }
}

describe('token 读写', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('未写入时 getToken 返回空串而非 null', () => {
    expect(getToken()).toBe('')
    expect(getStoredUser()).toBeNull()
  })

  it('写入后可读回', () => {
    setToken('jwt-token-value')
    setStoredUser(user(1_700_000_000_000))
    expect(getToken()).toBe('jwt-token-value')
    expect(getStoredUser()?.username).toBe('admin')
    expect(getStoredUser()?.expiresIn).toBe(43200)
  })

  it('清除后读不到', () => {
    setToken('t')
    setStoredUser(user(Date.now()))
    clearToken()
    clearStoredUser()
    expect(getToken()).toBe('')
    expect(getStoredUser()).toBeNull()
  })

  it('用户信息被写坏时返回 null 并自清理', () => {
    localStorage.setItem(USER_KEY, '{broken json')
    expect(getStoredUser()).toBeNull()
    expect(localStorage.getItem(USER_KEY)).toBeNull()
  })
})

describe('isTokenExpired', () => {
  it('user 为 null 视为已过期', () => {
    expect(isTokenExpired(null)).toBe(true)
  })

  it('刚签发未过期', () => {
    expect(isTokenExpired(user(Date.now(), 43200))).toBe(false)
  })

  it('剩余不足 30s 余量时判为过期（避免请求在途失效）', () => {
    const issuedAt = Date.now() - 40 * SECOND // 已用 40s，有效期 60s，剩 20s < 30s
    expect(isTokenExpired(user(issuedAt, 60))).toBe(true)
  })

  it('剩余刚好超过 30s 余量时未过期', () => {
    const issuedAt = Date.now() - 10 * SECOND // 已用 10s，有效期 60s，剩 50s > 30s
    expect(isTokenExpired(user(issuedAt, 60))).toBe(false)
  })

  it('超出有效期判为过期', () => {
    const issuedAt = Date.now() - 120 * SECOND
    expect(isTokenExpired(user(issuedAt, 60))).toBe(true)
  })
})
