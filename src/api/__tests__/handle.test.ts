import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as request from '@/api/request'
import {
  batchProcess,
  fetchHandleRecords,
  fetchHandleStatistics,
  fetchTodo,
  processEvent
} from '@/api/handle'

vi.mock('@/api/request', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  getBlob: vi.fn()
}))

beforeEach(() => vi.clearAllMocks())

describe('预警处理接口路径与参数（§4.3）', () => {
  it('fetchTodo 走 GET /admin/event/alert-handles/todo 并透传 TodoQuery', async () => {
    vi.mocked(request.get).mockResolvedValue({
      records: [],
      total: 0,
      current: 1,
      size: 20,
      pages: 0
    })

    await fetchTodo({
      current: 1,
      size: 20,
      priority: 2,
      eventType: 200,
      deviceNum: 'dev01',
      startTime: '2026-09-01 00:00:00',
      endTime: '2026-09-15 23:59:59'
    })

    expect(request.get).toHaveBeenCalledWith('/admin/event/alert-handles/todo', {
      current: 1,
      size: 20,
      priority: 2,
      eventType: 200,
      deviceNum: 'dev01',
      startTime: '2026-09-01 00:00:00',
      endTime: '2026-09-15 23:59:59'
    })
  })

  it('processEvent 走 POST /admin/event/alert-handles/process 并透传 body', async () => {
    vi.mocked(request.post).mockResolvedValue(undefined)

    await processEvent({ eventId: 8, toStatus: 1, remark: '正在核查' })

    expect(request.post).toHaveBeenCalledWith('/admin/event/alert-handles/process', {
      eventId: 8,
      toStatus: 1,
      remark: '正在核查'
    })
  })

  it('processEvent remark 缺省时 body 不含该键（对齐「空串不发键」约定）', async () => {
    vi.mocked(request.post).mockResolvedValue(undefined)

    await processEvent({ eventId: 8, toStatus: 2 })

    expect(request.post).toHaveBeenCalledWith('/admin/event/alert-handles/process', {
      eventId: 8,
      toStatus: 2
    })
  })

  it('batchProcess 走 POST /admin/event/alert-handles/batch-process 并透传 eventIds', async () => {
    vi.mocked(request.post).mockResolvedValue({ processed: 2, skipped: [] })

    const res = await batchProcess({ eventIds: [1, 2, 3], toStatus: 3, remark: '批量误报' })

    expect(request.post).toHaveBeenCalledWith('/admin/event/alert-handles/batch-process', {
      eventIds: [1, 2, 3],
      toStatus: 3,
      remark: '批量误报'
    })
    expect(res.processed).toBe(2)
    expect(res.skipped).toEqual([])
  })

  it('fetchHandleRecords 走 GET /admin/event/alert-handles/records 并透传 HandleRecordQuery', async () => {
    vi.mocked(request.get).mockResolvedValue({
      records: [],
      total: 0,
      current: 1,
      size: 20,
      pages: 0
    })

    await fetchHandleRecords({
      current: 2,
      size: 50,
      eventId: 8,
      startTime: '2026-09-01 00:00:00',
      endTime: '2026-09-15 23:59:59'
    })

    expect(request.get).toHaveBeenCalledWith('/admin/event/alert-handles/records', {
      current: 2,
      size: 50,
      eventId: 8,
      startTime: '2026-09-01 00:00:00',
      endTime: '2026-09-15 23:59:59'
    })
  })

  it('fetchHandleStatistics 走 GET /admin/event/alert-handles/statistics 并透传 StatQuery 三项', async () => {
    vi.mocked(request.get).mockResolvedValue({
      pendingCount: 0,
      processingCount: 0,
      todayResolved: 0,
      falseRate: 0,
      avgHandleMinutes: 0
    })

    await fetchHandleStatistics({
      startTime: '2026-09-01 00:00:00',
      endTime: '2026-09-15 23:59:59',
      deviceNum: 'dev01'
    })

    expect(request.get).toHaveBeenCalledWith('/admin/event/alert-handles/statistics', {
      startTime: '2026-09-01 00:00:00',
      endTime: '2026-09-15 23:59:59',
      deviceNum: 'dev01'
    })
  })
})
