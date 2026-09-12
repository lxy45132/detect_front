import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage } from 'element-plus'
import type { AxiosResponse } from 'axios'
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
import { LOCAL_ERROR_CODE } from '@/constants/error-code'

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
  // 桩随 format 变化，才能守住「按 format 命名」这条链路（恒定返回值会让 csv 用例失去回归网）
  buildExportFilename: vi.fn(
    (prefix: string, format: string) => `${prefix}_20260912_120000.${format}`
  ),
  downloadBlob: vi.fn(),
  isJsonBlob: vi.fn(() => false),
  readErrorFromBlob: vi.fn(async () => '导出数量超限')
}))

/** 最小 AxiosResponse<Blob> 工厂，替代散落的 `as never` 类型逃逸 */
function blobResponse(blob: Blob): AxiosResponse<Blob> {
  return {
    data: blob,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/vnd.ms-excel' },
    config: { url: '/export' }
  } as AxiosResponse<Blob>
}

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

  it('单条删除用 DELETE 且不带请求体', async () => {
    vi.mocked(request.del).mockResolvedValue(null)
    await deleteEvent(8)
    expect(request.del).toHaveBeenCalledWith('/admin/event/event-records/8')
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
  it('xlsx：format 并入 query、按 format 命名后触发下载，且不弹任何提示', async () => {
    const { buildExportFilename, downloadBlob } = await import('@/utils/download')
    const blob = new Blob(['xlsx-bytes'])
    vi.mocked(request.getBlob).mockResolvedValue(blobResponse(blob))

    await exportEvents({ eventType: 200 }, 'xlsx')

    expect(request.getBlob).toHaveBeenCalledWith('/admin/event/event-records/export', {
      eventType: 200,
      format: 'xlsx'
    })
    expect(buildExportFilename).toHaveBeenCalledWith('事件记录', 'xlsx')
    expect(downloadBlob).toHaveBeenCalledWith(blob, '事件记录_20260912_120000.xlsx')
    expect(ElMessage.error).not.toHaveBeenCalled()
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('csv：命名走 .csv 后缀，不沿用 xlsx 名', async () => {
    const { buildExportFilename, downloadBlob } = await import('@/utils/download')
    const blob = new Blob(['csv-bytes'])
    vi.mocked(request.getBlob).mockResolvedValue(blobResponse(blob))

    await exportEvents({}, 'csv')

    expect(request.getBlob).toHaveBeenCalledWith('/admin/event/event-records/export', {
      format: 'csv'
    })
    expect(buildExportFilename).toHaveBeenCalledWith('事件记录', 'csv')
    expect(downloadBlob).toHaveBeenCalledWith(blob, '事件记录_20260912_120000.csv')
  })

  it('剔除分页参数：导出按筛选条件全量导出，不受当前页影响（§4.1.8）', async () => {
    vi.mocked(request.getBlob).mockResolvedValue(blobResponse(new Blob(['x'])))

    await exportEvents({ current: 3, size: 50, eventType: 200 }, 'xlsx')

    expect(request.getBlob).toHaveBeenCalledWith('/admin/event/event-records/export', {
      eventType: 200,
      format: 'xlsx'
    })
  })

  it('导出超限（HTTP 200 + JSON 错误体）时只提示一次、抛 BizError 且不落盘', async () => {
    const { downloadBlob, isJsonBlob, readErrorFromBlob } = await import('@/utils/download')
    // 用一次性桩：clearAllMocks 不重置 mockReturnValue，永久桩会泄漏到后续用例
    vi.mocked(isJsonBlob).mockReturnValueOnce(true)
    vi.mocked(request.getBlob).mockResolvedValue(blobResponse(new Blob(['{}'])))

    const pending = exportEvents({}, 'csv')
    await expect(pending).rejects.toBeInstanceOf(BizError)
    await expect(pending).rejects.toMatchObject({
      code: LOCAL_ERROR_CODE.EXPORT_BLOB,
      msg: '导出数量超限'
    })
    expect(readErrorFromBlob).toHaveBeenCalledTimes(1)
    expect(ElMessage.error).toHaveBeenCalledTimes(1)
    expect(ElMessage.error).toHaveBeenCalledWith('导出数量超限')
    expect(ElMessage.success).not.toHaveBeenCalled()
    expect(downloadBlob).not.toHaveBeenCalled()
  })
})
