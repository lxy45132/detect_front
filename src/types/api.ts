/**
 * 后端接口契约类型定义。
 *
 * 逐字段对齐 detect-modules/detect-event 的 VO / DTO 与 detect-auth 的 OAuth2Controller，
 * 依据《事件管理后台 API 接口文档》v1.0（yolo26/docs/superpowers/specs/2026-09-10-event-management-api-design.md）。
 */

/* ============================ 全局约定 §2 ============================ */

/** 统一响应包装 R<T>：code=0 成功 */
export interface R<T> {
  code: number
  msg: string
  data: T
}

/** 分页响应 PageResult<T> §2.3 */
export interface PageResult<T> {
  records: T[]
  total: number
  current: number
  size: number
  pages: number
}

/** 分页请求公共参数 */
export interface PageQuery {
  current?: number
  size?: number
}

/**
 * 统计接口的可选筛选（§4.1.7 事件统计 / §4.3.6 处理效率统计均只认这三项）。
 *
 * 一阶段先落在 `api/event.ts`，二阶段收归此处（跨域共用）；`api/event.ts` 保留兼容 re-export。
 */
export interface StatQuery {
  startTime?: string
  endTime?: string
  deviceNum?: string
}

/* ============================ 认证 detect-auth ============================ */

/**
 * POST /auth/oauth/token 成功响应（OAuth2 风格，字段为下划线命名）。
 * 注意：该端点用 @RequestParam 接收，前端必须以 x-www-form-urlencoded 提交。
 */
export interface TokenResponse {
  access_token: string
  token_type: string
  /** 有效期（秒） */
  expires_in: number
  user_id: number
  username: string
  /** 如 ["ROLE_ADMIN"] */
  authorities: string[]
  scope?: string
}

/** 登录失败响应（HTTP 400）：{error:"invalid_grant", error_description:"用户名或密码错误"} */
export interface TokenErrorResponse {
  error: string
  error_description?: string
}

/* ============================ 分类字典 §4.5 ============================ */

/** 通用枚举项：eventType/handleStatus/priority 的 code 为数字，ruleType 的 code 为字符串 */
export interface EnumItem {
  code: number | string
  name: string
}

/** 事件子类项（比 EnumItem 多所属大类） */
export interface TaskItem {
  code: string
  name: string
  eventType: number
}

/** GET /event-categories/enums 一次性全量字典 */
export interface EventEnums {
  eventType: EnumItem[]
  task: TaskItem[]
  handleStatus: EnumItem[]
  priority: EnumItem[]
  ruleType: EnumItem[]
}

/* ============================ 事件管理 §4.1 ============================ */

/** GET /event-records/page 查询参数（对应 EventQueryDTO） */
export interface EventQuery extends PageQuery {
  /** 设备编号（精确） */
  deviceNum?: string
  /** 事件大类 100/200/300 */
  eventType?: number
  /** 事件子类，如 license_plate */
  task?: string
  /** 处理状态 0/1/2/3 */
  handleStatus?: number
  /** 优先级 0/1/2 */
  priority?: number
  /** 车牌（模糊） */
  plateNum?: string
  /** 关键词（车牌 OR 设备名） */
  keyword?: string
  /** 抓拍时间区间，yyyy-MM-dd HH:mm:ss */
  startTime?: string
  endTime?: string
}

/** 事件列表项（EventRecordListVO） */
export interface EventRecordItem {
  id: number
  deviceNum: string
  deviceName: string | null
  eventType: number
  /** 大类中文名（后端枚举翻译） */
  eventTypeName: string | null
  /** 子类 code（取自 source_data.task） */
  task: string | null
  /** 已格式化 yyyy-MM-dd HH:mm:ss */
  snapTime: string
  /** MinIO 抓拍图 URL，可能为 null */
  snapUrl: string | null
  plateNum: string | null
  vehicleNormalType: string | null
  crowdNum: number | null
  handleStatus: number
  priority: number
  hitRuleId: number | null
  /** AI 复核是否修正了原值 */
  aiCorrected: boolean
}

/** 命中规则摘要（HitRuleVO） */
export interface HitRule {
  id: number
  ruleName: string
  ruleType: string
}

/** 处理历史项（HandleHistoryVO），事件详情与 §4.3.5 共用 */
export interface HandleHistoryItem {
  toStatus: number
  handlerName: string | null
  handleRemark: string | null
  handleTime: string | null
}

/**
 * 事件详情（EventRecordDetailVO）。
 * sourceData 为后端解析后的对象（含 task/confidence/trackId/bbox/plateColor 等），结构随子类而异。
 */
export interface EventRecordDetail {
  id: number
  deviceNum: string
  deviceName: string | null
  eventType: number
  eventTypeName: string | null
  snapTime: string
  snapUrl: string | null

  /* 人脸域 */
  name: string | null
  cardno: string | null
  libName: string | null
  similarity: number | null
  identifyFaceUrl: string | null
  visibleLightUrl: string | null

  /* 车辆域 */
  plateNum: string | null
  vehicleType: number | null
  vehicleNormalType: string | null
  vehicleLogo: string | null
  vehicleSubLogo: string | null
  vehicleColor: string | null
  vehicleModel: string | null
  heightPermitted: number | null

  /* 聚集域 */
  crowdNum: number | null

  /** 推送状态：0 未推送 / 1 已推送 */
  status: number
  handleStatus: number
  priority: number
  hitRuleId: number | null

  sourceData: Record<string, unknown> | string | null
  hitRule: HitRule | null
  handleHistory: HandleHistoryItem[]
}

