/**
 * 登录后回跳目标解析 —— 全站唯一的开放重定向（open redirect）防线。
 *
 * 放在 utils 而非登录页内部：这是安全边界逻辑，必须可单测（计划 Global Constraints
 * 也要求「可测逻辑一律下沉为纯函数」）。
 *
 * 只接受**站内绝对路径**：以单个 `/` 开头、不含 `//`、不含 `\`、不含 C0 控制符。
 * - `https://evil.com` → 不是 `/` 开头，拒
 * - `//evil.com` → 协议相对地址，浏览器会当成外站，拒
 * - `/\evil.com` → 按 WHATWG URL 解析规则，`location.assign('/\evil.com')` 会进入
 *   "special authority slashes" 状态被解析成 `http://evil.com/`，故含反斜杠一律拒
 * - `/%0A/evil.com` → vue-router 会把 `%0A` 解码成**字面换行**，而 WHATWG URL 解析会
 *   **删除输入中所有 ASCII tab / LF / CR**，于是 `'/\n/evil.com'` 被解析成 `http://evil.com/`。
 *   这条对 `router.replace` 不成立（它会把 origin 前置拼成绝对同源 URL），但对
 *   `hardNavigate` / `<a :href>` 这类直接交给浏览器的 sink 成立，故一律拒 C0 控制符与 DEL
 * - `/login...` → 自指，登录成功后再跳登录页会形成死循环，归为首页
 */
export function resolveRedirect(raw: unknown, fallback = '/event/list'): string {
  const target = Array.isArray(raw) ? raw[0] : raw
  if (typeof target !== 'string' || target === '') return fallback
  if (!target.startsWith('/') || target.startsWith('//') || target.includes('\\')) return fallback
  // C0 控制符（含 tab/LF/CR）与 DEL：URL 解析器会直接删掉它们，从而把站内路径变成外站
  if (/[\u0000-\u001F\u007F]/.test(target)) return fallback
  if (target.startsWith('/login')) return fallback
  return target
}
