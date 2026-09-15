import { reactive, ref } from 'vue'
import { fetchTodo } from '@/api/handle'
import { DEFAULT_PAGE_SIZE } from '@/composables/useEventQuery'
import type { TodoItem, TodoQuery } from '@/types/api'
import { cleanParams } from '@/utils/params'

/**
 * 预警待办筛选表单：4 项业务条件（规格 §3.1）。
 *
 * **不含 handleStatus** —— 待办接口语义固定 `{0, 1}`，暴露该筛选只会误导用户。
 * 与 `EventFilterForm` 相比无 plateNum / keyword / task，也无导出与子类联动。
 */
export interface TodoFilterForm {
  /** 优先级 0/1/2 */
  priority: number | null
  /** 事件大类 100/200/300 */
  eventType: number | null
  /** 设备编号（精确匹配） */
  deviceNum: string
  /** 抓拍时间区间；value-format 已保证是后端要的 yyyy-MM-dd HH:mm:ss */
  dateRange: [string, string] | null
}

function emptyForm(): TodoFilterForm {
  return {
    priority: null,
    eventType: null,
    deviceNum: '',
    dateRange: null
  }
}

/**
 * 预警待办页的状态与编排（与 `useEventQuery` 同构，只保留待办用得着的分支）。
 *
 * 错误提示一律不在这一层弹 —— axios 拦截器（一阶段 Task 3）已对 code≠0 与 HTTP 错误统一提示，
 * 这里再弹会出现两条相同的红提示。函数只返 boolean / 直接刷新，由视图决定成功文案。
 *
 * 流转后的刷新语义拆两个具名方法：
 * - `reloadCurrent()`：单条流转 —— 保页码回查（本页可能仍有其他行，跨页跳走无意义）
 * - `reloadAfterBatch()`：批量流转 —— 清勾选 + 回第 1 页（跨页流转后原页码无意义，
 *   同一阶段 `removeMany` 的理由）
 */
export function useTodoQuery() {
  const form = reactive<TodoFilterForm>(emptyForm())
  const page = ref(1)
  const size = ref(DEFAULT_PAGE_SIZE)
  const total = ref(0)
  const rows = ref<TodoItem[]>([])
  const selection = ref<TodoItem[]>([])
  const loading = ref(false)

  /**
   * 表单 → TodoQuery。
   *
   * `cleanParams` 剔除 `''` 与 null，但保留 `0` —— priority=0（普通）是合法筛选值，
   * 与 handleStatus=0（未处理）同理。
   */
  function toQuery(): TodoQuery {
    return cleanParams<TodoQuery>({
      current: page.value,
      size: size.value,
      priority: form.priority,
      eventType: form.eventType,
      deviceNum: form.deviceNum,
      startTime: form.dateRange?.[0] ?? null,
      endTime: form.dateRange?.[1] ?? null
    })
  }

  async function load(): Promise<void> {
    loading.value = true
    try {
      const res = await fetchTodo(toQuery())
      rows.value = res.records ?? []
      total.value = res.total ?? 0
    } catch {
      // 拦截器已提示；清空而非保留旧数据，避免让人误以为「这就是筛出来的结果」
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

  function onPageChange(next: number): void {
    page.value = next
    void load()
  }

  function onSizeChange(next: number): void {
    size.value = next
    page.value = 1
    void load()
  }

  function onSelectionChange(next: TodoItem[]): void {
    selection.value = next
  }

  /**
   * 单条流转后回查当前页：保页码 + 保勾选。
   *
   * 保页码 —— 用户从第 N 页点的按钮，回查后仍应在第 N 页看剩余行（本页可能因流转少 1 行，
   * 也可能行数不变，例如「未处理 → 处理中」的行仍留在待办列表）。
   * 保勾选 —— 单条流转与勾选无关，误清会破坏用户后续的批量意图。
   *
   * **末页收敛**：若流转到终态（2/3）且本页只剩这 1 行，回查后 rows 为空、page 越界，
   * 同一阶段 `removeOne` 的理由 —— 根据新 total 收敛到最后一个合法页后重拉，避免停在空页。
   * 代价：末页删空的罕见场景多一次分页请求，换来不靠 EP 分页内部 clamp 自愈的确定性。
   */
  async function reloadCurrent(): Promise<void> {
    await load()
    if (rows.value.length === 0 && page.value > 1) {
      page.value = Math.max(1, Math.ceil(total.value / size.value))
      await load()
    }
  }

  /**
   * 批量流转后回查：清勾选 + 回第 1 页。
   *
   * 跨页流转后原页码无意义 —— 用户勾了跨越多页的行，其中一部分已流转到终态从待办消失，
   * 原页码可能已越界；回第 1 页让用户从最新的紧急置顶开始看。
   */
  async function reloadAfterBatch(): Promise<void> {
    selection.value = []
    page.value = 1
    await load()
  }

  return {
    form,
    page,
    size,
    total,
    rows,
    selection,
    loading,
    toQuery,
    load,
    search,
    resetForm,
    onPageChange,
    onSizeChange,
    onSelectionChange,
    reloadCurrent,
    reloadAfterBatch
  }
}
