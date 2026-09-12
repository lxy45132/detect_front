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
