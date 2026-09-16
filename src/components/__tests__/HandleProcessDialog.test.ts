import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ElMessage } from 'element-plus'
import '@/test/element-plus'
import HandleProcessDialog from '@/components/HandleProcessDialog.vue'
import { HANDLE_STATUS } from '@/constants/error-code'
import type { BatchHandleResult, TodoItem } from '@/types/api'

const { processEvent, batchProcess } = vi.hoisted(() => ({
  processEvent: vi.fn(),
  batchProcess: vi.fn()
}))

vi.mock('@/api/handle', () => ({ processEvent, batchProcess }))

function row(id: number, handleStatus: number): TodoItem {
  return {
    id,
    deviceNum: 'dev01',
    deviceName: null,
    eventType: 200,
    eventTypeName: '车辆',
    task: 'license_plate',
    snapTime: '2026-09-10 08:12:33',
    snapUrl: null,
    plateNum: null,
    vehicleNormalType: null,
    crowdNum: null,
    handleStatus,
    priority: 0,
    hitRuleId: null,
    hitRuleName: null,
    aiCorrected: false
  }
}

/** 从 document.body 找目标态 radio 的 label 元素（EP 弹窗 teleport 到 body） */
function radioOf(label: string): HTMLLabelElement {
  const radios = [...document.body.querySelectorAll<HTMLLabelElement>('.el-radio')]
  const found = radios.find((r) =>
    (r.querySelector('.el-radio__label')?.textContent ?? '').trim().includes(label)
  )
  if (!found) throw new Error(`未找到目标态 radio「${label}」`)
  return found
}

function radioInputOf(label: string): HTMLInputElement {
  return radioOf(label).querySelector('input') as HTMLInputElement
}

function isRadioDisabled(label: string): boolean {
  // EP 在 disabled 时给 label 加 `is-disabled` class，input 也带 disabled 属性；两者同步才算真禁用
  return radioOf(label).classList.contains('is-disabled') && radioInputOf(label).disabled
}

function clickRadio(label: string): void {
  radioInputOf(label).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  radioInputOf(label).dispatchEvent(new Event('change', { bubbles: true }))
}

function buttonByText(text: string): HTMLButtonElement {
  const btn = [...document.body.querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').trim().includes(text)
  )
  if (!btn) throw new Error(`未找到按钮「${text}」`)
  return btn as HTMLButtonElement
}

async function clickButton(text: string): Promise<void> {
  buttonByText(text).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await flushPromises()
}

function remarkTextarea(): HTMLTextAreaElement {
  const ta = document.body.querySelector<HTMLTextAreaElement>('.el-textarea__inner')
  if (!ta) throw new Error('未找到备注 textarea')
  return ta
}

function typeRemark(value: string): void {
  const ta = remarkTextarea()
  ta.value = value
  ta.dispatchEvent(new Event('input', { bubbles: true }))
}

