import axios, { type AxiosInstance, type AxiosResponse } from 'axios'
import { onRequestFulfilled, onResponseFulfilled, onResponseRejected } from '@/api/interceptors'

/**
 * 业务 axios 实例：baseURL 由环境变量给（开发期 `/api` → Vite 代理 → 网关 9999）。
 *
 * 本文件**不得** import `stores/` 或 `router/`（Global Constraints）：
 * 令牌经 `utils/token.ts` 直读 localStorage，401 走 `window.location.assign` 硬跳转，
 * 以此规避 request ↔ router 的循环依赖。
 */
export const http: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json;charset=UTF-8' }
})

http.interceptors.request.use(onRequestFulfilled)
// 响应拦截器实际返回的是拆包后的业务 data，故下面所有薄封装都把结果断言为 Promise<T>
http.interceptors.response.use(
  onResponseFulfilled as (r: AxiosResponse) => AxiosResponse,
  onResponseRejected
)

export function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  return http.get(url, { params }) as unknown as Promise<T>
}

export function post<T>(url: string, data?: unknown): Promise<T> {
  return http.post(url, data) as unknown as Promise<T>
}

export function put<T>(url: string, data?: unknown): Promise<T> {
  return http.put(url, data) as unknown as Promise<T>
}

/** DELETE 带请求体（接口文档 §4.1.6 批量删除 body `{ids:[]}`）：axios 需写在 config.data 而非第二参 */
export function del<T>(url: string, data?: unknown): Promise<T> {
  return http.delete(url, { data }) as unknown as Promise<T>
}

/** 文件流：返回原始 AxiosResponse，调用方要用 headers/type 区分文件流与 JSON 错误体（导出） */
export function getBlob(url: string, params?: Record<string, unknown>): Promise<AxiosResponse<Blob>> {
  return http.get(url, { params, responseType: 'blob' }) as unknown as Promise<AxiosResponse<Blob>>
}
