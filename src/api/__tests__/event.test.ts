import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage } from 'element-plus'
import * as request from '@/api/request'
import {
  batchDeleteEvents,
  deleteEvent,
  exportEvents,
  getEventDetail,
  getEventStatistics,
  pageEvents,
  updateEvent
} from '@/api/event'
import { BizError } from '@/api/interceptors'

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }
}))
vi.mock('@/api/request', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  getBlob: vi.fn()
}))
vi.mock('@/utils/download', () => ({
  buildExportFilename: vi.fn(() => '事件记录_20260912_120000.xlsx'),
  downloadBlob: vi.fn(),
  isJsonBlob: vi.fn(() => false),
  readErrorFromBlob: vi.fn(async () => '导出数量超限')
}))

beforeEach(() => vi.clearAllMocks())

describe('事件接口路径与参数', () => {
  it('分页查询走 GET /admin/event/event-records/page 并透传筛选参数', async () => {
    vi.mocked(request.get).mockResolvedValue({
      records: [],
      total: 0,
      current: 1,
      size: 20,
      pages: 0
    })

    await pageEvents({ current: 2, size: 50, eventType: 200, keyword: '浙C' })

    expect(request.get).toHaveBeenCalledWith('/admin/event/event-records/page', {
      current: 2,
      size: 50,
      eventType: 200,
      keyword: '浙C'
    })
  })

  it('详情走 GET /event-records/{id}', async () => {
    vi.mocked(request.get).mockResolvedValue({ id: 8 })
    await getEventDetail(8)
    expect(request.get).toHaveBeenCalledWith('/admin/event/event-records/8')
  })

  it('修正用 PUT 且 URL 含 id、body 只含改动字段', async () => {
    vi.mocked(request.put).mockResolvedValue(null)
    await updateEvent(8, { plateNum: '浙C6B5P8' })
    expect(request.put).toHaveBeenCalledWith('/admin/event/event-records/8', {
      plateNum: '浙C6B5P8'
    })
  })

  it('单条删除用 DELETE 且无 body', async () => {
    vi.mocked(request.del).mockResolvedValue(null)
    await deleteEvent(8)
    expect(request.del).toHaveBeenCalledWith('/admin/event/event-records/8')
    // 只传一个实参 = 未带请求体（区别于批量删除的 DELETE with body）
    expect(vi.mocked(request.del).mock.calls[0]).toHaveLength(1)
  })

  it('批量删除用 DELETE 且 body 为 {ids}（§4.1.6）', async () => {
    vi.mocked(request.del).mockResolvedValue({ deleted: 2 })
    const res = await batchDeleteEvents([1, 2])
    expect(request.del).toHaveBeenCalledWith('/admin/event/event-records/batch', { ids: [1, 2] })
    expect(res.deleted).toBe(2)
  })

  it('统计走 GET /event-records/statistics 并透传三项可选筛选', async () => {
    vi.mocked(request.get).mockResolvedValue({
      total: 0,
      byEventType: [],
      byTask: [],
      byDay: []
    })
    await getEventStatistics({ deviceNum: 'dev01' })
    expect(request.get).toHaveBeenCalledWith('/admin/event/event-records/statistics', {
      deviceNum: 'dev01'
    })
  })
})

describe('exportEvents', () => {
  it('文件流正常时把 format 并入 query、按 format 命名并触发下载，不弹错误提示', async () => {
    const { downloadBlob } = await import('@/utils/download')
    const blob = new Blob(['xlsx-bytes'])
    vi.mocked(request.getBlob).mockResolvedValue({ data: blob } as never)

    await exportEvents({ eventType: 200 }, 'xlsx')

    expect(request.getBlob).toHaveBeenCalledWith('/admin/event/event-records/export', {
      eventType: 200,
      format: 'xlsx'
    })
    expect(downloadBlob).toHaveBeenCalledWith(blob, '事件记录_20260912_120000.xlsx')
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('csv 导出时 format=csv 并入 query', async () => {
    vi.mocked(request.getBlob).mockResolvedValue({ data: new Blob(['csv']) } as never)

    await exportEvents({}, 'csv')

    expect(request.getBlob).toHaveBeenCalledWith('/admin/event/event-records/export', {
      format: 'csv'
    })
  })

  it('导出超限（HTTP 200 + JSON 错误体）时读回 msg、提示并抛 BizError，不落盘', async () => {
    const { downloadBlob, isJsonBlob, readErrorFromBlob } = await import('@/utils/download')
    vi.mocked(isJsonBlob).mockReturnValue(true)
    vi.mocked(request.getBlob).mockResolvedValue({ data: new Blob(['{}']) } as never)

    await expect(exportEvents({}, 'csv')).rejects.toBeInstanceOf(BizError)
    await expect(exportEvents({}, 'csv')).rejects.toThrow('导出数量超限')
    expect(readErrorFromBlob).toHaveBeenCalled()
    expect(ElMessage.error).toHaveBeenCalledWith('导出数量超限')
    expect(downloadBlob).not.toHaveBeenCalled()
  })
})
