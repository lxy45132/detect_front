/**
 * 登录后回跳目标解析 —— 全站唯一的开放重定向（open redirect）防线。
 *
 * 放在 utils 而非登录页内部：这是安全边界逻辑，必须可单测（计划 Global Constraints
 * 也要求「可测逻辑一律下沉为纯函数」）。
 *
 * 只接受**站内绝对路径**：以单个 `/` 开头、不含 `//`、不含 `\`。
 * - `https://evil.com` → 不是 `/` 开头，拒
 * - `//evil.com` → 协议相对地址，浏览器会当成外站，拒
 * - `/\evil.com` → 按 WHATWG URL 解析规则，`location.assign('/\evil.com')` 会进入
 *   "special authority slashes" 状态被解析成 `http://evil.com/`，故含反斜杠一律拒
 * - `/login...` → 自指，登录成功后再跳登录页会形成死循环，归为首页
 */
export function resolveRedirect(raw: unknown, fallback = '/event/list'): string {
  const target = Array.isArray(raw) ? raw[0] : raw
  if (typeof target !== 'string' || target === '') return fallback
  if (!target.startsWith('/') || target.startsWith('//') || target.includes('\\')) return fallback
  if (target.startsWith('/login')) return fallback
  return target
}
