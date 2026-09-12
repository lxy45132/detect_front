import { computed, reactive, ref } from 'vue'
import { batchDeleteEvents, deleteEvent, exportEvents, pageEvents } from '@/api/event'
import { useDictStore } from '@/stores/dict'
import type { EventQuery, EventRecordItem, TaskItem } from '@/types/api'
import { cleanParams } from '@/utils/params'

/** 事件列表筛选表单：8 项业务条件（含日期区间的双值模型） */
export interface EventFilterForm {
  deviceNum: string
  eventType: number | null
  task: string | null
  handleStatus: number | null
  priority: number | null
  plateNum: string
  keyword: string
  /** el-date-picker type=datetimerange 的模型；value-format 已保证是后端要的 yyyy-MM-dd HH:mm:ss */
  dateRange: [string, string] | null
}

/** 与后端 EventQueryDTO 的默认 size 保持一致（后端上限 200） */
export const DEFAULT_PAGE_SIZE = 20

function emptyForm(): EventFilterForm {
  return {
    deviceNum: '',
    eventType: null,
    task: null,
    handleStatus: null,
    priority: null,
    plateNum: '',
    keyword: '',
    dateRange: null
  }
}

/**
 * 事件列表页的状态与编排。
 *
 * 把「表单 → 查询对象 → 分页 → 加载 → 删改后回查」收在这里，list.vue 只负责渲染与成功提示：
 * 一是这段逻辑分支多（0 值保留、子类联动、末页删空回退）值得单测，二是避免 SFC 里堆两百行脚本。
 *
 * 错误提示一律不在这一层弹 —— axios 响应拦截器（Task 3）已对 code≠0 与 HTTP 错误统一
 * `ElMessage.error`，这里再弹会出现两条相同的红色提示。函数只返回 boolean 表示成败，
 * 由视图决定成功文案。
 */
export function useEventQuery() {
  const dict = useDictStore()

  const form = reactive<EventFilterForm>(emptyForm())
  const page = ref(1)
  const size = ref(DEFAULT_PAGE_SIZE)
  const total = ref(0)
  const rows = ref<EventRecordItem[]>([])
  const selection = ref<EventRecordItem[]>([])
  const loading = ref(false)
  const exporting = ref(false)

  /** 子类下拉随大类联动；大类未选时给全量 */
  const taskOptions = computed<TaskItem[]>(() => dict.tasksOfEventType(form.eventType))

  /**
   * 表单 → EventQuery。
   *
   * cleanParams 剔除空串与 null：clearable 清空后 Element Plus 给的是 `''`，
   * 原样发出 `?eventType=` 会让后端 Integer 绑定失败（400）；
   * 但 `0` 会保留 —— handleStatus=0（未处理）、priority=0（普通）都是合法筛选值。
   * `withPaging=false` 用于导出：导出要当前条件下的全量，带分页语义混乱。
   */
  function toQuery(withPaging = true): EventQuery {
    return cleanParams<EventQuery>({
      ...(withPaging ? { current: page.value, size: size.value } : {}),
      deviceNum: form.deviceNum,
      eventType: form.eventType,
      task: form.task,
      handleStatus: form.handleStatus,
      priority: form.priority,
      plateNum: form.plateNum,
      keyword: form.keyword,
      startTime: form.dateRange?.[0] ?? null,
      endTime: form.dateRange?.[1] ?? null
    })
  }

  async function load(): Promise<void> {
    loading.value = true
    try {
      const res = await pageEvents(toQuery())
      rows.value = res.records ?? []
      total.value = res.total ?? 0
    } catch {
      // 拦截器已提示。清空而非保留旧数据：留着会让人误以为「这就是筛出来的结果」
      rows.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  /** 筛选条件变了必须回第 1 页，否则会停在越界页看到空表 */
  function search(): void {
    page.value = 1
    void load()
  }

  function resetForm(): void {
    Object.assign(form, emptyForm())
    search()
  }

  /** 大类变更后原子类多半不属于新大类，直接清空，避免矛盾条件查出空结果 */
  function onEventTypeChange(): void {
    form.task = null
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

  function onSelectionChange(next: EventRecordItem[]): void {
    selection.value = next
  }

  /**
   * 删单条：成功后回查当前页。
   *
   * 回查而非本地摘行 —— 本地摘行会让 `total` 与后端逐渐漂移（并发删除、他人新增都看不到），
   * 而一次分页请求的代价远小于「表格数字与库不一致」的排查成本。
   * 但若删的是「非第 1 页的最后一条」，本页已空，必须先回退一页再查，否则停在空白页。
   */
  async function removeOne(id: number): Promise<boolean> {
    try {
      await deleteEvent(id)
    } catch {
      return false
    }
    if (rows.value.length <= 1 && page.value > 1) {
      page.value -= 1
    }
    await load()
    return true
  }

  /** 批量删除：后端返 `{deleted}`；成功即清空选中并回第 1 页（跨页删除后原页码无意义） */
  async function removeMany(ids: number[]): Promise<boolean> {
    if (ids.length === 0) return false
    try {
      await batchDeleteEvents(ids)
    } catch {
      return false
    }
    selection.value = []
    page.value = 1
    await load()
    return true
  }

  /** 导出当前筛选条件下的全量。exportEvents 内部已处理 4001 超限提示、文件名与落盘 */
  async function exportAs(format: 'xlsx' | 'csv'): Promise<boolean> {
    exporting.value = true
    try {
      await exportEvents(toQuery(false), format)
      return true
    } catch {
      return false
    } finally {
      exporting.value = false
    }
  }

  return {
    form,
    page,
    size,
    total,
    rows,
    selection,
    loading,
    exporting,
    taskOptions,
    toQuery,
    load,
    search,
    resetForm,
    onEventTypeChange,
    onPageChange,
    onSizeChange,
    onSelectionChange,
    removeOne,
    removeMany,
    exportAs
  }
}
