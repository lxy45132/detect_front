/**
 * GET 查询参数清洗。
 *
 * Element Plus 的 clearable 选择器清空后值为 `''`，若原样发出 `?eventType=`
 * 会让后端 Integer 绑定失败（400）。故统一剔除空值键。
 * 注意：`0` 与 `false` 是合法筛选值（处理状态 0=未处理、优先级 0=普通），必须保留。
 *
 * 泛型 `T` 只是把「删过键的同构对象」标成调用方期望的 DTO 类型：
 * 清洗不改值只删键，出入结构一致，避免每个调用点写 `as unknown as XxxQuery`
 * （`Record<string, unknown>` 到 interface 的 `as` 会被 TS 拒，interface 无隐式索引签名）。
 */
export function cleanParams<T = Record<string, unknown>>(params: Record<string, unknown>): T {
  const result: Record<string, unknown> = {}
  if (!params) return result as T
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    if (typeof value === 'string' && value.trim() === '') continue
    result[key] = value
  }
  return result as T
}
