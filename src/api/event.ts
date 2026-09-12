import { ElMessage } from 'element-plus'
import { EVENT_BASE } from '@/api/base-url'
import { BizError } from '@/api/interceptors'
import { del, get, getBlob, put } from '@/api/request'
import type {
  DeletedResult,
  EventQuery,
  EventRecordDetail,
  EventRecordItem,
  EventRecordUpdate,
  EventStat,
  PageResult
} from '@/types/api'
import { buildExportFilename, downloadBlob, isJsonBlob, readErrorFromBlob } from '@/utils/download'

const BASE = `${EVENT_BASE}/event-records`

/**
 * blob 分支拿不到结构化 code（`readErrorFromBlob` 按契约只回可展示文案），
 * 而导出失败对调用方只有「提示 + 中止」一种处理，不需要按 code 分支。
 */
const EXPORT_ERROR_CODE = -1

/** 统计接口的可选筛选（§4.1.7 只认这三项） */
export interface StatQuery {
  startTime?: string
  endTime?: string
  deviceNum?: string
}

/** 分页查询事件列表（§4.1.2）：后端固定 `snap_time DESC`，不接受排序参数 */
export function pageEvents(query: EventQuery): Promise<PageResult<EventRecordItem>> {
  return get<PageResult<EventRecordItem>>(`${BASE}/page`, query as Record<string, unknown>)
}

/** 事件详情（§4.1.3）：含 sourceData 解析对象 + hitRule 摘要 + 内嵌 handleHistory */
export function getEventDetail(id: number): Promise<EventRecordDetail> {
  return get<EventRecordDetail>(`${BASE}/${id}`)
}

/**
 * 修正事件业务字段（§4.1.4）：只传需改字段，不含 handleStatus（状态流转属处理域）。
 * 文本字段清空须发 `''`，发 null 会被后端 `setIgnoreNullValue(true)` 静默忽略。
 */
export function updateEvent(id: number, patch: EventRecordUpdate): Promise<void> {
  return put<void>(`${BASE}/${id}`, patch)
}

/** 逻辑删除单条（§4.1.5）：置 del_flag=1 */
export function deleteEvent(id: number): Promise<void> {
  return del<void>(`${BASE}/${id}`)
}

/** 批量逻辑删除（§4.1.6）：DELETE 带 body `{ids:[]}` */
export function batchDeleteEvents(ids: number[]): Promise<DeletedResult> {
  return del<DeletedResult>(`${BASE}/batch`, { ids })
}

/** 分类统计（§4.1.7）：total + byEventType / byTask / byDay 三组聚合 */
export function getEventStatistics(query: StatQuery): Promise<EventStat> {
  return get<EventStat>(`${BASE}/statistics`, query as Record<string, unknown>)
}

/**
 * 导出（§4.1.8）：带当前筛选条件，不分页导出全部命中；`format` 为 Query 参数。
 *
 * 两条分支：
 * 1. 正常 → 二进制流，前端自行按 format 命名后触发下载（不解析 Content-Disposition，
 *    规避后端 URLEncoder 把空格编成 `+` 的歧义）
 * 2. 超限 → HTTP 200 + `application/json` 的 `{code:4001}`，读回文本取 msg 提示后抛出
 */
export async function exportEvents(query: EventQuery, format: 'xlsx' | 'csv'): Promise<void> {
  const res = await getBlob(`${BASE}/export`, { ...query, format } as Record<string, unknown>)
  const blob = res.data

  if (isJsonBlob(blob)) {
    const msg = await readErrorFromBlob(blob)
    // blob 走透传分支，拦截器不会提示，这里必须自己弹，否则用户看不到任何反馈
    ElMessage.error(msg)
    throw new BizError(EXPORT_ERROR_CODE, msg)
  }

  downloadBlob(blob, buildExportFilename('事件记录', format))
}
