/** 后端全局错误码（接口文档 附录 A） */
export const SUCCESS_CODE = 0

/** code -> 中文文案，用于后端 msg 缺失时兜底展示 */
export const ERROR_MESSAGES: Record<number, string> = {
  400: '参数错误',
  401: '未认证，请重新登录',
  403: '无权限访问',
  404: '资源不存在',
  1001: '事件不存在',
  1002: '事件已删除',
  2001: '规则配置非法',
  2002: '规则不存在',
  3001: '状态流转非法',
  4001: '导出数量超限（单次上限 5 万条），请缩小筛选范围',
  500: '系统异常'
}

/** 本地存储键名 */
export const TOKEN_KEY = 'detect_access_token'
export const USER_KEY = 'detect_login_user'

/**
 * 前端本地错误哨兵码（均为负数，不与后端附录 A 的错误码重叠）。
 *
 * 三种本地失败的处置完全不同（静默 / 提示重试 / 提示缩小范围），
 * 共用一个 `-1` 会让调用方的 `catch (e) { if (e.code === -1) }` 无法区分。
 */
export const LOCAL_ERROR_CODE = {
  /** 请求被主动取消（切页 / 重复查询），静默处理 */
  CANCELED: -1,
  /** 网络中断 / 后端不可达 */
  NETWORK: -2,
  /** 导出返回 JSON 错误体：真实 code 已被 readErrorFromBlob 消化为文案 */
  EXPORT_BLOB: -3
} as const

/** 事件大类 code */
export const EVENT_TYPE = {
  FACE: 100,
  VEHICLE: 200,
  CROWD: 300
} as const

/** 处理状态 code */
export const HANDLE_STATUS = {
  PENDING: 0,
  PROCESSING: 1,
  RESOLVED: 2,
  IGNORED: 3
} as const

/** 优先级 code */
export const PRIORITY = {
  NORMAL: 0,
  IMPORTANT: 1,
  URGENT: 2
} as const
