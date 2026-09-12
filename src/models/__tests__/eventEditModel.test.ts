import { describe, expect, it } from 'vitest'
import {
  EDITABLE_FIELDS,
  EDIT_GROUPS,
  asNumber,
  diffEditForm,
  emptyEditForm,
  toEditForm,
  visibleGroups,
  type EditForm
} from '@/models/eventEditModel'
import type { EventRecordDetail } from '@/types/api'

/** 车辆事件详情夹具（id=8 的形状） */
function vehicleDetail(over: Partial<EventRecordDetail> = {}): EventRecordDetail {
  return {
    id: 8,
    deviceNum: 'testcar-cam01',
    deviceName: '南河湫水闸',
    eventType: 200,
    eventTypeName: '车辆',
    snapTime: '2026-09-10 08:49:50',
    snapUrl: 'http://localhost:9000/detect/a.jpg',
    name: null,
    cardno: null,
    libName: null,
    similarity: null,
    identifyFaceUrl: null,
    visibleLightUrl: null,
    plateNum: '浙C6B5P8',
    vehicleType: 3,
    vehicleNormalType: 'SLAGTRUCK',
    vehicleLogo: '东风',
    vehicleSubLogo: '天龙',
    vehicleColor: '蓝色',
    vehicleModel: '2019',
    heightPermitted: 4.5,
    crowdNum: null,
    status: 0,
    handleStatus: 0,
    priority: 1,
    hitRuleId: null,
    sourceData: { task: 'vehicle_type' },
    hitRule: null,
    handleHistory: [],
    ...over
  }
}

describe('EDITABLE_FIELDS 与分组', () => {
  it('共 15 个可修正字段（common 1 + vehicle 8 + face 6）且 key 无重复', () => {
    expect(EDITABLE_FIELDS).toHaveLength(15)
    const keys = EDITABLE_FIELDS.map((f) => f.key)
    expect(new Set(keys).size).toBe(15)
    expect(EDITABLE_FIELDS).toEqual(EDIT_GROUPS.flatMap((g) => g.fields))
  })

  it('字段约束照后端类型写死：similarity precision=0（Integer）、heightPermitted precision=2（BigDecimal）', () => {
    const similarity = EDITABLE_FIELDS.find((f) => f.key === 'similarity')
    const height = EDITABLE_FIELDS.find((f) => f.key === 'heightPermitted')
    const crowd = EDITABLE_FIELDS.find((f) => f.key === 'crowdNum')
    const plate = EDITABLE_FIELDS.find((f) => f.key === 'plateNum')

    expect(similarity).toMatchObject({ kind: 'number', min: 0, max: 100, precision: 0 })
    expect(height).toMatchObject({ kind: 'number', precision: 2 })
    expect(crowd).toMatchObject({ kind: 'number', min: 0 })
    expect(plate).toMatchObject({ kind: 'input', maxlength: 32 })
  })

  it('handleStatus 不在可修正字段里（状态流转属处理域，PUT DTO 也不接受）', () => {
    expect(EDITABLE_FIELDS.map((f) => f.key)).not.toContain('handleStatus')
  })

  it('visibleGroups 按大类分组：200→common+vehicle，100→common+face，300/null→只 common', () => {
    expect(visibleGroups(200).map((g) => g.key)).toEqual(['common', 'vehicle'])
    expect(visibleGroups(100).map((g) => g.key)).toEqual(['common', 'face'])
    expect(visibleGroups(300).map((g) => g.key)).toEqual(['common'])
    expect(visibleGroups(null).map((g) => g.key)).toEqual(['common'])
    expect(visibleGroups(undefined).map((g) => g.key)).toEqual(['common'])
  })
})

