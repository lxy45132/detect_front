import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { ElMessage } from 'element-plus'

// vi.mock 会被提升到文件顶部执行，工厂里引用的变量必须经 vi.hoisted 一起提升，否则触发 TDZ
const { pageEvents, deleteEvent, batchDeleteEvents, exportEvents } = vi.hoisted(() => ({
  pageEvents: vi.fn(),
  deleteEvent: vi.fn(),
  batchDeleteEvents: vi.fn(),
  exportEvents: vi.fn()
}))

vi.mock('@/api/event', () => ({ pageEvents, deleteEvent, batchDeleteEvents, exportEvents }))
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }
}))

import { DEFAULT_PAGE_SIZE, useEventQuery } from '@/composables/useEventQuery'
import { useDictStore } from '@/stores/dict'
import type { EventEnums, EventRecordItem, PageResult } from '@/types/api'

function row(id: number, over: Partial<EventRecordItem> = {}): EventRecordItem {
  return {
    id,
    deviceNum: 'dev01',
    deviceName: '南河湫水闸',
    eventType: 300,
    eventTypeName: '聚集',
    task: 'people_gathering',
    snapTime: '2026-09-10 08:12:33',
    snapUrl: 'http://localhost:9000/detect/a.jpg',
    plateNum: null,
    vehicleNormalType: null,
    crowdNum: 12,
    handleStatus: 0,
    priority: 0,
    hitRuleId: null,
    aiCorrected: false,
    ...over
  }
}

function pageOf(
  records: EventRecordItem[],
  total = records.length,
  current = 1,
  size = DEFAULT_PAGE_SIZE
): PageResult<EventRecordItem> {
  return { records, total, current, size, pages: Math.max(1, Math.ceil(total / size)) }
}

const DICT: EventEnums = {
  eventType: [
    { code: 200, name: '车辆' },
    { code: 300, name: '聚集' }
  ],
  task: [
    { code: 'license_plate', name: '车牌识别', eventType: 200 },
    { code: 'vehicle_type', name: '车辆类型', eventType: 200 },
    { code: 'people_gathering', name: '人员聚集', eventType: 300 }
  ],
  handleStatus: [],
  priority: [],
  ruleType: []
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  pageEvents.mockResolvedValue(pageOf([]))
  deleteEvent.mockResolvedValue(undefined)
  batchDeleteEvents.mockResolvedValue({ deleted: 0 })
  exportEvents.mockResolvedValue(undefined)
})

describe('useEventQuery toQuery', () => {
  it('保留 handleStatus=0 与 priority=0，剔除空串、空白串与 null', () => {
    const q = useEventQuery()
    q.form.handleStatus = 0
    q.form.priority = 0
    q.form.deviceNum = '   '
    q.form.eventType = null
    q.form.keyword = ''
    q.form.task = null
    q.form.dateRange = ['2026-09-01 00:00:00', '2026-09-12 23:59:59']

    expect(q.toQuery()).toEqual({
      current: 1,
      size: DEFAULT_PAGE_SIZE,
      handleStatus: 0,
      priority: 0,
      startTime: '2026-09-01 00:00:00',
      endTime: '2026-09-12 23:59:59'
    })
  })

  it('toQuery(false) 不含 current/size（导出要当前条件下的全量）', () => {
    const q = useEventQuery()
    q.form.plateNum = '浙C6B5P8'
    q.page.value = 3

    expect(q.toQuery(false)).toEqual({ plateNum: '浙C6B5P8' })
  })

  it('dateRange 为 null 时 startTime/endTime 两键都不出现', () => {
    const q = useEventQuery()
    q.form.dateRange = null

    const query = q.toQuery()
    expect(query).not.toHaveProperty('startTime')
    expect(query).not.toHaveProperty('endTime')
  })
})

