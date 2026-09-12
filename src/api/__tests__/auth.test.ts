import { beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { login } from '@/api/auth'

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>()
  return { ...actual, default: { ...actual.default, post: vi.fn() } }
})

beforeEach(() => vi.clearAllMocks())

describe('login', () => {
  it('以 x-www-form-urlencoded 提交（后端用 @RequestParam 接收，发 JSON 会 400）', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        access_token: 'jwt-x',
        token_type: 'Bearer',
        expires_in: 43200,
        user_id: 1,
        username: 'admin',
        authorities: ['ROLE_ADMIN'],
        scope: 'server'
      }
    })

    const res = await login('admin', '123456')

    const [url, body, cfg] = vi.mocked(axios.post).mock.calls[0]
    expect(url).toBe('/api/auth/oauth/token')
    expect(body).toBeInstanceOf(URLSearchParams)
    expect((body as URLSearchParams).get('username')).toBe('admin')
    expect((body as URLSearchParams).get('password')).toBe('123456')
    expect((body as URLSearchParams).get('grant_type')).toBe('password')
    expect((body as URLSearchParams).get('scope')).toBe('server')
    expect(cfg?.headers?.['Content-Type']).toBe('application/x-www-form-urlencoded')
    // OAuth2 扁平响应的下划线字段原样透传，不改成 camelCase
    expect(res.access_token).toBe('jwt-x')
    expect(res.expires_in).toBe(43200)
    expect(res.user_id).toBe(1)
    expect(res.authorities).toEqual(['ROLE_ADMIN'])
  })

  it('密码错误时 message 取 error_description 而非 error（后者是 invalid_grant 机器码）', async () => {
    vi.mocked(axios.post).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: { error: 'invalid_grant', error_description: '用户名或密码错误' }
      }
    })

    await expect(login('admin', 'wrong')).rejects.toThrow('用户名或密码错误')
    await expect(login('admin', 'wrong')).rejects.not.toThrow('invalid_grant')
  })

  it('400 但无 error_description 时按状态码兜底', async () => {
    vi.mocked(axios.post).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { error: 'invalid_grant' } }
    })

    await expect(login('admin', 'x')).rejects.toThrow('用户名或密码错误')
  })

  it('404 时提示检查网关路由', async () => {
    vi.mocked(axios.post).mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: null }
    })

    await expect(login('admin', 'x')).rejects.toThrow(
      '认证端点不存在，请检查网关路由 /auth/** 是否生效'
    )
  })

  it('后端未启动（无 response）时给出可读提示', async () => {
    vi.mocked(axios.post).mockRejectedValue({ isAxiosError: true, message: 'Network Error' })

    await expect(login('admin', '123456')).rejects.toThrow(
      '无法连接认证服务，请确认 detect-gateway(9999) 与 detect-auth(8081) 已启动'
    )
  })
})
