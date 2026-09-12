import { EVENT_BASE } from '@/api/base-url'
import { get } from '@/api/request'
import type { EventEnums } from '@/types/api'

const BASE = `${EVENT_BASE}/event-categories`

/**
 * 一次性全量字典（接口文档 §4.5.3）：登录后由 dict store 调用一次并缓存于内存，
 * 所有下拉选项与 code → 中文名翻译共用该缓存。
 *
 * 只封装 `enums` 一个端点：`/types` 与 `/tasks` 的数据已被 `enums` 完整包含，
 * 再封装只会多两条无人调用的死代码。
 */
export function fetchEventEnums(): Promise<EventEnums> {
  return get<EventEnums>(`${BASE}/enums`)
}