describe('useEventQuery 加载', () => {
  it('load 成功后写入 rows/total 并复位 loading', async () => {
    pageEvents.mockResolvedValue(pageOf([row(1), row(8)], 2))
    const q = useEventQuery()

    await q.load()

    expect(q.rows.value.map((r) => r.id)).toEqual([1, 8])
    expect(q.total.value).toBe(2)
    expect(q.loading.value).toBe(false)
  })

  it('load 期间 loading 为 true', async () => {
    let resolveFn!: (value: PageResult<EventRecordItem>) => void
    pageEvents.mockReturnValue(
      new Promise<PageResult<EventRecordItem>>((resolve) => {
        resolveFn = resolve
      })
    )
    const q = useEventQuery()

    const pending = q.load()
    expect(q.loading.value).toBe(true)

    resolveFn(pageOf([]))
    await pending
    expect(q.loading.value).toBe(false)
  })

  it('load 失败时清空 rows/total 且不重复弹提示（拦截器已弹）', async () => {
    pageEvents.mockResolvedValueOnce(pageOf([row(1)], 1))
    const q = useEventQuery()
    await q.load()

    pageEvents.mockRejectedValueOnce(new Error('网络错误'))
    await q.load()

    expect(q.rows.value).toEqual([])
    expect(q.total.value).toBe(0)
    expect(q.loading.value).toBe(false)
    expect(ElMessage.error).not.toHaveBeenCalled()
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('search 把页码归 1 再查询，避免停在越界页看到空表', async () => {
    const q = useEventQuery()
    q.page.value = 5

    q.search()
    await nextTick()

    expect(q.page.value).toBe(1)
    expect(pageEvents).toHaveBeenCalledTimes(1)
    expect(pageEvents.mock.calls[0][0]).toMatchObject({ current: 1 })
  })

  it('resetForm 恢复 8 项默认值并重载', async () => {
    const q = useEventQuery()
    q.form.deviceNum = 'dev01'
    q.form.eventType = 200
    q.form.task = 'license_plate'
    q.form.handleStatus = 2
    q.form.priority = 2
    q.form.plateNum = '浙C'
    q.form.keyword = '水闸'
    q.form.dateRange = ['2026-09-01 00:00:00', '2026-09-02 00:00:00']
    q.page.value = 4

    q.resetForm()
    await nextTick()

    expect(q.form).toEqual({
      deviceNum: '',
      eventType: null,
      task: null,
      handleStatus: null,
      priority: null,
      plateNum: '',
      keyword: '',
      dateRange: null
    })
    expect(q.page.value).toBe(1)
    expect(pageEvents).toHaveBeenCalledWith(expect.objectContaining({ current: 1 }))
  })
})

describe('useEventQuery 分页与联动', () => {
  it('onPageChange 更新页码并触发 load', async () => {
    const q = useEventQuery()

    q.onPageChange(3)
    await nextTick()

    expect(q.page.value).toBe(3)
    expect(pageEvents).toHaveBeenCalledWith(expect.objectContaining({ current: 3 }))
  })

  it('onSizeChange 改每页容量时把页码归 1 再 load', async () => {
    const q = useEventQuery()
    q.page.value = 3

    q.onSizeChange(50)
    await nextTick()

    expect(q.size.value).toBe(50)
    expect(q.page.value).toBe(1)
    expect(pageEvents).toHaveBeenCalledWith(expect.objectContaining({ current: 1, size: 50 }))
  })

  it('onEventTypeChange 清空子类，避免「车辆大类 + people_gathering 子类」的矛盾条件', () => {
    const q = useEventQuery()
    q.form.eventType = 300
    q.form.task = 'people_gathering'

    q.onEventTypeChange()

    expect(q.form.task).toBeNull()
  })

  it('taskOptions 随大类联动过滤，大类未选时给全量', async () => {
    const dict = useDictStore()
    dict.enums = DICT
    const q = useEventQuery()

    expect(q.taskOptions.value.map((t) => t.code)).toEqual([
      'license_plate',
      'vehicle_type',
      'people_gathering'
    ])

    q.form.eventType = 200
    await nextTick()
    expect(q.taskOptions.value.map((t) => t.code)).toEqual(['license_plate', 'vehicle_type'])
  })

  it('onSelectionChange 写入选中行', () => {
    const q = useEventQuery()

    q.onSelectionChange([row(1), row(2)])

    expect(q.selection.value.map((r) => r.id)).toEqual([1, 2])
  })
})

describe('useEventQuery 删除', () => {
  it('removeOne 成功返 true 并按当前页码重载', async () => {
    pageEvents.mockResolvedValue(pageOf([row(1), row(8)], 2))
    const q = useEventQuery()
    await q.load()
    pageEvents.mockClear()

    const ok = await q.removeOne(8)

    expect(deleteEvent).toHaveBeenCalledWith(8)
    expect(ok).toBe(true)
    expect(pageEvents).toHaveBeenCalledTimes(1)
    expect(pageEvents.mock.calls[0][0]).toMatchObject({ current: 1 })
  })

  it('removeOne 删掉非首页的最后一条时先 page-=1 再 load（否则会停在空白页）', async () => {
    pageEvents.mockResolvedValue(pageOf([row(9)], 21, 2))
    const q = useEventQuery()
    q.page.value = 2
    await q.load()
    pageEvents.mockClear()

    const ok = await q.removeOne(9)

    expect(ok).toBe(true)
    expect(q.page.value).toBe(1)
    expect(pageEvents).toHaveBeenCalledTimes(1)
    expect(pageEvents.mock.calls[0][0]).toMatchObject({ current: 1 })
  })

  it('removeOne 在非末页删除时保持页码不变', async () => {
    pageEvents.mockResolvedValue(pageOf([row(1), row(2)], 40, 2))
    const q = useEventQuery()
    q.page.value = 2
    await q.load()
    pageEvents.mockClear()

    await q.removeOne(1)

    expect(q.page.value).toBe(2)
    expect(pageEvents.mock.calls[0][0]).toMatchObject({ current: 2 })
  })

  it('removeOne 失败时返 false 且不重载、不弹提示', async () => {
    pageEvents.mockResolvedValue(pageOf([row(1)], 1))
    deleteEvent.mockRejectedValue(new Error('事件不存在'))
    const q = useEventQuery()
    await q.load()
    pageEvents.mockClear()

    const ok = await q.removeOne(1)

    expect(ok).toBe(false)
    expect(pageEvents).not.toHaveBeenCalled()
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('removeMany 传选中 id 数组，成功后清空选中并回第 1 页重载', async () => {
    const q = useEventQuery()
    q.page.value = 3
    q.selection.value = [row(1), row(2)]

    const ok = await q.removeMany([1, 2])

    expect(ok).toBe(true)
    expect(batchDeleteEvents).toHaveBeenCalledWith([1, 2])
    expect(q.selection.value).toEqual([])
    expect(q.page.value).toBe(1)
    expect(pageEvents).toHaveBeenCalledTimes(1)
  })

  it('removeMany 无选中时不发请求直接返 false', async () => {
    const q = useEventQuery()

    const ok = await q.removeMany([])

    expect(ok).toBe(false)
    expect(batchDeleteEvents).not.toHaveBeenCalled()
  })

  it('removeMany 失败时返 false 且保留选中', async () => {
    batchDeleteEvents.mockRejectedValue(new Error('boom'))
    const q = useEventQuery()
    q.selection.value = [row(1)]

    const ok = await q.removeMany([1])

    expect(ok).toBe(false)
    expect(q.selection.value.map((r) => r.id)).toEqual([1])
  })
})

describe('useEventQuery 导出', () => {
  it('exportAs 用 toQuery(false)（带筛选不带分页），成功返 true 并复位 exporting', async () => {
    const q = useEventQuery()
    q.form.eventType = 200
    q.page.value = 2

    const ok = await q.exportAs('xlsx')

    expect(ok).toBe(true)
    const [query, format] = exportEvents.mock.calls[0]
    expect(format).toBe('xlsx')
    expect(query).toMatchObject({ eventType: 200 })
    expect(query).not.toHaveProperty('current')
    expect(query).not.toHaveProperty('size')
    expect(q.exporting.value).toBe(false)
  })

  it('exportAs 期间 exporting 为 true（按钮 loading 用）', async () => {
    let resolveFn!: () => void
    exportEvents.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveFn = resolve
      })
    )
    const q = useEventQuery()

    const pending = q.exportAs('csv')
    expect(q.exporting.value).toBe(true)

    resolveFn()
    await pending
    expect(q.exporting.value).toBe(false)
  })

  it('exportAs 失败（如 4001 超限）返 false、不抛出、不重复弹提示', async () => {
    exportEvents.mockRejectedValue(new Error('导出数量超限'))
    const q = useEventQuery()

    const ok = await q.exportAs('csv')

    expect(ok).toBe(false)
    expect(q.exporting.value).toBe(false)
    expect(ElMessage.error).not.toHaveBeenCalled()
  })
})
