import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { ElMessage } from 'element-plus'

// vi.mock 会被提升到文件顶部执行，工厂里引用的变量必须经 vi.hoisted 一起提升，否则触发 TDZ
const { fetchTodo } = vi.hoisted(() => ({
  fetchTodo: vi.fn()
}))

vi.mock('@/api/handle', () => ({ fetchTodo }))
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }
}))

import { DEFAULT_PAGE_SIZE } from '@/composables/useEventQuery'
import { useTodoQuery } from '@/composables/useTodoQuery'
import type { PageResult, TodoItem } from '@/types/api'

function row(id: number, over: Partial<TodoItem> = {}): TodoItem {
  return {
    id,
    deviceNum: 'dev01',
    deviceName: '南河湫水闸',
    eventType: 200,
    eventTypeName: '车辆',
    task: 'license_plate',
    snapTime: '2026-09-10 08:12:33',
    snapUrl: null,
    plateNum: '浙C6B5P8',
    vehicleNormalType: null,
    crowdNum: null,
    handleStatus: 0,
    priority: 0,
    hitRuleId: 1,
    hitRuleName: '车牌黑名单',
    ...over
  }
}

function pageOf(
  records: TodoItem[],
  total = records.length,
  current = 1,
  size = DEFAULT_PAGE_SIZE
): PageResult<TodoItem> {
  return { records, total, current, size, pages: Math.max(1, Math.ceil(total / size)) }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  fetchTodo.mockResolvedValue(pageOf([]))
})

describe('useTodoQuery toQuery', () => {
  it('保留 priority=0（普通优先级是合法筛选值，不能被 cleanParams 剔除）', () => {
    const q = useTodoQuery()
    q.form.priority = 0
    q.form.eventType = null
    q.form.deviceNum = ''
    q.form.dateRange = null

    expect(q.toQuery()).toEqual({
      current: 1,
      size: DEFAULT_PAGE_SIZE,
      priority: 0
    })
  })

  it('剔除空串 deviceNum、null eventType，避免发出 ?deviceNum= 让后端绑定失败', () => {
    const q = useTodoQuery()
    q.form.deviceNum = ''
    q.form.eventType = null
    q.form.priority = null
    q.form.dateRange = null

    const query = q.toQuery()
    expect(query).not.toHaveProperty('deviceNum')
    expect(query).not.toHaveProperty('eventType')
    expect(query).not.toHaveProperty('priority')
  })

  it('dateRange 双值映射到 startTime/endTime（后端只认这两个键）', () => {
    const q = useTodoQuery()
    q.form.dateRange = ['2026-09-01 00:00:00', '2026-09-15 23:59:59']

    expect(q.toQuery()).toMatchObject({
      startTime: '2026-09-01 00:00:00',
      endTime: '2026-09-15 23:59:59'
    })
  })

  it('dateRange 为 null 时 startTime/endTime 两键都不出现', () => {
    const q = useTodoQuery()
    q.form.dateRange = null

    const query = q.toQuery()
    expect(query).not.toHaveProperty('startTime')
    expect(query).not.toHaveProperty('endTime')
  })

  it('toQuery 不包含 handleStatus（待办接口语义固定 {0,1}，规格 §3.1）', () => {
    const q = useTodoQuery()
    expect(q.toQuery()).not.toHaveProperty('handleStatus')
  })
})

