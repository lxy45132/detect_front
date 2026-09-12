/**
 * 后端路径前缀常量，集中一处便于网关调整。
 *
 * 链路（设计规格 §3.1）：
 *   浏览器 `/api/admin/event/event-records/page`
 *     → Vite 代理剥 `/api` → 网关 `:9999/admin/event/event-records/page`
 *       → 网关 StripPrefix=2 → detect-event `/event-records/page`
 */

/** 业务 axios 实例的 baseURL（与 request.ts 同源），供裸 axios 调用（登录）复用 */
export const API_BASE: string = import.meta.env.VITE_API_BASE || '/api'

/** 认证服务前缀：网关路由 `/auth/**` → StripPrefix=1 → detect-auth */
export const AUTH_BASE = '/auth'

/** 事件服务前缀：网关路由 `/admin/event/**` → StripPrefix=2 → detect-event */
export const EVENT_BASE = '/admin/event'
