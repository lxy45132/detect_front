/** 空值占位符（表格 / 描述列表中统一使用，避免大片空白） */
export const DASH = '—'

/** 判空：null/undefined/纯空白字符串视为空；数字 0 与 false 是有效值 */
function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true
  return typeof v === 'string' && v.trim() === ''
}

/** 空值转破折号，其余原样转字符串 */
export function dash(v: unknown): string {
  return isBlank(v) ? DASH : String(v)
}

/** 字符串空值回退，默认回退到破折号 */
export function textOr(v: string | null | undefined, fallback = DASH): string {
  return isBlank(v) ? fallback : (v as string)
}

/**
 * 比率（0~1）转百分比字符串，默认两位小数。
 * NaN / 非数字一律回退 0 —— 看板 `total === 0` 时占比不得显示 `NaN%`。
 */
export function percent(rate: number, digits = 2): string {
  const n = typeof rate === 'number' && !Number.isNaN(rate) ? rate : 0
  return `${(n * 100).toFixed(digits)}%`
}
