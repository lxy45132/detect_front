import axios from 'axios'
import { API_BASE, AUTH_BASE } from '@/api/base-url'
import type { TokenErrorResponse, TokenResponse } from '@/types/api'

/**
 * 用户名/密码换 JWT（detect-auth `POST /oauth/token`，经网关 `/auth/oauth/token`）。
 *
 * 关键：后端 `OAuth2Controller.token` 用 `@RequestParam` 接收 username/password/grant_type/scope，
 * **必须**以 `application/x-www-form-urlencoded` 提交；发 JSON 会得到
 * 400 "Required request parameter 'username' is not present"。
 * `grant_type` 与 `scope` 在后端均为 `required = false`（scope 会原样回显），按接口约定一并带上。
 *
 * 刻意使用裸 axios 而非业务实例：失败路径不同。登录失败是 HTTP 400 +
 * `{error:"invalid_grant", error_description:"用户名或密码错误"}`，走业务拦截器会先弹
 * `ERROR_MESSAGES[400]='参数错误'` 并把 `error_description` 吞掉，用户就看不到真实原因；
 * 且该端点成功响应是 OAuth2 扁平结构而非 `R<T>` 包装，不适用拆包语义。
 */
export async function login(username: string, password: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    username,
    password,
    grant_type: 'password',
    scope: 'server'
  })

  try {
    const res = await axios.post<TokenResponse>(`${API_BASE}${AUTH_BASE}/oauth/token`, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000
    })
    return res.data
  } catch (error) {
    throw new Error(extractLoginErrorMessage(error))
  }
}

/** 从登录异常中提取可展示文案：优先 error_description，其次 HTTP 状态，最后网络提示 */
function extractLoginErrorMessage(error: unknown): string {
  const err = error as {
    response?: { status?: number; data?: TokenErrorResponse | null }
    message?: string
  }
  // error_description 是给人看的中文；error 是 invalid_grant 这类机器码，不能直接展示
  const description = err?.response?.data?.error_description
  if (description) return description

  const status = err?.response?.status
  if (status === 400) return '用户名或密码错误'
  if (status === 404) return '认证端点不存在，请检查网关路由 /auth/** 是否生效'
  if (status) return `登录失败(HTTP ${status})`

  return '无法连接认证服务，请确认 detect-gateway(9999) 与 detect-auth(8081) 已启动'
}
