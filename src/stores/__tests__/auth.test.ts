import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { login as apiLogin } from '@/api/auth'
import { fetchEventEnums } from '@/api/dict'
import { useAuthStore } from '@/stores/auth'
import { useDictStore } from '@/stores/dict'
import type { TokenResponse } from '@/types/api'
import { getStoredUser, getToken } from '@/utils/token'

vi.mock('@/api/auth', () => ({ login: vi.fn() }))
vi.mock('@/api/dict', () => ({ fetchEventEnums: vi.fn() }))

const TOKEN: TokenResponse = {
  access_token: 'jwt-abc',
  token_type: 'Bearer',
  expires_in: 43200,
  user_id: 1,
  username: 'admin',
  authorities: ['ROLE_ADMIN']
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  vi.clearAllMocks()
  vi.mocked(apiLogin).mockResolvedValue(TOKEN)
  vi.mocked(fetchEventEnums).mockResolvedValue({
    eventType: [],
    task: [],
    handleStatus: [],
    priority: [],
    ruleType: []
  })
})

describe('auth store 登录', () => {
  it('登录成功后把令牌与用户信息写入 state 与 localStorage', async () => {
    const store = useAuthStore()
    await store.login('admin', '123456')

    expect(apiLogin).toHaveBeenCalledWith('admin', '123456')
    expect(store.token).toBe('jwt-abc')
    expect(store.user?.username).toBe('admin')
    expect(getToken()).toBe('jwt-abc')
    expect(getStoredUser()?.userId).toBe(1)
    expect(getStoredUser()?.authorities).toEqual(['ROLE_ADMIN'])
  })

  it('补记 issuedAt 以便前端预判过期（后端只给 expires_in 不给签发时刻）', async () => {
    const before = Date.now()
    const store = useAuthStore()
    await store.login('admin', '123456')

    const stored = getStoredUser()
    expect(stored?.issuedAt).toBeGreaterThanOrEqual(before)
    expect(stored?.expiresIn).toBe(43200)
  })

  it('登录进行中 loading 为 true，结束后复位', async () => {
    let resolve!: (value: TokenResponse) => void
    vi.mocked(apiLogin).mockReturnValue(
      new Promise<TokenResponse>((r) => {
        resolve = r
      })
    )
    const store = useAuthStore()

    const pending = store.login('admin', '123456')
    expect(store.loading).toBe(true)

    resolve(TOKEN)
    await pending
    expect(store.loading).toBe(false)
  })

  it('登录失败时不写入任何凭据、把异常抛给调用方并复位 loading', async () => {
    vi.mocked(apiLogin).mockRejectedValue(new Error('用户名或密码错误'))
    const store = useAuthStore()

    await expect(store.login('admin', 'wrong')).rejects.toThrow('用户名或密码错误')
    expect(getToken()).toBe('')
    expect(store.token).toBe('')
    expect(store.user).toBeNull()
    expect(store.isLoggedIn).toBe(false)
    expect(store.loading).toBe(false)
  })

  it('isLoggedIn 在有令牌且未过期时为 true', async () => {
    const store = useAuthStore()
    expect(store.isLoggedIn).toBe(false)

    await store.login('admin', '123456')
    expect(store.isLoggedIn).toBe(true)
  })
})

describe('auth store 会话恢复', () => {
  it('restore 从 localStorage 恢复会话（刷新页面场景）', () => {
    localStorage.setItem('detect_access_token', 'jwt-cached')
    localStorage.setItem(
      'detect_login_user',
      JSON.stringify({
        userId: 1,
        username: 'admin',
        authorities: ['ROLE_ADMIN'],
        issuedAt: Date.now(),
        expiresIn: 43200
      })
    )

    const store = useAuthStore()
    store.restore()

    expect(store.isLoggedIn).toBe(true)
    expect(store.token).toBe('jwt-cached')
    expect(store.user?.username).toBe('admin')
  })

  it('restore 遇到已过期令牌时清空本地凭据（避免守卫放行后首个请求就 401）', () => {
    localStorage.setItem('detect_access_token', 'jwt-old')
    localStorage.setItem(
      'detect_login_user',
      JSON.stringify({
        userId: 1,
        username: 'admin',
        authorities: [],
        issuedAt: Date.now() - 86_400_000,
        expiresIn: 60
      })
    )

    const store = useAuthStore()
    store.restore()

    expect(store.isLoggedIn).toBe(false)
    expect(store.token).toBe('')
    expect(store.user).toBeNull()
    expect(getToken()).toBe('')
    expect(getStoredUser()).toBeNull()
  })

  it('只有令牌没有用户信息时视为未登录并清理', () => {
    localStorage.setItem('detect_access_token', 'jwt-orphan')

    const store = useAuthStore()
    store.restore()

    expect(store.isLoggedIn).toBe(false)
    expect(getToken()).toBe('')
  })
})

describe('auth store 退出', () => {
  it('logout 清空 store 与 localStorage', async () => {
    const store = useAuthStore()
    await store.login('admin', '123456')

    store.logout()

    expect(store.token).toBe('')
    expect(store.user).toBeNull()
    expect(store.isLoggedIn).toBe(false)
    expect(getToken()).toBe('')
    expect(getStoredUser()).toBeNull()
  })

  it('logout 同时重置字典缓存（切换账号不残留上一个账号的字典）', async () => {
    const store = useAuthStore()
    const dict = useDictStore()
    await store.login('admin', '123456')
    await dict.load()
    expect(dict.loaded).toBe(true)

    store.logout()

    expect(dict.enums).toBeNull()
    expect(dict.loaded).toBe(false)
    expect(dict.pending).toBeNull()
  })
})