describe('toEditForm / emptyEditForm', () => {
  it('toEditForm 把 detail 的 15 个字段搬进 form', () => {
    const form = toEditForm(vehicleDetail())

    expect(form).toMatchObject({
      plateNum: '浙C6B5P8',
      vehicleType: 3,
      vehicleNormalType: 'SLAGTRUCK',
      vehicleColor: '蓝色',
      heightPermitted: 4.5,
      crowdNum: null,
      similarity: null
    })
    expect(Object.keys(form)).toHaveLength(15)
  })

  it('toEditForm 对缺失键补 null（后端某版少返字段也不至于 undefined 满天飞）', () => {
    const partial = { id: 1, eventType: 200 } as unknown as EventRecordDetail

    const form = toEditForm(partial)

    expect(Object.keys(form)).toHaveLength(15)
    expect(form.plateNum).toBeNull()
    expect(form.crowdNum).toBeNull()
  })

  it('emptyEditForm 15 个键全为 null', () => {
    const form = emptyEditForm()

    expect(Object.keys(form)).toHaveLength(15)
    expect(Object.values(form).every((v) => v === null)).toBe(true)
  })
})

describe('diffEditForm', () => {
  it('未改动的字段不进 patch', () => {
    const detail = vehicleDetail()
    const form = toEditForm(detail)

    const { patch, ignored } = diffEditForm(detail, form)

    expect(patch).toEqual({})
    expect(ignored).toEqual([])
  })

  it('改了的字段进 patch，且只含该字段', () => {
    const detail = vehicleDetail()
    const form = toEditForm(detail)
    form.vehicleColor = '红色'

    expect(diffEditForm(detail, form).patch).toEqual({ vehicleColor: '红色' })
  })

  it('文本字段清空 → patch 里是空串而非 null（后端 setIgnoreNullValue 会静默忽略 null）', () => {
    const detail = vehicleDetail()
    const form = toEditForm(detail)
    form.plateNum = ''

    expect(diffEditForm(detail, form).patch).toEqual({ plateNum: '' })
  })

  it('数字字段清空 → 不进 patch，且字段中文名进 ignored', () => {
    const detail = vehicleDetail()
    const form = toEditForm(detail)
    form.crowdNum = null
    form.heightPermitted = null

    const { patch, ignored } = diffEditForm(detail, form)

    expect(patch).not.toHaveProperty('heightPermitted')
    expect(ignored).toContain('限高(米)')
    // crowdNum 原本就是 null，前后一致不算改动
    expect(ignored).not.toContain('聚集人数')
  })

  it('前后都是空白（"  " vs ""）视为未改', () => {
    const detail = vehicleDetail({ plateNum: '   ' })
    const form = toEditForm(detail)
    form.plateNum = ''

    expect(diffEditForm(detail, form).patch).toEqual({})
  })

  it('数字 5 与字符串 "5" 视为相同（el-input-number 与文本输入的模型差异）', () => {
    const detail = vehicleDetail({ vehicleType: 5 })
    const form = toEditForm(detail) as EditForm & { vehicleType: string | number | null }
    form.vehicleType = '5'

    expect(diffEditForm(detail, form).patch).toEqual({})
  })

  it('数字真改动时 patch 里是 number 而非 string', () => {
    const detail = vehicleDetail({ vehicleType: 5 })
    const form = toEditForm(detail)
    form.vehicleType = 6

    expect(diffEditForm(detail, form).patch).toEqual({ vehicleType: 6 })
  })

  it('文本改动会 trim（避免把首尾空格写进库）', () => {
    const detail = vehicleDetail()
    const form = toEditForm(detail)
    form.vehicleColor = '  红色  '

    expect(diffEditForm(detail, form).patch).toEqual({ vehicleColor: '红色' })
  })
})

describe('asNumber', () => {
  it('空串/null/undefined/NaN 一律返 null', () => {
    expect(asNumber('')).toBeNull()
    expect(asNumber('   ')).toBeNull()
    expect(asNumber(null)).toBeNull()
    expect(asNumber(undefined)).toBeNull()
    expect(asNumber(NaN)).toBeNull()
    expect(asNumber('abc')).toBeNull()
  })

  it('数字与数字字符串正常转换，0 不丢', () => {
    expect(asNumber('12')).toBe(12)
    expect(asNumber(12)).toBe(12)
    expect(asNumber(0)).toBe(0)
    expect(asNumber('0')).toBe(0)
    expect(asNumber(4.5)).toBe(4.5)
  })
})
