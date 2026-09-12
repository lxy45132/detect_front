import { defineStore } from 'pinia'
import { fetchEventEnums } from '@/api/dict'
import { FALLBACK_ENUMS } from '@/constants/dict'
import type { EnumItem, EventEnums, TaskItem } from '@/types/api'
import { DASH } from '@/utils/format'

/** 字典类别键 */
export type DictKind = keyof EventEnums

interface DictState {
  enums: EventEnums | null
  loaded: boolean
  /**
   * in-flight promise，用于并发去重。
   *
   * 放进 state 而非模块级变量：store 是单例，state 天然跟随 `reset()` 与热更新。
   * Vue 的 `reactive` 对 Promise 判定为非可代理类型（targetType = INVALID），原样返回不加 Proxy，
   * 故存进 state 是安全的。刻意不用 `declare module 'pinia'` 扩类型 —— 那会让
   * `storeToRefs` 与测试里的类型推导出现偏差，还多一处全局声明污染。
   */
  pending: Promise<void> | null
}

/**
 * 枚举字典缓存（接口文档 §4.5.3）。
 *
 * 登录后调一次 `/event-categories/enums`，全站下拉选项与 code → 中文名翻译共用；
 * in-flight promise 去重，避免多组件同时挂载导致的并发重复请求。
 * 字典是展示辅助：加载失败回落静态字典并标记 loaded，不阻塞页面、不反复重试。
 */
export const useDictStore = defineStore('dict', {
  state: (): DictState => ({ enums: null, loaded: false, pending: null }),

  getters: {
    /** 事件大类下拉选项（未加载时给静态兜底，保证筛选区不空白） */
    eventTypeOptions: (s): EnumItem[] => s.enums?.eventType ?? FALLBACK_ENUMS.eventType,
    /** 处理状态下拉选项 */
    handleStatusOptions: (s): EnumItem[] => s.enums?.handleStatus ?? FALLBACK_ENUMS.handleStatus,
    /** 优先级下拉选项 */
    priorityOptions: (s): EnumItem[] => s.enums?.priority ?? FALLBACK_ENUMS.priority
  },

  actions: {
    /** 加载字典。默认命中缓存不再请求；`force=true` 强制刷新 */
    async load(force = false): Promise<void> {
      if (this.loaded && !force) return
      // 取到局部常量再判空：避免 TS 对 `this.pending` 跨行窄化失效
      const inflight = this.pending
      if (inflight && !force) return inflight

      this.pending = (async () => {
        try {
          this.enums = await fetchEventEnums()
        } catch {
          this.enums = FALLBACK_ENUMS
        } finally {
          this.loaded = true
          this.pending = null
        }
      })()
      return this.pending
    },

    /**
     * code → 中文名。
     *
     * 统一 `String(item.code) === String(code)`：eventType/handleStatus/priority 的 code 是
     * number，task/ruleType 的 code 是 string（Global Constraints），字符串化才能共用一套查表。
     * 未命中时回退 fallback，无 fallback 则回退 code 字面量（便于发现字典缺项）。
     */
    labelOf(kind: DictKind, code: number | string | null | undefined, fallback?: string): string {
      if (code === null || code === undefined || code === '') {
        return fallback ?? DASH
      }
      const source = this.enums ?? FALLBACK_ENUMS
      const items = source[kind] as (EnumItem | TaskItem)[]
      const hit = items.find((item) => String(item.code) === String(code))
      return hit?.name ?? fallback ?? String(code)
    },

    /** 事件子类按大类联动过滤；不传或传 null 返全量 */
    tasksOfEventType(eventType?: number | null): TaskItem[] {
      const source = this.enums ?? FALLBACK_ENUMS
      if (eventType === undefined || eventType === null) return source.task
      return source.task.filter((item) => item.eventType === eventType)
    },

    /**
     * 退出登录时清空，避免切换账号后残留。
     * `pending` 必须一并归零，否则重新登录会复用上一次的 in-flight promise。
     */
    reset(): void {
      this.enums = null
      this.loaded = false
      this.pending = null
    }
  }
})
