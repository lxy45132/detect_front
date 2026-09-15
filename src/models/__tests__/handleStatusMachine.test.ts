import { describe, expect, it } from 'vitest'
import { HANDLE_STATUS } from '@/constants/error-code'
import {
  allowedTargets,
  allowedTargetsForAny,
  canTransition
} from '@/models/handleStatusMachine'

/**
 * 状态机矩阵（规格 §5.2）——与后端 HandleStatusEnum.canTransition 逐格一致：
 *
 * from\to   0    1    2    3
 *   0       —    ✓    ✗    ✓
 *   1       ✗    —    ✓    ✓
 *   2       ✗    ✗    —    ✗   （终态）
 *   3       ✗    ✗    ✗    —   （终态）
 *
 * 16 格用 it.each 全量锁定，任一格局改动会立即回归。
 */
describe('canTransition 16 格矩阵', () => {
  const { PENDING, PROCESSING, RESOLVED, IGNORED } = HANDLE_STATUS

  it.each([
    // from=0（未处理）：只能进入处理中或误报忽略，同状态与直接已解决均非法
    [PENDING, PENDING, false],
    [PENDING, PROCESSING, true],
    [PENDING, RESOLVED, false],
    [PENDING, IGNORED, true],
    // from=1（处理中）：可标记已解决或误报忽略；退回未处理非法
    [PROCESSING, PENDING, false],
    [PROCESSING, PROCESSING, false],
    [PROCESSING, RESOLVED, true],
    [PROCESSING, IGNORED, true],
    // from=2（已解决）：终态，任何目标都非法（含自身）
    [RESOLVED, PENDING, false],
    [RESOLVED, PROCESSING, false],
    [RESOLVED, RESOLVED, false],
    [RESOLVED, IGNORED, false],
    // from=3（误报忽略）：终态
    [IGNORED, PENDING, false],
    [IGNORED, PROCESSING, false],
    [IGNORED, RESOLVED, false],
    [IGNORED, IGNORED, false]
  ])('canTransition(%i, %i) === %s', (from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected)
  })
})

describe('canTransition 边界值', () => {
  it('from 为 null / undefined 时一律 false（新建事件无历史状态，不进矩阵）', () => {
    expect(canTransition(null, HANDLE_STATUS.PROCESSING)).toBe(false)
    expect(canTransition(undefined, HANDLE_STATUS.PROCESSING)).toBe(false)
  })

  it('to 为 null / undefined 时一律 false（未选目标态即提交应被拦下）', () => {
    expect(canTransition(HANDLE_STATUS.PENDING, null)).toBe(false)
    expect(canTransition(HANDLE_STATUS.PENDING, undefined)).toBe(false)
  })

  it('from / to 为越界 code（负数、超范围）时一律 false', () => {
    expect(canTransition(-1, HANDLE_STATUS.PROCESSING)).toBe(false)
    expect(canTransition(HANDLE_STATUS.PENDING, 99)).toBe(false)
    expect(canTransition(99, 99)).toBe(false)
  })

  it('from / to 同时为 null / undefined 时 false', () => {
    expect(canTransition(null, null)).toBe(false)
    expect(canTransition(undefined, undefined)).toBe(false)
  })
})

describe('allowedTargets', () => {
  it('未处理(0) → [处理中(1), 误报忽略(3)]', () => {
    expect(allowedTargets(HANDLE_STATUS.PENDING)).toEqual([
      HANDLE_STATUS.PROCESSING,
      HANDLE_STATUS.IGNORED
    ])
  })

  it('处理中(1) → [已解决(2), 误报忽略(3)]', () => {
    expect(allowedTargets(HANDLE_STATUS.PROCESSING)).toEqual([
      HANDLE_STATUS.RESOLVED,
      HANDLE_STATUS.IGNORED
    ])
  })

  it('已解决(2) 为终态 → []', () => {
    expect(allowedTargets(HANDLE_STATUS.RESOLVED)).toEqual([])
  })

  it('误报忽略(3) 为终态 → []', () => {
    expect(allowedTargets(HANDLE_STATUS.IGNORED)).toEqual([])
  })

  it('null / undefined / 越界 code → []（不抛异常）', () => {
    expect(allowedTargets(null)).toEqual([])
    expect(allowedTargets(undefined)).toEqual([])
    expect(allowedTargets(99)).toEqual([])
    expect(allowedTargets(-1)).toEqual([])
  })
})

describe('allowedTargetsForAny（批量并集去重）', () => {
  it('混合 [0, 1] → [1, 2, 3]（并集去重，升序）', () => {
    expect(
      allowedTargetsForAny([HANDLE_STATUS.PENDING, HANDLE_STATUS.PROCESSING])
    ).toEqual([
      HANDLE_STATUS.PROCESSING,
      HANDLE_STATUS.RESOLVED,
      HANDLE_STATUS.IGNORED
    ])
  })

  it('全为终态 [2, 3] → []', () => {
    expect(
      allowedTargetsForAny([HANDLE_STATUS.RESOLVED, HANDLE_STATUS.IGNORED])
    ).toEqual([])
  })

  it('空集 → []（未勾选任何行时按钮全禁用）', () => {
    expect(allowedTargetsForAny([])).toEqual([])
  })

  it('单元素 [0] 等价于 allowedTargets(0)', () => {
    expect(allowedTargetsForAny([HANDLE_STATUS.PENDING])).toEqual(
      allowedTargets(HANDLE_STATUS.PENDING)
    )
  })

  it('重复元素 [1, 1, 2] 去重后等价于 [1, 2]', () => {
    expect(
      allowedTargetsForAny([
        HANDLE_STATUS.PROCESSING,
        HANDLE_STATUS.PROCESSING,
        HANDLE_STATUS.RESOLVED
      ])
    ).toEqual(allowedTargetsForAny([HANDLE_STATUS.PROCESSING, HANDLE_STATUS.RESOLVED]))
  })

  it('含 null / undefined / 越界 code 时安全忽略', () => {
    expect(
      allowedTargetsForAny([
        HANDLE_STATUS.PENDING,
        null as unknown as number,
        undefined as unknown as number,
        99
      ])
    ).toEqual(allowedTargets(HANDLE_STATUS.PENDING))
  })
})
