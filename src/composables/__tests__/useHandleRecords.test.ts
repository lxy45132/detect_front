import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { ElMessage } from 'element-plus'

const { fetchHandleRecords } = vi.hoisted(() => ({
  fetchHandleRecords: vi.fn()
}))

vi.mock('@/api/handle', () => ({ fetchHandleRecords }))
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }
}))

import { DEFAULT_PAGE_SIZE } from '@/composables/useEventQuery'
import { useHandleRecords } from '@/composables/useHandleRecords'
import type { HandleRecordItem, PageResult } from '@/types/api'

function row(id: number, over: Partial<HandleRecordItem> = {}): HandleRecordItem {
  return {
    id,
    eventId: 8,
    fromStatus: 0,
    toStatus: 1,
    handlerName: 'admin',
    handleRemark: '正在核查',
    handleTime: '2026-09-15 10:30:00',
    ...over
  }
}

function pageOf(
  records: HandleRecordItem[],
  total = records.length,
  current = 1,
  size = DEFAULT_PAGE_SIZE
): PageResult<HandleRecordItem> {
  return { records, total, current, size, pages: Math.max(1, Math.ceil(total / size)) }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  fetchHandleRecords.mockResolvedValue(pageOf([]))
})

describe('useHandleRecords toQuery（事件 ID 文本校验）', () => {
  it('合法数字字符串转 number 发出（"8" → 8）', () => {
    const q = useHandleRecords()
    q.form.eventIdText = '8'
    q.form.dateRange = null

    expect(q.toQuery()).toMatchObject({
      current: 1,
      size: DEFAULT_PAGE_SIZE,
      eventId: 8
    })
  })

  it('大数字字符串也转 number（"123456" → 123456）', () => {
    const q = useHandleRecords()
    q.form.eventIdText = '123456'

    expect(q.toQuery()).toMatchObject({ eventId: 123456 })
  })

  it('非数字字符串剔除（"abc" 不发 eventId 键，绕开 el-input-number v-model 类型坑）', () => {
    const q = useHandleRecords()
    q.form.eventIdText = 'abc'
    q.form.dateRange = null

    const query = q.toQuery()
    expect(query).not.toHaveProperty('eventId')
  })

  it('混合字符串剔除（"8a" 不发键，避免部分匹配误查）', () => {
    const q = useHandleRecords()
    q.form.eventIdText = '8a'
    q.form.dateRange = null

    expect(q.toQuery()).not.toHaveProperty('eventId')
  })

  it('带空格字符串剔除（"  8  " 不发键；trim 会引入歧义，直接严格要求纯数字）', () => {
    const q = useHandleRecords()
    q.form.eventIdText = '  8  '
    q.form.dateRange = null

    expect(q.toQuery()).not.toHaveProperty('eventId')
  })

  it('空串剔除', () => {
    const q = useHandleRecords()
    q.form.eventIdText = ''
    q.form.dateRange = null

    expect(q.toQuery()).not.toHaveProperty('eventId')
  })

  it('负号剔除（"-1" 不发键；事件 ID 恒为正整数）', () => {
    const q = useHandleRecords()
    q.form.eventIdText = '-1'
    q.form.dateRange = null

    expect(q.toQuery()).not.toHaveProperty('eventId')
  })

  it('小数剔除（"1.5" 不发键）', () => {
    const q = useHandleRecords()
    q.form.eventIdText = '1.5'
    q.form.dateRange = null

    expect(q.toQuery()).not.toHaveProperty('eventId')
  })

  it('"0" 保留（虽不常见但符合 /^\\d+$/ 语义，由后端判定存在性）', () => {
    const q = useHandleRecords()
    q.form.eventIdText = '0'
    q.form.dateRange = null

    expect(q.toQuery()).toMatchObject({ eventId: 0 })
  })

  it('dateRange 双值映射到 startTime/endTime', () => {
    const q = useHandleRecords()
    q.form.dateRange = ['2026-09-01 00:00:00', '2026-09-15 23:59:59']

    expect(q.toQuery()).toMatchObject({
      startTime: '2026-09-01 00:00:00',
      endTime: '2026-09-15 23:59:59'
    })
  })

  it('dateRange 为 null 时 startTime/endTime 两键都不出现', () => {
    const q = useHandleRecords()
    q.form.dateRange = null

    const query = q.toQuery()
    expect(query).not.toHaveProperty('startTime')
    expect(query).not.toHaveProperty('endTime')
  })
})

describe('useHandleRecords 加载', () => {
  it('load 成功后写入 rows/total 并复位 loading', async () => {
    fetchHandleRecords.mockResolvedValue(pageOf([row(1), row(2)], 2))
    const q = useHandleRecords()

    await q.load()

    expect(q.rows.value.map((r) => r.id)).toEqual([1, 2])
    expect(q.total.value).toBe(2)
    expect(q.loading.value).toBe(false)
  })

  it('load 期间 loading 为 true', async () => {
    let resolveFn!: (value: PageResult<HandleRecordItem>) => void
    fetchHandleRecords.mockReturnValue(
      new Promise<PageResult<HandleRecordItem>>((resolve) => {
        resolveFn = resolve
      })
    )
    const q = useHandleRecords()

    const pending = q.load()
    expect(q.loading.value).toBe(true)

    resolveFn(pageOf([]))
    await pending
    expect(q.loading.value).toBe(false)
  })

  it('load 失败时清空 rows/total 且不重复弹提示（拦截器已弹）', async () => {
    fetchHandleRecords.mockResolvedValueOnce(pageOf([row(1)], 1))
    const q = useHandleRecords()
    await q.load()

    fetchHandleRecords.mockRejectedValueOnce(new Error('网络错误'))
    await q.load()

    expect(q.rows.value).toEqual([])
    expect(q.total.value).toBe(0)
    expect(q.loading.value).toBe(false)
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('search 把页码归 1 再查询', async () => {
    const q = useHandleRecords()
    q.page.value = 5

    q.search()
    await nextTick()

    expect(q.page.value).toBe(1)
    expect(fetchHandleRecords).toHaveBeenCalledTimes(1)
    expect(fetchHandleRecords.mock.calls[0][0]).toMatchObject({ current: 1 })
  })

  it('resetForm 恢复 2 项默认值并重载', async () => {
    const q = useHandleRecords()
    q.form.eventIdText = '8'
    q.form.dateRange = ['2026-09-01 00:00:00', '2026-09-02 00:00:00']
    q.page.value = 4

    q.resetForm()
    await nextTick()

    expect(q.form).toEqual({
      eventIdText: '',
      dateRange: null
    })
    expect(q.page.value).toBe(1)
    expect(fetchHandleRecords).toHaveBeenCalledWith(expect.objectContaining({ current: 1 }))
  })
})

describe('useHandleRecords 分页', () => {
  it('onPageChange 更新页码并触发 load', async () => {
    const q = useHandleRecords()

    q.onPageChange(3)
    await nextTick()

    expect(q.page.value).toBe(3)
    expect(fetchHandleRecords).toHaveBeenCalledWith(expect.objectContaining({ current: 3 }))
  })

  it('onSizeChange 改每页容量时把页码归 1 再 load', async () => {
    const q = useHandleRecords()
    q.page.value = 3

    q.onSizeChange(50)
    await nextTick()

    expect(q.size.value).toBe(50)
    expect(q.page.value).toBe(1)
    expect(fetchHandleRecords).toHaveBeenCalledWith(
      expect.objectContaining({ current: 1, size: 50 })
    )
  })
})
