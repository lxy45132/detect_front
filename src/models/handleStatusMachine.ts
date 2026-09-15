import { HANDLE_STATUS } from '@/constants/error-code'

/**
 * 预警处理状态机前端副本（规格 §5.2）。
 *
 * 与后端 `HandleStatusEnum.canTransition` 逐格一致；**流转合法性以后端为准**（前端绕过也只会
 * 在后端撞 `3001`），本模块只用于按钮显隐/禁用与批量预检提示，避免用户点了才被后端拒。
 *
 * 矩阵：
 * ```
 * from\to   0    1    2    3
 *   0       —    ✓    ✗    ✓
 *   1       ✗    —    ✓    ✓
 *   2       ✗    ✗    —    ✗   （终态）
 *   3       ✗    ✗    ✗    —   （终态）
 * ```
 *
 * 表驱动而非硬编码分支：新增状态时只改这一处，配合 it.each 全量矩阵测试立即回归。
 */
const TRANSITIONS: Record<number, readonly number[]> = {
  [HANDLE_STATUS.PENDING]: [HANDLE_STATUS.PROCESSING, HANDLE_STATUS.IGNORED],
  [HANDLE_STATUS.PROCESSING]: [HANDLE_STATUS.RESOLVED, HANDLE_STATUS.IGNORED],
  // 终态显式列空数组而非省略键：让「哪些 code 在值域内」一目了然，
  // 也让 allowedTargets 的实现在终态与越界 code 之间语义无歧义（都走 ?? [] 兜底）。
  [HANDLE_STATUS.RESOLVED]: [],
  [HANDLE_STATUS.IGNORED]: []
}

/** 判定入参是否为合法的处理状态 code（区分「越界」与「终态」的语义边界） */
function isValidStatus(code: number | null | undefined): code is number {
  return typeof code === 'number' && code in TRANSITIONS
}

/**
 * 单格判定：`from` → `to` 是否为合法流转。
 *
 * 一律 false 的场景：null / undefined / 越界 code / 同状态 / 终态出边。
 * 同状态列 false 而非 true：从后端语义看，「未处理 → 未处理」不构成状态变化，
 * 记入 `alert_handle_record` 只是无效留痕；前端也不应给用户展示这个按钮。
 */
export function canTransition(
  from: number | null | undefined,
  to: number | null | undefined
): boolean {
  if (!isValidStatus(from) || !isValidStatus(to)) return false
  if (from === to) return false
  return TRANSITIONS[from].includes(to)
}

/**
 * 从 `from` 出发的所有合法目标（升序，取自 TRANSITIONS 表值）。
 *
 * 越界 / null / undefined / 终态一律返回空数组，视图侧据此隐藏按钮而不必再判空。
 */
export function allowedTargets(from: number | null | undefined): number[] {
  if (!isValidStatus(from)) return []
  return [...TRANSITIONS[from]]
}

/**
 * 批量场景的并集：只要**任意一行**允许流转到该目标，按钮即可选（规格 §3.2）。
 *
 * 非法行进后端 `skipped` 明细回显，前端仅提示不拦截 —— 后端仍是权威。
 * 输入含 null / undefined / 越界 code 时安全忽略（不抛异常）。
 */
export function allowedTargetsForAny(fromStatuses: readonly number[]): number[] {
  const union = new Set<number>()
  for (const status of fromStatuses) {
    for (const target of allowedTargets(status)) {
      union.add(target)
    }
  }
  // 升序输出，配合 it.each 断言稳定
  return [...union].sort((a, b) => a - b)
}