async function openDialog(props: Record<string, unknown> = {}) {
  const wrapper = mount(HandleProcessDialog, {
    props: {
      modelValue: true,
      events: [row(8, HANDLE_STATUS.PENDING)],
      ...props
    },
    attachTo: document.body
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  document.body.innerHTML = ''
  setActivePinia(createPinia())
  vi.clearAllMocks()
  processEvent.mockResolvedValue(undefined)
  batchProcess.mockResolvedValue({ processed: 0, skipped: [] } as BatchHandleResult)
})

describe('HandleProcessDialog 目标态 radio 禁用（矩阵驱动）', () => {
  it('单条未处理(0) → 「已处理」禁用，「处理中」「误报忽略」可选', async () => {
    await openDialog({ events: [row(8, HANDLE_STATUS.PENDING)] })

    expect(isRadioDisabled('处理中')).toBe(false)
    expect(isRadioDisabled('已处理')).toBe(true)
    expect(isRadioDisabled('误报忽略')).toBe(false)
  })

  it('单条处理中(1) → 「处理中」自身禁用（同状态非法），「已处理」「误报忽略」可选', async () => {
    await openDialog({ events: [row(8, HANDLE_STATUS.PROCESSING)] })

    expect(isRadioDisabled('处理中')).toBe(true)
    expect(isRadioDisabled('已处理')).toBe(false)
    expect(isRadioDisabled('误报忽略')).toBe(false)
  })

  it('批量混合 [0, 1] → 三目标都可选（并集）', async () => {
    await openDialog({
      events: [row(1, HANDLE_STATUS.PENDING), row(2, HANDLE_STATUS.PROCESSING)]
    })

    expect(isRadioDisabled('处理中')).toBe(false)
    expect(isRadioDisabled('已处理')).toBe(false)
    expect(isRadioDisabled('误报忽略')).toBe(false)
  })

  it('批量全为终态 [2, 3] → 三目标都禁用', async () => {
    await openDialog({
      events: [row(1, HANDLE_STATUS.RESOLVED), row(2, HANDLE_STATUS.IGNORED)]
    })

    expect(isRadioDisabled('处理中')).toBe(true)
    expect(isRadioDisabled('已处理')).toBe(true)
    expect(isRadioDisabled('误报忽略')).toBe(true)
  })
})

describe('HandleProcessDialog presetTarget 预选', () => {
  it('presetTarget=1 时打开即预选「处理中」', async () => {
    await openDialog({
      events: [row(8, HANDLE_STATUS.PENDING)],
      presetTarget: HANDLE_STATUS.PROCESSING
    })

    expect(radioInputOf('处理中').checked).toBe(true)
    expect(radioInputOf('已处理').checked).toBe(false)
    expect(radioInputOf('误报忽略').checked).toBe(false)
  })

  it('presetTarget=null / 未传时不预选任何目标', async () => {
    await openDialog({ events: [row(8, HANDLE_STATUS.PENDING)], presetTarget: null })

    expect(radioInputOf('处理中').checked).toBe(false)
    expect(radioInputOf('已处理').checked).toBe(false)
    expect(radioInputOf('误报忽略').checked).toBe(false)
  })

  it('presetTarget 指向非法目标时不预选（矩阵不允许，避免误导用户）', async () => {
    await openDialog({
      events: [row(8, HANDLE_STATUS.PENDING)],
      presetTarget: HANDLE_STATUS.RESOLVED // 0 → 2 非法
    })

    expect(radioInputOf('已处理').checked).toBe(false)
  })
})

describe('HandleProcessDialog 批量预检计数', () => {
  it('批量 [0, 1] 选「已处理」→ 提示「选中 2 条，其中 1 条可流转」（仅处理中行计入）', async () => {
    await openDialog({
      events: [row(1, HANDLE_STATUS.PENDING), row(2, HANDLE_STATUS.PROCESSING)]
    })

    clickRadio('已处理')
    await flushPromises()

    const text = document.body.textContent ?? ''
    expect(text).toContain('选中 2 条')
    expect(text).toContain('其中 1 条可流转')
  })

  it('批量 [0, 1] 选「误报忽略」→ 提示「其中 2 条可流转」（两行都合法）', async () => {
    await openDialog({
      events: [row(1, HANDLE_STATUS.PENDING), row(2, HANDLE_STATUS.PROCESSING)]
    })

    clickRadio('误报忽略')
    await flushPromises()

    expect(document.body.textContent).toContain('其中 2 条可流转')
  })

  it('单条模式不显示预检提示（无意义）', async () => {
    await openDialog({ events: [row(8, HANDLE_STATUS.PENDING)] })

    clickRadio('处理中')
    await flushPromises()

    expect(document.body.textContent).not.toContain('选中')
    expect(document.body.textContent).not.toContain('其中')
  })
})

describe('HandleProcessDialog 单条提交', () => {
  it('remark 为空时 body 只含 {eventId, toStatus}，不含 remark 键', async () => {
    const wrapper = await openDialog({ events: [row(8, HANDLE_STATUS.PENDING)] })

    clickRadio('处理中')
    await flushPromises()
    await clickButton('提交')

    expect(processEvent).toHaveBeenCalledTimes(1)
    const body = processEvent.mock.calls[0][0] as Record<string, unknown>
    expect(body).toEqual({ eventId: 8, toStatus: HANDLE_STATUS.PROCESSING })
    expect(body).not.toHaveProperty('remark')
    expect(wrapper.emitted('processed')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('remark 有值时 body 携带该字符串', async () => {
    await openDialog({ events: [row(8, HANDLE_STATUS.PENDING)] })

    clickRadio('处理中')
    typeRemark('正在核查')
    await flushPromises()
    await clickButton('提交')

    expect(processEvent).toHaveBeenCalledWith({
      eventId: 8,
      toStatus: HANDLE_STATUS.PROCESSING,
      remark: '正在核查'
    })
  })

  it('单条成功后弹「处理成功」并关闭弹窗', async () => {
    const success = vi.spyOn(ElMessage, 'success').mockImplementation(() => undefined as never)
    const wrapper = await openDialog({ events: [row(8, HANDLE_STATUS.PENDING)] })

    clickRadio('误报忽略')
    await flushPromises()
    await clickButton('提交')

    expect(success).toHaveBeenCalledWith('处理成功')
    expect(wrapper.emitted('processed')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    success.mockRestore()
  })

  it('未选目标态时提交按钮禁用', async () => {
    await openDialog({ events: [row(8, HANDLE_STATUS.PENDING)] })

    expect(buttonByText('提交').disabled).toBe(true)
  })

  it('remark textarea maxlength=500（对齐 alert_handle_record.handle_remark 列宽）', async () => {
    await openDialog({ events: [row(8, HANDLE_STATUS.PENDING)] })

    expect(remarkTextarea().maxLength).toBe(500)
  })
})

describe('HandleProcessDialog 批量提交与结果视图', () => {
  it('批量成功 → 弹窗切结果视图显示成功/跳过数与明细，提交瞬间不 emit processed', async () => {
    batchProcess.mockResolvedValue({
      processed: 2,
      skipped: [{ eventId: 3, reason: '状态流转非法' }]
    } satisfies BatchHandleResult)
    const wrapper = await openDialog({
      events: [
        row(1, HANDLE_STATUS.PENDING),
        row(2, HANDLE_STATUS.PROCESSING),
        row(3, HANDLE_STATUS.RESOLVED)
      ]
    })

    clickRadio('误报忽略')
    await flushPromises()
    await clickButton('提交')

    expect(batchProcess).toHaveBeenCalledTimes(1)
    expect(batchProcess.mock.calls[0][0]).toMatchObject({
      eventIds: [1, 2, 3],
      toStatus: HANDLE_STATUS.IGNORED
    })
    // 提交瞬间不 emit processed（结果视图未关闭前宿主不应刷新，否则会看不到明细）
    expect(wrapper.emitted('processed')).toBeUndefined()
    // 弹窗未关
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    // 结果视图：断言完整文案（归一化空白），避免「成功 2 / 跳过 1」与「成功 1 / 跳过 2」同时命中裸数字断言
    const flat = (document.body.textContent ?? '').replace(/\s+/g, '')
    expect(flat).toContain('成功2条，跳过1条')
    expect(flat).toContain('#3')
    expect(flat).toContain('状态流转非法')
  })

  it('批量结果视图点「关闭」→ emit processed + 关闭弹窗', async () => {
    batchProcess.mockResolvedValue({ processed: 1, skipped: [] } satisfies BatchHandleResult)
    const wrapper = await openDialog({
      events: [row(1, HANDLE_STATUS.PENDING), row(2, HANDLE_STATUS.PROCESSING)]
    })

    clickRadio('误报忽略')
    await flushPromises()
    await clickButton('提交')
    expect(wrapper.emitted('processed')).toBeUndefined()

    await clickButton('关闭')

    expect(wrapper.emitted('processed')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('批量后端全跳过（processed=0）时结果视图仍展示 skipped 明细（前端矩阵与后端实时态可能不一致）', async () => {
    batchProcess.mockResolvedValue({
      processed: 0,
      skipped: [
        { eventId: 1, reason: '状态流转非法' },
        { eventId: 2, reason: '事件不存在' }
      ]
    } satisfies BatchHandleResult)
    await openDialog({
      events: [row(1, HANDLE_STATUS.PENDING), row(2, HANDLE_STATUS.PROCESSING)]
    })

    clickRadio('误报忽略')
    await flushPromises()
    await clickButton('提交')

    // 完整文案断言（归一化空白）：锁定「成功 0 / 跳过 2」的写向，避免裸数字断言无法捕捉「写反」缺陷
    const flat = (document.body.textContent ?? '').replace(/\s+/g, '')
    expect(flat).toContain('成功0条，跳过2条')
    expect(flat).toContain('#1')
    expect(flat).toContain('#2')
    expect(flat).toContain('事件不存在')
  })
})

describe('HandleProcessDialog 失败与防连点', () => {
  it('单条提交失败 → 不关窗、不 emit processed、不重复弹提示（拦截器已弹）', async () => {
    processEvent.mockRejectedValue(new Error('3001 状态流转非法'))
    // 未 mock element-plus 时 ElMessage.error/success 为真实函数，需先 spy 才能断言未调用
    const errSpy = vi.spyOn(ElMessage, 'error').mockImplementation(() => undefined as never)
    const okSpy = vi.spyOn(ElMessage, 'success').mockImplementation(() => undefined as never)
    const wrapper = await openDialog({ events: [row(8, HANDLE_STATUS.PENDING)] })

    clickRadio('处理中')
    await flushPromises()
    await clickButton('提交')

    expect(wrapper.emitted('processed')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(errSpy).not.toHaveBeenCalled()
    expect(okSpy).not.toHaveBeenCalled()
    errSpy.mockRestore()
    okSpy.mockRestore()
  })

  it('批量提交失败 → 不切结果视图、不关窗、不 emit', async () => {
    batchProcess.mockRejectedValue(new Error('网络错误'))
    const wrapper = await openDialog({
      events: [row(1, HANDLE_STATUS.PENDING), row(2, HANDLE_STATUS.PROCESSING)]
    })

    clickRadio('误报忽略')
    await flushPromises()
    await clickButton('提交')

    expect(wrapper.emitted('processed')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    // 仍在表单视图（结果视图未出现）
    expect(document.body.textContent).not.toContain('跳过')
  })

  it('提交中同 tick 连点两次 → 只发 1 条请求（submitting 闸防连点）', async () => {
    let resolveFn!: () => void
    processEvent.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveFn = resolve
      })
    )
    await openDialog({ events: [row(8, HANDLE_STATUS.PENDING)] })

    clickRadio('处理中')
    await flushPromises()

    // 同 tick 连点两次（不等 flushPromises）
    const btn = buttonByText('提交')
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(processEvent).toHaveBeenCalledTimes(1)
    resolveFn()
    await flushPromises()
  })
})

describe('HandleProcessDialog 状态重置', () => {
  it('关闭再打开 → target / remark / result 全部重置', async () => {
    batchProcess.mockResolvedValue({
      processed: 1,
      skipped: [{ eventId: 2, reason: '状态流转非法' }]
    } satisfies BatchHandleResult)
    const wrapper = await openDialog({
      events: [row(1, HANDLE_STATUS.PENDING), row(2, HANDLE_STATUS.PROCESSING)]
    })

    clickRadio('误报忽略')
    typeRemark('第一次备注')
    await flushPromises()
    await clickButton('提交')
    // 此时在结果视图
    expect(document.body.textContent).toContain('跳过')

    // 关闭
    await clickButton('关闭')
    await wrapper.setProps({ modelValue: false })
    await flushPromises()

    // 重新打开（不传 presetTarget）
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    // target 未预选
    expect(radioInputOf('处理中').checked).toBe(false)
    expect(radioInputOf('已处理').checked).toBe(false)
    expect(radioInputOf('误报忽略').checked).toBe(false)
    // remark 清空
    expect(remarkTextarea().value).toBe('')
    // 结果视图不再显示
    expect(document.body.textContent).not.toContain('跳过')
  })

  it('切换 events 时不残留上次的 target（弹窗每次打开都从 presetTarget 起算）', async () => {
    const wrapper = await openDialog({
      events: [row(8, HANDLE_STATUS.PENDING)],
      presetTarget: HANDLE_STATUS.PROCESSING
    })
    expect(radioInputOf('处理中').checked).toBe(true)

    await wrapper.setProps({ modelValue: false })
    await flushPromises()
    await wrapper.setProps({
      modelValue: true,
      events: [row(9, HANDLE_STATUS.PROCESSING)],
      presetTarget: null
    })
    await flushPromises()

    expect(radioInputOf('处理中').checked).toBe(false)
    expect(radioInputOf('已处理').checked).toBe(false)
  })
})

describe('HandleProcessDialog 关闭路径兵底（X/ESC/空 events）', () => {
  it('批量结果视图点右上角 X 关闭 → 同样 emit processed（宿主必须刷新）', async () => {
    batchProcess.mockResolvedValue({ processed: 1, skipped: [] } satisfies BatchHandleResult)
    const wrapper = await openDialog({
      events: [row(1, HANDLE_STATUS.PENDING), row(2, HANDLE_STATUS.PROCESSING)]
    })

    clickRadio('误报忽略')
    await flushPromises()
    await clickButton('提交')
    expect(wrapper.emitted('processed')).toBeUndefined()

    // 点右上角 X（EP dialog 的 header 关闭按钮）：内部 emit update:modelValue false，
    // 宿主同步 props.modelValue=false 后 watch 分支必须兵底补发 processed
    const headerBtn = document.body.querySelector<HTMLButtonElement>('.el-dialog__headerbtn')
    expect(headerBtn).not.toBeNull()
    headerBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    await wrapper.setProps({ modelValue: false })
    await flushPromises()

    expect(wrapper.emitted('processed')).toHaveLength(1)
  })

  it('批量结果视图宿主外部关窗（路由跳转等）→ watch 分支同样兵底 emit processed', async () => {
    batchProcess.mockResolvedValue({ processed: 2, skipped: [] } satisfies BatchHandleResult)
    const wrapper = await openDialog({
      events: [row(1, HANDLE_STATUS.PENDING), row(2, HANDLE_STATUS.PROCESSING)]
    })

    clickRadio('误报忽略')
    await flushPromises()
    await clickButton('提交')
    expect(wrapper.emitted('processed')).toBeUndefined()

    // 宿主不经弹窗内部按钮，直接外部关窗
    await wrapper.setProps({ modelValue: false })
    await flushPromises()

    expect(wrapper.emitted('processed')).toHaveLength(1)
  })

  it('events 为空时三项目标态全禁用且提交按钮禁用', async () => {
    await openDialog({ events: [] })

    expect(isRadioDisabled('处理中')).toBe(true)
    expect(isRadioDisabled('已处理')).toBe(true)
    expect(isRadioDisabled('误报忽略')).toBe(true)
    expect(buttonByText('提交').disabled).toBe(true)
  })

  it('提交中时右上角 X 隐藏（:show-close="!submitting"），避免 in-flight 关窗丢结果', async () => {
    let resolveFn!: () => void
    processEvent.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveFn = resolve
      })
    )
    await openDialog({ events: [row(8, HANDLE_STATUS.PENDING)] })

    clickRadio('处理中')
    await flushPromises()
    // 弹窗打开时 X 可见
    expect(document.body.querySelector('.el-dialog__headerbtn')).not.toBeNull()

    buttonByText('提交').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    // 提交中：headerbtn 隐藏（EP 对 show-close=false 直接不渲染按钮）
    expect(document.body.querySelector('.el-dialog__headerbtn')).toBeNull()

    resolveFn()
    await flushPromises()
  })
})
