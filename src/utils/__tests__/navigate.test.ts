import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TOKEN_KEY, USER_KEY } from '@/constants/error-code'
import { hardNavigate, redirectToLogin } from '@/utils/navigate'

/**
 * jsdom 的 window.location 不可直接赋值，用 defineProperty 覆盖。
 * 返回注入的 assign spy，供「默认走 hardNavigate」的用例断言。
 */
function stubLocation(pathname: string, search = ''): ReturnType<typeof vi.fn> {
  const assign = vi.fn()
  Object.defineProperty(window, 'location', {
    value: { pathname, search, assign },
    writable: true,
    configurable: true
  })
  return assign
}

describe('hardNavigate', () => {
  it('透传到 window.location.assign', () => {
    const assign = stubLocation('/event/list')
    hardNavigate('/login')
    expect(assign).toHaveBeenCalledWith('/login')
  })
})

describe('redirectToLogin', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('清空本地凭据并带 redirect 参数跳转（注入 navigate，不依赖 ESM mock）', () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-abc')
    localStorage.setItem(USER_KEY, '{"username":"admin"}')
    stubLocation('/event/list')
    const navigate = vi.fn()

    redirectToLogin(navigate)

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(USER_KEY)).toBeNull()
    expect(navigate).toHaveBeenCalledWith('/login?redirect=%2Fevent%2Flist')
  })

  it('当前路径带 query 时一并编码进 redirect', () => {
    stubLocation('/event/list', '?eventType=200')
    const navigate = vi.fn()

    redirectToLogin(navigate)

    expect(navigate).toHaveBeenCalledWith('/login?redirect=%2Fevent%2Flist%3FeventType%3D200')
  })

  it('已在登录页时 redirect 归为根路径，避免登录后跳回登录页', () => {
    stubLocation('/login', '?redirect=%2Fx')
    const navigate = vi.fn()

    redirectToLogin(navigate)

    expect(navigate).toHaveBeenCalledWith('/login?redirect=%2F')
  })

  it('未传 navigate 时默认走 hardNavigate', () => {
    const assign = stubLocation('/event/statistics')

    redirectToLogin()

    expect(assign).toHaveBeenCalledWith('/login?redirect=%2Fevent%2Fstatistics')
  })
})