describe('useTodoQuery 加载', () => {
  it('load 成功后写入 rows/total 并复位 loading', async () => {
    fetchTodo.mockResolvedValue(pageOf([row(1), row(8)], 2))
    const q = useTodoQuery()

    await q.load()

    expect(q.rows.value.map((r) => r.id)).toEqual([1, 8])
    expect(q.total.value).toBe(2)
    expect(q.loading.value).toBe(false)
  })

  it('load 期间 loading 为 true', async () => {
    let resolveFn!: (value: PageResult<TodoItem>) => void
    fetchTodo.mockReturnValue(
      new Promise<PageResult<TodoItem>>((resolve) => {
        resolveFn = resolve
      })
    )
    const q = useTodoQuery()

    const pending = q.load()
    expect(q.loading.value).toBe(true)

    resolveFn(pageOf([]))
    await pending
    expect(q.loading.value).toBe(false)
  })

  it('load 失败时清空 rows/total 且不重复弹提示（拦截器已弹）', async () => {
    fetchTodo.mockResolvedValueOnce(pageOf([row(1)], 1))
    const q = useTodoQuery()
    await q.load()

    fetchTodo.mockRejectedValueOnce(new Error('网络错误'))
    await q.load()

    expect(q.rows.value).toEqual([])
    expect(q.total.value).toBe(0)
    expect(q.loading.value).toBe(false)
    expect(ElMessage.error).not.toHaveBeenCalled()
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('search 把页码归 1 再查询，避免停在越界页看到空表', async () => {
    const q = useTodoQuery()
    q.page.value = 5

    q.search()
    await nextTick()

    expect(q.page.value).toBe(1)
    expect(fetchTodo).toHaveBeenCalledTimes(1)
    expect(fetchTodo.mock.calls[0][0]).toMatchObject({ current: 1 })
  })

  it('resetForm 恢复 4 项默认值并重载', async () => {
    const q = useTodoQuery()
    q.form.priority = 2
    q.form.eventType = 200
    q.form.deviceNum = 'dev01'
    q.form.dateRange = ['2026-09-01 00:00:00', '2026-09-02 00:00:00']
    q.page.value = 4

    q.resetForm()
    await nextTick()

    expect(q.form).toEqual({
      priority: null,
      eventType: null,
      deviceNum: '',
      dateRange: null
    })
    expect(q.page.value).toBe(1)
    expect(fetchTodo).toHaveBeenCalledWith(expect.objectContaining({ current: 1 }))
  })
})

describe('useTodoQuery 分页与勾选', () => {
  it('onPageChange 更新页码并触发 load', async () => {
    const q = useTodoQuery()

    q.onPageChange(3)
    await nextTick()

    expect(q.page.value).toBe(3)
    expect(fetchTodo).toHaveBeenCalledWith(expect.objectContaining({ current: 3 }))
  })

  it('onSizeChange 改每页容量时把页码归 1 再 load', async () => {
    const q = useTodoQuery()
    q.page.value = 3

    q.onSizeChange(50)
    await nextTick()

    expect(q.size.value).toBe(50)
    expect(q.page.value).toBe(1)
    expect(fetchTodo).toHaveBeenCalledWith(expect.objectContaining({ current: 1, size: 50 }))
  })

  it('onSelectionChange 写入选中行', () => {
    const q = useTodoQuery()

    q.onSelectionChange([row(1), row(2)])

    expect(q.selection.value.map((r) => r.id)).toEqual([1, 2])
  })
})

describe('useTodoQuery 流转后刷新', () => {
  it('reloadCurrent 保持当前页码回查（单条流转后本页可能仍在，无需回第 1 页）', async () => {
    fetchTodo.mockResolvedValue(pageOf([row(1), row(2)], 40, 2))
    const q = useTodoQuery()
    q.page.value = 2
    await q.load()
    fetchTodo.mockClear()

    await q.reloadCurrent()

    expect(q.page.value).toBe(2)
    expect(fetchTodo).toHaveBeenCalledTimes(1)
    expect(fetchTodo.mock.calls[0][0]).toMatchObject({ current: 2 })
  })

  it('reloadCurrent 不清空勾选（单条流转与勾选无关，误清会破坏后续批量意图）', async () => {
    const q = useTodoQuery()
    q.selection.value = [row(1), row(2)]
    q.page.value = 3

    await q.reloadCurrent()

    expect(q.selection.value.map((r) => r.id)).toEqual([1, 2])
  })

  it('reloadCurrent 末页仅剩 1 行流转到终态后收敛到最后合法页并重拉（避免停在空页）', async () => {
    // 第一次拉：page=5 回 0 行，total 已收缩到 80（84 -> 80，因为流转到终态的 4 行从待办消失）
    // 第二次拉：page=4 回 20 行（最后一个合法页）
    fetchTodo
      .mockResolvedValueOnce(pageOf([], 80, 5, DEFAULT_PAGE_SIZE))
      .mockResolvedValueOnce(
        pageOf(Array.from({ length: 20 }, (_, i) => row(60 + i)), 80, 4, DEFAULT_PAGE_SIZE)
      )
    const q = useTodoQuery()
    q.page.value = 5

    await q.reloadCurrent()

    expect(fetchTodo).toHaveBeenCalledTimes(2)
    expect(q.page.value).toBe(4)
    expect(fetchTodo.mock.calls[1][0]).toMatchObject({ current: 4 })
    expect(q.rows.value).toHaveLength(20)
  })

  it('reloadCurrent 首页拉空时不重拉（page=1 已是下限，避免无限循环）', async () => {
    fetchTodo.mockResolvedValueOnce(pageOf([], 0, 1, DEFAULT_PAGE_SIZE))
    const q = useTodoQuery()
    q.page.value = 1

    await q.reloadCurrent()

    expect(fetchTodo).toHaveBeenCalledTimes(1)
    expect(q.page.value).toBe(1)
  })

  it('reloadAfterBatch 清空勾选并回第 1 页（跨页流转后原页码无意义）', async () => {
    fetchTodo.mockResolvedValue(pageOf([row(1), row(2)], 40, 3))
    const q = useTodoQuery()
    q.page.value = 3
    q.selection.value = [row(1), row(2)]
    await q.load()
    fetchTodo.mockClear()

    await q.reloadAfterBatch()

    expect(q.selection.value).toEqual([])
    expect(q.page.value).toBe(1)
    expect(fetchTodo).toHaveBeenCalledTimes(1)
    expect(fetchTodo.mock.calls[0][0]).toMatchObject({ current: 1 })
  })
})
