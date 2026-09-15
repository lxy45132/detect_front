import { reactive, ref } from 'vue'
import { fetchHandleRecords } from '@/api/handle'
import { DEFAULT_PAGE_SIZE } from '@/composables/useEventQuery'
import type { HandleRecordItem, HandleRecordQuery } from '@/types/api'
import { cleanParams } from '@/utils/params'

/**
 * 处理记录筛选表单（规格 §3.3，仅 2 项）。
 *
 * **`eventIdText` 用文本框而非 `el-input-number`** —— 一阶段结论：EP 的 `el-input-number` v-model
 * 类型是 `number | undefined`（清空时是 undefined 而非 null），与 `cleanParams` 的 null 剔除
 * 语义不匹配；且用户在输入过程中的中间态（如 `"8a"`）会被 EP 静默丢弃，反馈很差。
 * 改用文本框 + `toQuery` 内正则校验，非法输入直接不发键，用户看得到自己输错了。
 */
export interface HandleRecordFilterForm {
  /** 事件 ID 文本（`/^\d+$/` 校验通过才转 number 发出） */
  eventIdText: string
  /** 处理时间区间；value-format 已保证是后端要的 yyyy-MM-dd HH:mm:ss */
  dateRange: [string, string] | null
}

function emptyForm(): HandleRecordFilterForm {
  return {
    eventIdText: '',
    dateRange: null
  }
}

/** 严格数字校验：非负整数（`"8"` ✓ / `"0"` ✓ / `"abc"` ✗ / `"8a"` ✗ / `"-1"` ✗ / `"1.5"` ✗ / `" 8 "` ✗） */
const EVENT_ID_PATTERN = /^\d+$/

/**
 * 处理记录页的状态与编排（与 `useEventQuery`/`useTodoQuery` 同构）。
 *
 * 后端固定 `handle_time DESC, id DESC` 排序，前端不做本地排序、不接 sortable（规格 §3.3）。
 * 错误提示由拦截器统一弹，本层不重复弹。
 */
export function useHandleRecords() {
  const form = reactive<HandleRecordFilterForm>(emptyForm())
  const page = ref(1)
  const size = ref(DEFAULT_PAGE_SIZE)
  const total = ref(0)
  const rows = ref<HandleRecordItem[]>([])
  const loading = ref(false)

  /**
   * 表单 → HandleRecordQuery。
   *
   * `eventIdText` 仅当匹配 `/^\d+$/` 时转 number 发出，否则剔除 —— 避免用户误输「abc」
   * 让后端 Integer 绑定失败弹 400；也不做 trim，避免「8  」这类看起来像数字实际带空格的
   * 输入被静默通过（严格一点，让用户看清自己输了什么）。
   */
  function toQuery(): HandleRecordQuery {
    const text = form.eventIdText
    const eventId = EVENT_ID_PATTERN.test(text) ? Number(text) : null
    return cleanParams<HandleRecordQuery>({
      current: page.value,
      size: size.value,
      eventId,
      startTime: form.dateRange?.[0] ?? null,
      endTime: form.dateRange?.[1] ?? null
    })
  }

  async function load(): Promise<void> {
    loading.value = true
    try {
      const res = await fetchHandleRecords(toQuery())
      rows.value = res.records ?? []
      total.value = res.total ?? 0
    } catch {
      // 拦截器已提示；清空而非保留旧数据
      rows.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  function search(): void {
    page.value = 1
    void load()
  }

  function resetForm(): void {
    Object.assign(form, emptyForm())
    search()
  }

  function onPageChange(next: number): void {
    page.value = next
    void load()
  }

  function onSizeChange(next: number): void {
    size.value = next
    page.value = 1
    void load()
  }

  return {
    form,
    page,
    size,
    total,
    rows,
    loading,
    toQuery,
    load,
    search,
    resetForm,
    onPageChange,
    onSizeChange
  }
}
