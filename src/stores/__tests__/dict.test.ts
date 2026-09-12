import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { fetchEventEnums } from '@/api/dict'
import { FALLBACK_ENUMS } from '@/constants/dict'
import { useDictStore } from '@/stores/dict'
import type { EventEnums } from '@/types/api'

vi.mock('@/api/dict', () => ({ fetchEventEnums: vi.fn() }))

/** 精简字典夹具：只放断言需要的项，避免与 FALLBACK_ENUMS 混淆 */
const ENUMS: EventEnums = {
  eventType: [
    { code: 100, name: '人脸' },
    { code: 200, name: '车辆' },
    { code: 300, name: '聚集' }
  ],
  task: [
    { code: 'license_plate', name: '车牌识别', eventType: 200 },
    { code: 'vehicle_type', name: '车辆类型', eventType: 200 },
    { code: 'people_gathering', name: '人员聚集', eventType: 300 }
  ],
  handleStatus: [
    { code: 0, name: '未处理' },
    { code: 1, name: '处理中' },
    { code: 2, name: '已处理' },
    { code: 3, name: '误报忽略' }
  ],
  priority: [
    { code: 0, name: '普通' },
    { code: 1, name: '重要' },
    { code: 2, name: '紧急' }
  ],
  ruleType: [{ code: 'PLATE_BLACKLIST', name: '车牌黑名单' }]
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  vi.mocked(fetchEventEnums).mockResolvedValue(ENUMS)
})

describe('dict store 加载与缓存', () => {
  it('首次 load 调 fetchEventEnums 一次并缓存', async () => {
    const store = useDictStore()
    await store.load()

    expect(fetchEventEnums).toHaveBeenCalledOnce()
    expect(store.loaded).toBe(true)
    expect(store.enums?.eventType).toHaveLength(3)
  })

  it('loaded 后再 load 不重发请求', async () => {
    const store = useDictStore()
    await store.load()
    await store.load()

    expect(fetchEventEnums).toHaveBeenCalledOnce()
  })

  it('并发三次 load 只发一次请求（共享同一 in-flight promise）', async () => {
    const store = useDictStore()
    await Promise.all([store.load(), store.load(), store.load()])

    expect(fetchEventEnums).toHaveBeenCalledOnce()
  })

  it('load(true) 强制重发', async () => {
    const store = useDictStore()
    await store.load()
    await store.load(true)

    expect(fetchEventEnums).toHaveBeenCalledTimes(2)
  })

  it('请求失败时回落 FALLBACK_ENUMS 且 loaded 仍为 true（不阻塞页面、不反复重试）', async () => {
    vi.mocked(fetchEventEnums).mockRejectedValue(new Error('network'))
    const store = useDictStore()
    await store.load()

    expect(store.loaded).toBe(true)
    // 用 toEqual 而非 toBe：Pinia 会把 state 包成 reactive 代理，`store.enums` 与模块级常量不同一引用
    expect(store.enums).toEqual(FALLBACK_ENUMS)
    expect(store.labelOf('eventType', 200)).toBe('车辆')
  })

  it('加载结束后 pending 归位，下次 force 仍能发起新请求', async () => {
    const store = useDictStore()
    await store.load()
    expect(store.pending).toBeNull()
  })
})

describe('dict store 查表', () => {
  it('labelOf 数字与字符串 code 混用都能查到', async () => {
    const store = useDictStore()
    await store.load()

    expect(store.labelOf('eventType', 200)).toBe('车辆')
    expect(store.labelOf('eventType', '200')).toBe('车辆')
    expect(store.labelOf('task', 'license_plate')).toBe('车牌识别')
    expect(store.labelOf('ruleType', 'PLATE_BLACKLIST')).toBe('车牌黑名单')
    expect(store.labelOf('handleStatus', 0)).toBe('未处理')
  })

  it('labelOf 未命中时返回 fallback，无 fallback 则回退 code 字面量', async () => {
    const store = useDictStore()
    await store.load()

    expect(store.labelOf('priority', 9, '未知优先级')).toBe('未知优先级')
    expect(store.labelOf('task', 'ship_plate')).toBe('ship_plate')
  })

  it('labelOf 对 null/undefined/空串返回破折号或指定 fallback', async () => {
    const store = useDictStore()
    await store.load()

    expect(store.labelOf('task', null)).toBe('—')
    expect(store.labelOf('task', undefined, '无')).toBe('无')
    expect(store.labelOf('task', '')).toBe('—')
  })

  it('tasksOfEventType 按大类联动过滤，传 null/不传返全量', async () => {
    const store = useDictStore()
    await store.load()

    expect(store.tasksOfEventType(200).map((t) => t.code)).toEqual([
      'license_plate',
      'vehicle_type'
    ])
    expect(store.tasksOfEventType(300).map((t) => t.code)).toEqual(['people_gathering'])
    expect(store.tasksOfEventType(null)).toHaveLength(3)
    expect(store.tasksOfEventType()).toHaveLength(3)
  })

  it('下拉选项 getter 在未加载时也能给出兜底数据', () => {
    const store = useDictStore()
    expect(store.eventTypeOptions).toEqual(FALLBACK_ENUMS.eventType)
    expect(store.handleStatusOptions).toEqual(FALLBACK_ENUMS.handleStatus)
    expect(store.priorityOptions).toEqual(FALLBACK_ENUMS.priority)
  })
})

describe('dict store reset', () => {
  it('reset 后 enums / loaded / pending 三者全部归零', async () => {
    const store = useDictStore()
    await store.load()
    store.reset()

    expect(store.enums).toBeNull()
    expect(store.loaded).toBe(false)
    expect(store.pending).toBeNull()
  })

  it('reset 后重新 load 会再次发请求（不复用旧 in-flight promise）', async () => {
    const store = useDictStore()
    await store.load()
    store.reset()
    await store.load()

    expect(fetchEventEnums).toHaveBeenCalledTimes(2)
  })
})
