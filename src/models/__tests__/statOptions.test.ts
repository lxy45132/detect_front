import { describe, expect, it } from 'vitest'
import {
  countOfEventType,
  dailyLineOption,
  pieOption,
  taskBarOption,
  type StatChartOption
} from '@/models/statOptions'
import { EVENT_TYPE } from '@/constants/error-code'
import type { EventStat } from '@/types/api'

/**
 * `ComposeOption` 是宽联合类型，直接点属性会被 TS 拒；
 * 用两个 helper 抹平后再断言（只读，不改 option）。
 */
function firstSeries(option: StatChartOption): Record<string, unknown> {
  const series = option.series as unknown[]
  return (series?.[0] ?? {}) as Record<string, unknown>
}

function categoryAxis(option: StatChartOption): { data: string[] } {
  const axes = [option.xAxis, option.yAxis].flat() as Record<string, unknown>[]
  const hit = axes.find((axis) => axis?.type === 'category')
  return { data: (hit?.data ?? []) as string[] }
}

function stat(over: Partial<EventStat> = {}): EventStat {
  return {
    total: 1280,
    byEventType: [
      { code: 200, name: '车辆', count: 900 },
      { code: 300, name: '聚集', count: 300 },
      { code: 100, name: '人脸', count: 80 }
    ],
    byTask: [
      { task: 'license_plate', name: '车牌识别', count: 500 },
      { task: 'vehicle_type', name: '车辆类型', count: 400 }
    ],
    byDay: [
      { date: '2026-09-08', count: 600 },
      { date: '2026-09-09', count: 680 }
    ],
    ...over
  }
}

describe('pieOption', () => {
  it('series 是环形饼图（radius 42%/68%），data 由 byEventType 映射为 {name, value}', () => {
    const series = firstSeries(pieOption(stat()))

    expect(series.type).toBe('pie')
    expect(series.radius).toEqual(['42%', '68%'])
    expect(series.data).toEqual([
      expect.objectContaining({ name: '车辆', value: 900 }),
      expect.objectContaining({ name: '聚集', value: 300 }),
      expect.objectContaining({ name: '人脸', value: 80 })
    ])
  })

  it('byEventType 为空数组时 data 为空而非报错', () => {
    const series = firstSeries(pieOption(stat({ byEventType: [], total: 0 })))

    expect(series.type).toBe('pie')
    expect(series.data).toEqual([])
  })

  it('大类 name 缺失时回退 code 字面量', () => {
    const series = firstSeries(
      pieOption(stat({ byEventType: [{ code: 200, name: '', count: 3 }] }))
    )

    expect(series.data).toEqual([expect.objectContaining({ name: '200', value: 3 })])
  })
})

describe('taskBarOption', () => {
  it('category 轴 data 是 byTask 反转后的名字（横向柱图 y 轴自下而上，反转才能让最大值在顶部）', () => {
    const option = taskBarOption(stat())

    expect(firstSeries(option).type).toBe('bar')
    expect(categoryAxis(option).data).toEqual(['车辆类型', '车牌识别'])
  })

  it('name 为 null 时回退 task code', () => {
    const option = taskBarOption(
      stat({ byTask: [{ task: 'ship_plate', name: null, count: 2 }] })
    )

    expect(categoryAxis(option).data).toEqual(['ship_plate'])
  })

  it('series data 与反转后的顺序一致（柱长与类目不能错位）', () => {
    const option = taskBarOption(stat())

    expect(firstSeries(option).data).toEqual([400, 500])
  })

  it('byTask 为空时不报错', () => {
    const option = taskBarOption(stat({ byTask: [] }))

    expect(categoryAxis(option).data).toEqual([])
    expect(firstSeries(option).data).toEqual([])
  })
})

describe('dailyLineOption', () => {
  it('折线平滑、带面积、x 轴为日期', () => {
    const option = dailyLineOption(stat())
    const series = firstSeries(option)

    expect(series.type).toBe('line')
    expect(series.smooth).toBe(true)
    expect(series.areaStyle).toBeDefined()
    expect(categoryAxis(option).data).toEqual(['2026-09-08', '2026-09-09'])
    expect(series.data).toEqual([600, 680])
  })

  it('dataZoom 同时含 inside 与 slider 两项', () => {
    const zoom = dailyLineOption(stat()).dataZoom as Record<string, unknown>[]

    expect(zoom).toHaveLength(2)
    expect(zoom.map((z) => z.type)).toEqual(['inside', 'slider'])
  })

  it('天数 ≤ 40 时显示数据点符号，超过则不显示（点太密会糊成一片）', () => {
    const few = Array.from({ length: 40 }, (_v, i) => ({ date: `2026-09-${i + 1}`, count: i }))
    const many = Array.from({ length: 41 }, (_v, i) => ({ date: `2026-09-${i + 1}`, count: i }))

    expect(firstSeries(dailyLineOption(stat({ byDay: few }))).showSymbol).toBe(true)
    expect(firstSeries(dailyLineOption(stat({ byDay: many }))).showSymbol).toBe(false)
  })
})

describe('countOfEventType', () => {
  it('命中返 count，未命中返 0（看板卡片不得显示 undefined/NaN）', () => {
    const data = stat()

    expect(countOfEventType(data, EVENT_TYPE.VEHICLE)).toBe(900)
    expect(countOfEventType(data, EVENT_TYPE.CROWD)).toBe(300)
    expect(countOfEventType(data, EVENT_TYPE.FACE)).toBe(80)
    expect(countOfEventType(data, 999)).toBe(0)
    expect(countOfEventType(stat({ byEventType: [] }), EVENT_TYPE.VEHICLE)).toBe(0)
  })
})
