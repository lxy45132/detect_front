import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import {
  BizError,
  onRequestFulfilled,
  onResponseFulfilled,
  onResponseRejected
} from '@/api/interceptors'
import { redirectToLogin } from '@/utils/navigate'

/**
 * 令牌用 vi.hoisted 的可变桩：既要覆盖「有 token 注入 Bearer」，
 * 也要覆盖「无 token 时不加该头」。直接 vi.mock 后再 import 会踩 ESM 的 TDZ。
 */
const h = vi.hoisted(() => ({ token: 'jwt-abc' }))

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }
}))
vi.mock('@/utils/navigate', () => ({ redirectToLogin: vi.fn(), hardNavigate: vi.fn() }))
vi.mock('@/utils/token', () => ({
  getToken: () => h.token,
  clearToken: vi.fn(),
  clearStoredUser: vi.fn()
}))

function config(over: Partial<InternalAxiosRequestConfig> = {}): InternalAxiosRequestConfig {
  return { url: '/x', method: 'get', params: {}, headers: { set: vi.fn() } as never, ...over }
}

function response(data: unknown, over: Partial<AxiosResponse> = {}): AxiosResponse {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { url: '/x', headers: {} } as InternalAxiosRequestConfig,
    ...over
  } as AxiosResponse
}

beforeEach(() => {
  vi.clearAllMocks()
  h.token = 'jwt-abc'
})

describe('onRequestFulfilled', () => {
  it('有令牌时注入 Authorization: Bearer', () => {
    const out = onRequestFulfilled(config())
    expect(out.headers.set).toHaveBeenCalledWith('Authorization', 'Bearer jwt-abc')
  })

  it('无令牌时不加 Authorization 头（登录接口本身不带令牌）', () => {
    h.token = ''
    const out = onRequestFulfilled(config())
    expect(out.headers.set).not.toHaveBeenCalled()
  })

  it('清洗 GET 参数中的空值，但保留 priority=0', () => {
    const out = onRequestFulfilled(
      config({ params: { eventType: '', priority: 0, keyword: null, task: undefined } })
    )
    expect(out.params).toEqual({ priority: 0 })
  })

  it('params 缺省时不报错', () => {
    const out = onRequestFulfilled(config({ params: undefined }))
    expect(out.params).toBeUndefined()
  })
})

describe('onResponseFulfilled', () => {
  it('code=0 时拆包直返 data 而非整个 R', () => {
    expect(
      onResponseFulfilled(response({ code: 0, msg: 'success', data: { total: 4 } }))
    ).toEqual({ total: 4 })
  })

  it('code=0 且 data 为 null 时返回 null（DELETE/PUT 无数据体）', () => {
    expect(onResponseFulfilled(response({ code: 0, msg: 'success', data: null }))).toBeNull()
  })

  it('code≠0 抛 BizError 且只弹一次后端 msg', () => {
    let caught: unknown
    try {
      onResponseFulfilled(response({ code: 1001, msg: '事件不存在', data: null }))
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(BizError)
    expect((caught as BizError).code).toBe(1001)
    expect((caught as BizError).msg).toBe('事件不存在')
    // 只调用一次拦截器，才能断言「只弹一次」（重复调用会让计数断言失去意义）
    expect(ElMessage.error).toHaveBeenCalledTimes(1)
    expect(ElMessage.error).toHaveBeenCalledWith('事件不存在')
  })

  it('code≠0 且 msg 缺失时用 ERROR_MESSAGES 兜底', () => {
    expect(() => onResponseFulfilled(response({ code: 4001, data: null }))).toThrow(BizError)
    expect(ElMessage.error).toHaveBeenCalledWith(
      '导出数量超限（单次上限 5 万条），请缩小筛选范围'
    )
  })

  it('后端 msg 优先于 ERROR_MESSAGES 静态表', () => {
    expect(() =>
      onResponseFulfilled(response({ code: 1001, msg: '该事件已被其他人删除', data: null }))
    ).toThrow(BizError)
    expect(ElMessage.error).toHaveBeenCalledWith('该事件已被其他人删除')
    expect(ElMessage.error).not.toHaveBeenCalledWith('事件不存在')
  })

  it('blob 响应原样透传整个 response（调用方要看 headers 判断 JSON 错误体）', () => {
    const blob = new Blob(['x'])
    const res = response(blob, {
      config: {
        url: '/export',
        responseType: 'blob',
        headers: {}
      } as InternalAxiosRequestConfig
    })
    expect(onResponseFulfilled(res)).toBe(res)
  })

  it('非 R 包装的响应体原样返回，不吞数据', () => {
    expect(onResponseFulfilled(response({ foo: 'bar' }))).toEqual({ foo: 'bar' })
  })
})

describe('onResponseRejected', () => {
  it('HTTP 401 调 redirectToLogin 且不弹提示（跳页前弹消息没意义）', async () => {
    const err = {
      response: { status: 401, data: { code: 401, msg: '未认证', data: null } },
      message: 'Request failed with status code 401',
      isAxiosError: true
    }
    await expect(onResponseRejected(err)).rejects.toBeInstanceOf(BizError)
    await expect(onResponseRejected(err)).rejects.toMatchObject({ code: 401 })
    expect(redirectToLogin).toHaveBeenCalled()
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('HTTP 403 提示后端 msg 且不跳登录', async () => {
    const err = {
      response: { status: 403, data: { code: 403, msg: '内部接口禁止外部访问', data: null } },
      message: 'x',
      isAxiosError: true
    }
    await expect(onResponseRejected(err)).rejects.toBeInstanceOf(BizError)
    expect(ElMessage.error).toHaveBeenCalledWith('内部接口禁止外部访问')
    expect(redirectToLogin).not.toHaveBeenCalled()
  })

  it('HTTP 500 且无响应体时按状态码查兜底文案', async () => {
    const err = { response: { status: 500, data: null }, message: 'boom', isAxiosError: true }
    await expect(onResponseRejected(err)).rejects.toMatchObject({ code: 500 })
    expect(ElMessage.error).toHaveBeenCalledWith('系统异常')
  })

  it('无 response（网络中断/超时）弹网络兜底文案', async () => {
    const err = { message: 'Network Error', isAxiosError: true }
    await expect(onResponseRejected(err)).rejects.toBeInstanceOf(BizError)
    expect(ElMessage.error).toHaveBeenCalledWith('网络异常，请检查后端服务是否已启动')
  })

  it('请求被取消时静默不提示', async () => {
    const err = { message: 'canceled', code: 'ERR_CANCELED', isAxiosError: true }
    await expect(onResponseRejected(err)).rejects.toBeTruthy()
    expect(ElMessage.error).not.toHaveBeenCalled()
    expect(redirectToLogin).not.toHaveBeenCalled()
  })

  it('未知状态码回退到 请求失败(status) 文案', async () => {
    const err = { response: { status: 502, data: null }, message: 'bad gateway', isAxiosError: true }
    await expect(onResponseRejected(err)).rejects.toMatchObject({ code: 502, msg: '请求失败(502)' })
    expect(ElMessage.error).toHaveBeenCalledWith('请求失败(502)')
  })
})
