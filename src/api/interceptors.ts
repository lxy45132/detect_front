import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import { ERROR_MESSAGES, LOCAL_ERROR_CODE, SUCCESS_CODE } from '@/constants/error-code'
import type { R } from '@/types/api'
import { redirectToLogin } from '@/utils/navigate'
import { cleanParams } from '@/utils/params'
import { getToken } from '@/utils/token'

/** 业务异常：携带后端 code，调用方可据此做分支（如 1001 关闭详情抽屉） */
export class BizError extends Error {
  readonly code: number
  readonly msg: string

  constructor(code: number, msg: string) {
    super(msg)
    this.name = 'BizError'
    this.code = code
    this.msg = msg
  }
}

/**
 * 错误文案归口：后端 msg → 错误码表 → 通用兜底。
 * 弹窗与抛错共用同一函数，否则两处一旦漂移就会出现「弹的文案 ≠ 抛的 msg」。
 */
function resolveMessage(code: number, msg?: string): string {
  return msg || ERROR_MESSAGES[code] || `请求失败(${code})`
}

/**
 * 请求拦截：注入 Bearer + 清洗空值参数。
 *
 * 无令牌时**不加** Authorization 头 —— 登录接口本身不带令牌，
 * 加一个空头会让网关的 JWT 解析走进「令牌存在但非法」分支。
 */
export function onRequestFulfilled(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const token = getToken()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  if (config.params && typeof config.params === 'object') {
    config.params = cleanParams(config.params as Record<string, unknown>)
  }
  return config
}

/**
 * 响应拦截：
 * - blob（导出文件流）原样透传整个 response，调用方要看 headers 判断是否为 JSON 错误体
 * - code=0 拆包直返 data，业务代码不再层层 `.data`
 * - code≠0 提示后端 msg 并抛 BizError
 *
 * 非 R 包装的响应体原样返回（理论上不会出现，但不能吞数据）。
 */
export function onResponseFulfilled(response: AxiosResponse): unknown {
  if (response.config.responseType === 'blob') {
    return response
  }
  const body = response.data as R<unknown> | undefined
  if (!body || typeof body.code !== 'number') {
    return response.data
  }
  if (body.code === SUCCESS_CODE) {
    return body.data
  }
  const text = resolveMessage(body.code, body.msg)
  ElMessage.error(text)
  throw new BizError(body.code, text)
}

/**
 * 异常拦截：401 清凭据硬跳登录，其余按状态码兜底提示。
 *
 * 401 **刻意不弹提示** —— 整页跳转前弹的消息随页面一起消失，只是干扰；
 * 后端 `DetectAuthenticationEntryPoint` 返真 HTTP 401，故只需判状态码，不必再看 body 里的 code。
 * 主动取消的请求（切页/重复查询）静默处理，不打扰用户。
 */
export async function onResponseRejected(error: unknown): Promise<never> {
  const err = error as { code?: string; message?: string }

  if (err?.code === 'ERR_CANCELED') {
    throw new BizError(LOCAL_ERROR_CODE.CANCELED, 'canceled')
  }

  // status 与 body 走同一条守卫路径，避开「status 判了 isAxiosError、body 没判」的分叉
  const axiosError = axios.isAxiosError(error) ? error : undefined
  const status = axiosError?.response?.status
  const body = axiosError?.response?.data as R<unknown> | null | undefined

  if (status === 401) {
    redirectToLogin()
    throw new BizError(401, resolveMessage(401, body?.msg))
  }

  if (status) {
    const msg = resolveMessage(status, body?.msg)
    ElMessage.error(msg)
    throw new BizError(status, msg)
  }

  ElMessage.error('网络异常，请检查后端服务是否已启动')
  throw new BizError(LOCAL_ERROR_CODE.NETWORK, err?.message || '网络异常')
}
