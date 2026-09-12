import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ElMessage, ElMessageBox, type MessageBoxData } from 'element-plus'
import '@/test/element-plus'
import EventEditDialog from '@/components/EventEditDialog.vue'
import { BizError } from '@/api/interceptors'
import type { EventRecordDetail } from '@/types/api'

const { getEventDetail, updateEvent } = vi.hoisted(() => ({
  getEventDetail: vi.fn(),
  updateEvent: vi.fn()
}))

vi.mock('@/api/event', () => ({ getEventDetail, updateEvent }))

/**
 * EP 的 `MessageBoxData = MessageBoxInputData & Action`（对象类型与字符串字面量联合的交集，
 * 实际不可满足），故构造确认返回值只能显式转换；组件不使用其内容，只关心 resolve/reject。
 */
const CONFIRMED = { value: '', action: 'confirm' } as unknown as MessageBoxData

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
    crowdNum: 12,
    status: 0,
    handleStatus: 0,
    priority: 1,
    hitRuleId: null,
    sourceData: { task: 'license_plate' },
    hitRule: null,
    handleHistory: [],
    ...over
  }
}

/** 弹窗内容 teleport 到 body，故一律从 document.body 找元素 */
function fieldInput(label: string): HTMLInputElement {
  const items = [...document.body.querySelectorAll('.el-form-item')]
  const item = items.find((el) =>
    (el.querySelector('.el-form-item__label')?.textContent ?? '').includes(label)
  )
  const input = item?.querySelector('input') as HTMLInputElement | null
  if (!input) throw new Error(`未找到字段「${label}」的输入框`)
  return input
}

function saveButton(): HTMLButtonElement {
  const button = [...document.body.querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').includes('保存')
  )
  if (!button) throw new Error('未找到保存按钮')
  return button as HTMLButtonElement
}

/** 文本输入：走原生 input 事件，等价于用户键入 */
function typeText(label: string, value: string): void {
  const input = fieldInput(label)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/** 清空数字输入：el-input-number 在 change 事件里把空串归一为 null */
function clearNumber(label: string): void {
  const input = fieldInput(label)
  input.value = ''
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

async function clickSave(): Promise<void> {
  saveButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await flushPromises()
}

async function openDialog(props: Record<string, unknown> = {}) {
  const wrapper = mount(EventEditDialog, {
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
  updateEvent.mockResolvedValue(null)
})

describe('EventEditDialog 装载与分组', () => {
  it('打开时自己拉详情（行上只有列表 VO，字段不全）', async () => {
    await openDialog()

    expect(getEventDetail).toHaveBeenCalledWith(8)
  })

  it('车辆事件只显示通用 + 车辆字段组，不显示人脸字段', async () => {
    await openDialog()
    const text = document.body.textContent ?? ''

    expect(text).toContain('通用字段')
    expect(text).toContain('车辆信息')
    expect(text).not.toContain('人脸信息')
    expect(text).not.toContain('身份证号')
  })

  it('人脸事件只显示通用 + 人脸字段组', async () => {
    getEventDetail.mockResolvedValue(detail({ eventType: 100 }))
    await openDialog()
    const text = document.body.textContent ?? ''

    expect(text).toContain('人脸信息')
    expect(text).toContain('身份证号')
    expect(text).not.toContain('车辆信息')
  })

  it('表单初值来自详情快照（数字按 precision 格式化显示）', async () => {
    await openDialog()

    expect(fieldInput('车牌号').value).toBe('浙C6B5P8')
    // heightPermitted 后端是 BigDecimal(5,2)，precision=2 故显示 4.50 而非 4.5
    expect(fieldInput('限高(米)').value).toBe('4.50')
    // crowdNum precision=0，不带小数
    expect(fieldInput('聚集人数').value).toBe('12')
  })
})

describe('EventEditDialog 保存', () => {
  it('未改动时保存按钮 disabled，且提示语可见', async () => {
    await openDialog()

    expect(saveButton().disabled).toBe(true)
    expect(document.body.textContent).toContain('没有需要保存的改动')
  })

  it('改一个文本字段后保存，PUT body 只含该字段', async () => {
    const success = vi.spyOn(ElMessage, 'success').mockImplementation(() => undefined as never)
    const wrapper = await openDialog()

    typeText('车身颜色', '红色')
    await flushPromises()
    expect(saveButton().disabled).toBe(false)

    await clickSave()

    expect(updateEvent).toHaveBeenCalledTimes(1)
    expect(updateEvent).toHaveBeenCalledWith(8, { vehicleColor: '红色' })
    expect(success).toHaveBeenCalledWith('修正成功')
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    success.mockRestore()
  })

  it('清空文本字段时发空串而非 null（后端 setIgnoreNullValue 会静默忽略 null）', async () => {
    await openDialog()

    typeText('车牌号', '')
    await flushPromises()
    await clickSave()

    expect(updateEvent).toHaveBeenCalledWith(8, { plateNum: '' })
  })

  it('清空数字字段时先弹确认列出字段名，取消则不发请求', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    await openDialog()

    // 必须同时做一个有效改动：数字清空只进 ignored 不进 patch，
    // 若只清数字则 patch 为空、保存按钮本就是 disabled，点击不会进保存流程
    typeText('车身颜色', '红色')
    clearNumber('聚集人数')
    await flushPromises()
    expect(saveButton().disabled).toBe(false)

    await clickSave()

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0][0]).toContain('聚集人数')
    expect(confirm.mock.calls[0][0]).toContain('不支持清空')
    expect(updateEvent).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('清空数字字段但确认继续时，patch 不含该字段（其余改动照发）', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue(CONFIRMED)
    await openDialog()

    clearNumber('聚集人数')
    typeText('车身颜色', '红色')
    await flushPromises()
    await clickSave()

    // 必须断言确认框确实弹过，否则本用例会在「clearNumber 没生效」的情况下也绿
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(updateEvent).toHaveBeenCalledWith(8, { vehicleColor: '红色' })
    confirm.mockRestore()
  })

  it('保存返回 1001 时提示事件不存在并关闭弹窗', async () => {
    updateEvent.mockRejectedValue(new BizError(1001, '事件不存在'))
    const warning = vi.spyOn(ElMessage, 'warning').mockImplementation(() => undefined as never)
    const wrapper = await openDialog()

    typeText('车身颜色', '红色')
    await flushPromises()
    await clickSave()

    expect(warning).toHaveBeenCalledWith('事件不存在或已被删除')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    expect(wrapper.emitted('saved')).toBeUndefined()
    warning.mockRestore()
  })

  it('关闭后清空快照：再打开另一条记录时表单是新值', async () => {
    const wrapper = await openDialog()

    await wrapper.setProps({ modelValue: false })
    await flushPromises()
    getEventDetail.mockResolvedValue(detail({ id: 9, plateNum: '京A12345' }))
    await wrapper.setProps({ modelValue: true, eventId: 9 })
    await flushPromises()

    expect(getEventDetail).toHaveBeenLastCalledWith(9)
    expect(fieldInput('车牌号').value).toBe('京A12345')
  })
})
