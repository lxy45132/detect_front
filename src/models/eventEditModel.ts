import type { EventRecordDetail, EventRecordUpdate } from '@/types/api'

/** 可修正字段 = PUT /event-records/{id} 的 DTO 键（不含 handleStatus，状态流转属处理域） */
export type EditableField = keyof EventRecordUpdate

/**
 * 用 Record 而非 `Required<EventRecordUpdate>`：后者每键类型不同（string|null vs number|null），
 * 以联合键写入时 TS 要求值属于所有属性类型的交集（= null），模板里根本赋不进去。
 */
export type EditForm = Record<EditableField, string | number | null>

export interface FieldMeta {
  key: EditableField
  label: string
  /** input → el-input；number → el-input-number */
  kind: 'input' | 'number'
  min?: number
  max?: number
  /** 小数位：后端 similarity 是 Integer → 0，heightPermitted 是 BigDecimal(5,2) → 2 */
  precision?: number
  maxlength?: number
  placeholder?: string
}

export interface FieldGroup {
  key: 'common' | 'vehicle' | 'face'
  title: string
  /** 适用大类；null = 全部大类都显示 */
  eventTypes: number[] | null
  fields: FieldMeta[]
}

/**
 * 分组与约束照设计规格 §4.4 写死，共 15 个可修正字段（common 1 + vehicle 8 + face 6）。
 * 约束值一律由 FieldMeta 承载，模板不写死 —— 否则改一处要同时改模型与模板。
 */
export const EDIT_GROUPS: FieldGroup[] = [
  {
    key: 'common',
    title: '通用字段',
    eventTypes: null,
    fields: [
      { key: 'crowdNum', label: '聚集人数', kind: 'number', min: 0, precision: 0 }
    ]
  },
  {
    key: 'vehicle',
    title: '车辆信息',
    eventTypes: [200],
    fields: [
      { key: 'plateNum', label: '车牌号', kind: 'input', maxlength: 32, placeholder: '如 浙C6B5P8' },
      { key: 'vehicleType', label: '特殊车辆类别', kind: 'number', min: 0, precision: 0 },
      { key: 'vehicleNormalType', label: '车辆类别', kind: 'input', maxlength: 32 },
      { key: 'vehicleLogo', label: '车辆品牌', kind: 'input', maxlength: 64 },
      { key: 'vehicleSubLogo', label: '车辆子品牌', kind: 'input', maxlength: 64 },
      { key: 'vehicleColor', label: '车身颜色', kind: 'input', maxlength: 32 },
      { key: 'vehicleModel', label: '车辆年款', kind: 'input', maxlength: 64 },
      { key: 'heightPermitted', label: '限高(米)', kind: 'number', min: 0, precision: 2 }
    ]
  },
  {
    key: 'face',
    title: '人脸信息',
    eventTypes: [100],
    fields: [
      { key: 'name', label: '姓名', kind: 'input', maxlength: 64 },
      { key: 'cardno', label: '身份证号', kind: 'input', maxlength: 32 },
      { key: 'libName', label: '库名称', kind: 'input', maxlength: 128 },
      { key: 'similarity', label: '相似度', kind: 'number', min: 0, max: 100, precision: 0 },
      { key: 'identifyFaceUrl', label: '库底图URL', kind: 'input', maxlength: 512 },
      { key: 'visibleLightUrl', label: '可见光图URL', kind: 'input', maxlength: 512 }
    ]
  }
]

export const EDITABLE_FIELDS: FieldMeta[] = EDIT_GROUPS.flatMap((group) => group.fields)

/** 按大类取可见字段组：300 聚集与未知大类只有通用字段 */
export function visibleGroups(eventType: number | null | undefined): FieldGroup[] {
  if (eventType === null || eventType === undefined) {
    return EDIT_GROUPS.filter((group) => group.eventTypes === null)
  }
  return EDIT_GROUPS.filter(
    (group) => group.eventTypes === null || group.eventTypes.includes(eventType)
  )
}

/**
 * 宽松值 → number | null。
 * `el-input-number` 的 modelValue 只收 `number | null`（不收 string），emit 是 `number | undefined`，
 * 而表单模型是 `string | number | null`，故所有进出都过这一层归一。
 */
export function asNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isNaN(value) ? null : value
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isNaN(parsed) ? null : parsed
}

/** 详情 → 表单快照；缺失键补 null，避免 undefined 在受控组件里表现异常 */
export function toEditForm(detail: EventRecordDetail): EditForm {
  const source = detail as unknown as Record<string, unknown>
  const form = {} as EditForm
  for (const meta of EDITABLE_FIELDS) {
    const raw = source[meta.key]
    form[meta.key] = meta.kind === 'number' ? asNumber(raw as number | null) : textOrNull(raw)
  }
  return form
}

/** 全 null 表单（详情尚未装载时的初值） */
export function emptyEditForm(): EditForm {
  const form = {} as EditForm
  for (const meta of EDITABLE_FIELDS) form[meta.key] = null
  return form
}

export interface EditDiff {
  /** 只含被改动过的字段，直接作为 PUT body */
  patch: EventRecordUpdate
  /** 用户清空了数字字段但后端无法置空的字段中文名，需在提交前告知 */
  ignored: string[]
}

/** 按 kind 归一后再比较，抹平 `5` 与 `'5'`、`'  '` 与 `''` 这类无意义差异 */
function normalize(value: string | number | null | undefined, kind: FieldMeta['kind']): string | number | null {
  if (kind === 'number') return asNumber(value)
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function textOrNull(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  return String(raw)
}

/**
 * 表单 vs 详情快照 → 只发改动项。
 *
 * 对应后端事实 #1：`EventRecordService.update` 用
 * `BeanUtil.copyProperties(dto, upd, CopyOptions.create().setIgnoreNullValue(true))` 再走
 * MyBatis-Plus `updateById`（默认 NOT_NULL 策略），故 **null 字段永远进不了 SET 子句**：
 * - 文本字段要清空必须发 `''`（发 null 会被静默忽略，用户以为清了其实没清）
 * - 数字字段清空只能发 null，注定被忽略 → 前端拒发，并把字段名收进 `ignored` 让 UI 明示
 */
export function diffEditForm(source: EventRecordDetail, form: EditForm): EditDiff {
  const patch: Record<string, string | number> = {}
  const ignored: string[] = []
  const detail = source as unknown as Record<string, unknown>

  for (const meta of EDITABLE_FIELDS) {
    const next = normalize(form[meta.key], meta.kind)
    const prev = normalize(detail[meta.key] as string | number | null, meta.kind)
    if (next === prev) continue
    if (meta.kind === 'number' && next === null) {
      ignored.push(meta.label)
      continue
    }
    patch[meta.key] = next as string | number
  }

  return { patch: patch as EventRecordUpdate, ignored }
}
