import { HANDLE_STATUS, PRIORITY } from '@/constants/error-code'
import { useDictStore } from '@/stores/dict'
import { DASH } from '@/utils/format'

/** `el-tag` 的 type 取值（Element Plus 2.9 的 .d.ts 恰为这五个） */
export type TagType = 'info' | 'primary' | 'success' | 'warning' | 'danger'

/** 字典查不到时的中文名兜底（区别于「字段本来为空」的破折号） */
const UNKNOWN = '未知'

/** 优先级配色：纯前端视觉约定，字典只提供中文名 */
const PRIORITY_TAG: Record<number, TagType> = {
  [PRIORITY.NORMAL]: 'info',
  [PRIORITY.IMPORTANT]: 'warning',
  [PRIORITY.URGENT]: 'danger'
}

/** 处理状态配色：误报忽略与未处理同为中性灰，避免满屏红绿误导 */
const HANDLE_STATUS_TAG: Record<number, TagType> = {
  [HANDLE_STATUS.PENDING]: 'info',
  [HANDLE_STATUS.PROCESSING]: 'primary',
  [HANDLE_STATUS.RESOLVED]: 'success',
  [HANDLE_STATUS.IGNORED]: 'info'
}

/**
 * 枚举展示辅助：code → 中文名 + el-tag 配色。
 *
 * 中文名一律走 dict store（后端枚举为真源，不可达时回落静态字典）。
 * **不提供 `taskLabel`**：事件子类名直接走 `dict.labelOf('task', code)`，再包一层只是重复。
 */
export function useEnum() {
  const dict = useDictStore()

  /** 空值显示破折号；有值但字典查不到显示「未知」——两者语义不同，不能混 */
  function labelOf(kind: 'priority' | 'handleStatus', code: number | null | undefined): string {
    if (code === null || code === undefined) return DASH
    return dict.labelOf(kind, code, UNKNOWN)
  }

  function tagOf(table: Record<number, TagType>, code: number | null | undefined): TagType {
    if (code === null || code === undefined) return 'info'
    return table[code] ?? 'info'
  }

  return {
    /** 优先级中文名：0 普通 / 1 重要 / 2 紧急 */
    priorityLabel: (code: number | null | undefined): string => labelOf('priority', code),
    /** 优先级标签色：info / warning / danger */
    priorityTag: (code: number | null | undefined): TagType => tagOf(PRIORITY_TAG, code),

    /** 处理状态中文名：0 未处理 / 1 处理中 / 2 已处理 / 3 误报忽略 */
    handleStatusLabel: (code: number | null | undefined): string => labelOf('handleStatus', code),
    /** 处理状态标签色：info / primary / success / info */
    handleStatusTag: (code: number | null | undefined): TagType => tagOf(HANDLE_STATUS_TAG, code),

    /**
     * 预警推送状态（`event_records.status`）**前端硬编码**：
     * `EventEnums` 只有 eventType/task/handleStatus/priority/ruleType 五项，没有推送状态，查不到字典。
     * 口径与上面两个 label 一致：空值→破折号，有值但不在值域→「未知」。
     */
    pushStatusLabel: (code: number | null | undefined): string => {
      if (code === null || code === undefined) return DASH
      if (code === 1) return '已推送'
      if (code === 0) return '未推送'
      return UNKNOWN
    }
  }
}
