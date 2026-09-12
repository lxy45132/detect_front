import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ElMessage } from 'element-plus'
import '@/test/element-plus'
import EventDetailDrawer from '@/components/EventDetailDrawer.vue'
import { BizError } from '@/api/interceptors'
import type { EventRecordDetail } from '@/types/api'

const { getEventDetail, updateEvent } = vi.hoisted(() => ({
  getEventDetail: vi.fn(),
  updateEvent: vi.fn()
}))

vi.mock('@/api/event', () => ({ getEventDetail, updateEvent }))

function detail(over: Partial<EventRecordDetail> = {}): EventRecordDetail {
  return {
    id: 8,
    deviceNum: 'testcar-cam01',
    deviceName: '南河湫水闸',
    eventType: 200,
    eventTypeName: '车辆',
    snapTime: '2026-09-10 08:49:50',
    snapUrl: null,
    name: null,
    cardno: null,
    libName: null,
    similarity: null,
    identifyFaceUrl: null,
    visibleLightUrl: null,
    plateNum: '浙C6B5P8',
    vehicleType: 3,
    vehicleNormalType: 'SLAGTRUCK',
    vehicleLogo: null,
    vehicleSubLogo: null,
    vehicleColor: '蓝色',
    vehicleModel: null,
    heightPermitted: 4.5,
    crowdNum: null,
    status: 0,
    handleStatus: 0,
    priority: 1,
    hitRuleId: 5,
    sourceData: { task: 'license_plate', confidence: 0.87 },
    hitRule: { id: 5, ruleName: '渣土车布控', ruleType: 'VEHICLE_TYPE' },
    handleHistory: [],
    ...over
  }
}

/** 抽屉内容 teleport 到 body，故断言统一读 document.body */
function bodyText(): string {
  return document.body.textContent ?? ''
}

async function openDrawer(props: Partial<InstanceType<typeof EventDetailDrawer>['$props']> = {}) {
  const wrapper = mount(EventDetailDrawer, {
    props: { modelValue: true, eventId: 8, ...props },
    attachTo: document.body
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  document.body.innerHTML = ''
  setActivePinia(createPinia())
  vi.clearAllMocks()
  getEventDetail.mockResolvedValue(detail())
})

describe('EventDetailDrawer 装载', () => {
  it('打开时按 eventId 拉详情一次', async () => {
    await openDrawer()

    expect(getEventDetail).toHaveBeenCalledTimes(1)
    expect(getEventDetail).toHaveBeenCalledWith(8)
  })

  it('eventId 为 null 时不发请求', async () => {
    await openDrawer({ eventId: null })

    expect(getEventDetail).not.toHaveBeenCalled()
  })

  it('expose 的 reload() 会重新拉详情', async () => {
    const wrapper = await openDrawer()

    ;(wrapper.vm as unknown as { reload: () => void }).reload()
    await flushPromises()

    expect(getEventDetail).toHaveBeenCalledTimes(2)
  })
})

describe('EventDetailDrawer 渲染', () => {
  it('事件子类名取自 sourceData.task（详情 VO 没有 task 字段）', async () => {
    await openDrawer()

    expect(bodyText()).toContain('车牌识别')
  })

  it('渲染头部标签、基础信息、命中规则与推送状态', async () => {
    await openDrawer()
    const text = bodyText()

    expect(text).toContain('事件 #8')
    expect(text).toContain('南河湫水闸')
    expect(text).toContain('testcar-cam01')
    expect(text).toContain('渣土车布控')
    expect(text).toContain('未推送')
    expect(text).toContain('重要')
    expect(text).toContain('未处理')
  })

  it('车辆事件渲染车辆业务字段，不渲染人脸字段', async () => {
    await openDrawer()
    const text = bodyText()

    expect(text).toContain('浙C6B5P8')
    expect(text).toContain('蓝色')
    expect(text).toContain('限高(米)')
    expect(text).not.toContain('身份证号')
    expect(text).not.toContain('聚集人数')
  })

  it('处理历史为空时显示「暂无处理记录」', async () => {
    await openDrawer()

    expect(bodyText()).toContain('暂无处理记录')
  })

  it('有处理历史时渲染处理人、目标状态中文名与备注', async () => {
    getEventDetail.mockResolvedValue(
      detail({
        handleHistory: [
          { toStatus: 2, handlerName: '张三', handleRemark: '转执法', handleTime: '2026-09-10 09:20:00' }
        ]
      })
    )
    await openDrawer()
    const text = bodyText()

    expect(text).toContain('张三')
    expect(text).toContain('已处理')
    expect(text).toContain('转执法')
    expect(text).not.toContain('暂无处理记录')
  })

  it('sourceData 为字符串（后端解析失败回退）时原样展示，不多加一层引号转义', async () => {
    getEventDetail.mockResolvedValue(detail({ sourceData: '{"task":"vehicle_type"' }))
    await openDrawer()

    expect(bodyText()).toContain('{"task":"vehicle_type"')
    expect(bodyText()).not.toContain('\\"task\\"')
  })

  it('关闭后再打开另一条记录会重新拉取（不闪现上一条）', async () => {
    const wrapper = await openDrawer()

    await wrapper.setProps({ modelValue: false })
    await flushPromises()
    await wrapper.setProps({ modelValue: true, eventId: 9 })
    await flushPromises()

    expect(getEventDetail).toHaveBeenLastCalledWith(9)
  })
})

describe('EventDetailDrawer 异常', () => {
  it('详情返回 1001 时提示并关闭抽屉', async () => {
    getEventDetail.mockRejectedValue(new BizError(1001, '事件不存在'))
    const warning = vi.spyOn(ElMessage, 'warning').mockImplementation(() => undefined as never)
    const wrapper = await openDrawer()

    expect(warning).toHaveBeenCalledWith('事件不存在或已被删除')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    warning.mockRestore()
  })

  it('非 1001 错误不关闭抽屉（提示由拦截器统一负责）', async () => {
    getEventDetail.mockRejectedValue(new BizError(500, '系统异常'))
    const wrapper = await openDrawer()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(bodyText()).toContain('暂无详情数据')
  })
})
