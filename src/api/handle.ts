import { EVENT_BASE } from '@/api/base-url'
import { get, post } from '@/api/request'
import type {
  BatchHandleRequest,
  BatchHandleResult,
  HandleProcessRequest,
  HandleRecordItem,
  HandleRecordQuery,
  HandleStat,
  PageResult,
  StatQuery,
  TodoItem,
  TodoQuery
} from '@/types/api'

/**
 * 预警处理域 API（接口文档 §4.3）。
 *
 * 5 个端点，全部薄透传：不做业务判断、不吞异常、不重复弹提示（错误提示由 axios 拦截器统一负责）。
 * 网关链路：`/api/admin/event/alert-handles/**` → 剥 `/api` → 网关 StripPrefix=2 → detect-event `/alert-handles/**`。
 */
const BASE = `${EVENT_BASE}/alert-handles`

/** 待办列表（§4.3.1）：后端固定 `handle_status ∈ {0,1}` 且紧急置顶，前端不传 handleStatus */
export function fetchTodo(query: TodoQuery): Promise<PageResult<TodoItem>> {
  return get<PageResult<TodoItem>>(`${BASE}/todo`, query as Record<string, unknown>)
}

/**
 * 单条状态流转（§4.3.2）。
 *
 * remark 空串场景由调用方剔除键（不发 `remark: null`）：后端 `setIgnoreNullValue(true)` 会
 * 静默忽略 null，语义与「不传」等价但阅读成本高；调用方组装时直接不发键更清爽。
 */
export function processEvent(req: HandleProcessRequest): Promise<void> {
  return post<void>(`${BASE}/process`, req)
}

/** 批量流转（§4.3.3）：非法项由后端跳过并回填 skipped 明细，前端仅预检提示不拦截 */
export function batchProcess(req: BatchHandleRequest): Promise<BatchHandleResult> {
  return post<BatchHandleResult>(`${BASE}/batch-process`, req)
}

/** 处理记录分页（§4.3.4）：后端固定 `handle_time DESC, id DESC`，不接受排序参数 */
export function fetchHandleRecords(
  query: HandleRecordQuery
): Promise<PageResult<HandleRecordItem>> {
  return get<PageResult<HandleRecordItem>>(`${BASE}/records`, query as Record<string, unknown>)
}

/** 处理效率统计（§4.3.6）：与事件统计共用 StatQuery 三项筛选，看板并行独立容错 */
export function fetchHandleStatistics(query: StatQuery): Promise<HandleStat> {
  return get<HandleStat>(`${BASE}/statistics`, query as Record<string, unknown>)
}
