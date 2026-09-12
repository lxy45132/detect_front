import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { fetchEventEnums } from '@/api/dict'
import { useEnum } from '@/composables/useEnum'
import { useDictStore } from '@/stores/dict'

vi.mock('@/api/dict', () => ({ fetchEventEnums: vi.fn() }))

beforeEach(async () => {
  setActivePinia(createPinia())
  // 让字典请求失败，从而走 FALLBACK_ENUMS —— 顺带验证「后端不可达时展示层不塌」
  vi.mocked(fetchEventEnums).mockRejectedValue(new Error('offline'))
  await useDictStore().load()
})

describe('useEnum 优先级', () => {
  it('0/1/2 → 普通/重要/紧急，tag 分别 info/warning/danger', () => {
    const { priorityLabel, priorityTag } = useEnum()

    expect(priorityLabel(0)).toBe('普通')
    expect(priorityLabel(1)).toBe('重要')
    expect(priorityLabel(2)).toBe('紧急')
    expect(priorityTag(0)).toBe('info')
    expect(priorityTag(1)).toBe('warning')
    expect(priorityTag(2)).toBe('danger')
  })

  it('未知 code 兜底为「未知」+ info', () => {
    const { priorityLabel, priorityTag } = useEnum()

    expect(priorityLabel(99)).toBe('未知')
    expect(priorityTag(99)).toBe('info')
  })

  it('null/undefined 显示破折号 + info（列表字段可能为空）', () => {
    const { priorityLabel, priorityTag } = useEnum()

    expect(priorityLabel(null)).toBe('—')
    expect(priorityLabel(undefined)).toBe('—')
    expect(priorityTag(null)).toBe('info')
    expect(priorityTag(undefined)).toBe('info')
  })
})

describe('useEnum 处理状态', () => {
  it('0/1/2/3 → 未处理/处理中/已处理/误报忽略', () => {
    const { handleStatusLabel } = useEnum()

    expect(handleStatusLabel(0)).toBe('未处理')
    expect(handleStatusLabel(1)).toBe('处理中')
    expect(handleStatusLabel(2)).toBe('已处理')
    expect(handleStatusLabel(3)).toBe('误报忽略')
  })

  it('tag 分别 info/primary/success/info', () => {
    const { handleStatusTag } = useEnum()

    expect(handleStatusTag(0)).toBe('info')
    expect(handleStatusTag(1)).toBe('primary')
    expect(handleStatusTag(2)).toBe('success')
    expect(handleStatusTag(3)).toBe('info')
  })

  it('未知 code 与空值均不崩，兜底「未知」/破折号 + info', () => {
    const { handleStatusLabel, handleStatusTag } = useEnum()

    expect(handleStatusLabel(9)).toBe('未知')
    expect(handleStatusTag(9)).toBe('info')
    expect(handleStatusLabel(null)).toBe('—')
    expect(handleStatusTag(undefined)).toBe('info')
  })
})

describe('useEnum 推送状态', () => {
  it('0 未推送 / 1 已推送（字典无此项，前端硬编码）', () => {
    const { pushStatusLabel } = useEnum()

    expect(pushStatusLabel(0)).toBe('未推送')
    expect(pushStatusLabel(1)).toBe('已推送')
  })

  it('口径与其他 label 一致：空值→破折号，有值但不在值域→「未知」', () => {
    const { pushStatusLabel } = useEnum()

    expect(pushStatusLabel(9)).toBe('未知')
    expect(pushStatusLabel(null)).toBe('—')
    expect(pushStatusLabel(undefined)).toBe('—')
  })
})

describe('useEnum 走后端字典而非静态兜底', () => {
  it('后端字典名称与 FALLBACK 不同时，label 取后端值（证明真的走 dict store）', async () => {
    vi.mocked(fetchEventEnums).mockResolvedValue({
      eventType: [{ code: 200, name: '车辆(后端)' }],
      task: [],
      handleStatus: [{ code: 2, name: '已结案(后端)' }],
      priority: [{ code: 1, name: '重要(后端)' }],
      ruleType: []
    })
    const dict = useDictStore()
    dict.reset()
    await dict.load(true)

    const { priorityLabel, handleStatusLabel } = useEnum()
    expect(priorityLabel(1)).toBe('重要(后端)')
    expect(handleStatusLabel(2)).toBe('已结案(后端)')
    expect(dict.labelOf('eventType', 200)).toBe('车辆(后端)')
  })
})