/** PUT /event-records/{id} 请求体（EventRecordUpdateDTO）：仅传需修正字段，不含 handleStatus */
export interface EventRecordUpdate {
  name?: string | null
  cardno?: string | null
  libName?: string | null
  similarity?: number | null
  identifyFaceUrl?: string | null
  visibleLightUrl?: string | null
  plateNum?: string | null
  vehicleType?: number | null
  vehicleNormalType?: string | null
  vehicleLogo?: string | null
  vehicleSubLogo?: string | null
  vehicleColor?: string | null
  vehicleModel?: string | null
  heightPermitted?: number | null
  crowdNum?: number | null
}

/** 分类统计（EventStatVO §4.1.7） */
export interface EventStat {
  total: number
  byEventType: { code: number; name: string; count: number }[]
  byTask: { task: string; name: string | null; count: number }[]
  byDay: { date: string; count: number }[]
}

/** 通用 ID 响应（IdVO） */
export interface IdResult {
  id: number
}

/** 批量删除响应（DeletedVO） */
export interface DeletedResult {
  deleted: number
}

/* ============================ 预警处理 §4.3（详情抽屉已用 history） ============================ */

/** 待办列表查询（TodoQueryDTO §4.3.1）：无 handleStatus 筛选（后端固定 {0,1}） */
export interface TodoQuery extends PageQuery {
  /** 优先级 0/1/2 */
  priority?: number | null
  /** 事件大类 100/200/300 */
  eventType?: number | null
  /** 设备编号（精确） */
  deviceNum?: string | null
  /** 抓拍时间起（yyyy-MM-dd HH:mm:ss） */
  startTime?: string | null
  /** 抓拍时间止 */
  endTime?: string | null
}

/** 处理记录查询（HandleRecordQueryDTO §4.3.4）：不做 handlerId 筛选（规格 §3.3） */
export interface HandleRecordQuery extends PageQuery {
  eventId?: number | null
  /** 处理时间起 */
  startTime?: string | null
  /** 处理时间止 */
  endTime?: string | null
}

/**
 * 单条流转请求体（HandleProcessDTO §4.3.2）。
 * remark 上限 500 字（对齐 `alert_handle_record.handle_remark` 列宽）；
 * 空串场景由调用方剔除键，不发 `remark: null`（后端 setIgnoreNullValue 会静默忽略，语义混乱）。
 */
export interface HandleProcessRequest {
  eventId: number
  toStatus: number
  remark?: string
}

/** 批量流转请求体（BatchHandleDTO §4.3.3）：非法项由后端跳过，前端仅预检提示不拦截 */
export interface BatchHandleRequest {
  eventIds: number[]
  toStatus: number
  remark?: string
}

/** 待办列表项（TodoVO）= 事件列表项 + 命中规则名 */
export interface TodoItem extends EventRecordItem {
  hitRuleName: string | null
}

/** 批量处理结果（BatchHandleResultVO §4.3.3） */
export interface BatchHandleResult {
  processed: number
  skipped: { eventId: number; reason: string }[]
}

/** 处理记录分页项（HandleRecordVO §4.3.4） */
export interface HandleRecordItem {
  id: number
  eventId: number
  fromStatus: number | null
  toStatus: number
  handlerName: string | null
  handleRemark: string | null
  handleTime: string | null
}

/** 处理效率统计（HandleStatVO §4.3.6） */
export interface HandleStat {
  pendingCount: number
  processingCount: number
  todayResolved: number
  /** 误报率 0~1，两位小数 */
  falseRate: number
  /** 平均处理时长（分钟），一位小数 */
  avgHandleMinutes: number
}

/* ============================ 预警规则 §4.2（后续模块预留） ============================ */

/** 布控规则类型 code */
export type RuleTypeCode = 'PLATE_BLACKLIST' | 'VEHICLE_TYPE' | 'CROWD_THRESHOLD' | 'DEVICE_TIME'

/** 规则列表项（AlertRuleListVO） */
export interface AlertRuleItem {
  id: number
  ruleName: string
  ruleType: RuleTypeCode | string
  ruleTypeName: string | null
  eventType: number | null
  matchConfig: Record<string, unknown> | string | null
  priority: number
  notifyEnabled: number
  enabled: number
}

/** 规则详情（AlertRuleDetailVO） */
export interface AlertRuleDetail extends AlertRuleItem {
  deviceScope: string[] | string | null
  timeScope: { start?: string; end?: string } | string | null
  remark: string | null
  createBy: string | null
  createTime: string | null
  updateTime: string | null
}

/** 规则试跑结果（MatchResult §4.2.7） */
export interface MatchTestResult {
  matched: boolean
  reason: string
}

/* ============================ 站内通知 §4.4（后续模块预留） ============================ */

/** 通知项（NotificationVO） */
export interface NotificationItem {
  id: number
  title: string
  content: string | null
  /** alert 预警 / system 系统 */
  type: string
  bizId: number | null
  priority: number
  readFlag: number
  createTime: string | null
}

/** 未读数（UnreadCountVO） */
export interface UnreadCountResult {
  count: number
}

/** 全部已读结果（ReadAllVO） */
export interface ReadAllResult {
  read: number
}

/** AI 复核结果（sourceData.aiReview） */
export interface AiReview {
  reviewed: boolean
  overridden: boolean
  field: string
  model: string
  reviewedAt: string
  original: { value: string; confidence: number }
  corrected: { value: string; confidence: number; plateColor?: string }
  reason: string
  status: string
}
