import type {
  BarSeriesOption,
  ComposeOption,
  DataZoomComponentOption,
  GridComponentOption,
  LegendComponentOption,
  LineSeriesOption,
  PieSeriesOption,
  TitleComponentOption,
  TooltipComponentOption
} from 'echarts'
import type { EventStat } from '@/types/api'

/**
 * 三张图的 option 类型：只声明本项目**按需注册**过的 series 与 component，
 * 用到未注册的模块 ECharts 会静默失效（不报错），故这里的联合类型同时也是注册清单的约束。
 */
export type StatChartOption = ComposeOption<
  | PieSeriesOption
  | BarSeriesOption
  | LineSeriesOption
  | TitleComponentOption
  | TooltipComponentOption
  | LegendComponentOption
  | GridComponentOption
  | DataZoomComponentOption
>

/** 超过这个天数就不显示数据点符号：点太密会糊成一片，反而看不出趋势 */
const SHOW_SYMBOL_MAX_DAYS = 40

/** 大类色板：车辆 / 聚集 / 人脸 固定配色，避免每次刷新颜色跳动 */
const EVENT_TYPE_COLOR: Record<number, string> = {
  200: '#409eff',
  300: '#e6a23c',
  100: '#67c23a'
}

/**
 * 图 1：事件大类占比（环形饼图）。
 * `byEventType` 为空时给空数组而非报错 —— 看板在「所选区间无数据」时也要能渲染。
 */
export function pieOption(stat: EventStat): StatChartOption {
  const data = (stat.byEventType ?? []).map((item) => ({
    name: item.name || String(item.code),
    value: item.count,
    itemStyle: EVENT_TYPE_COLOR[item.code] ? { color: EVENT_TYPE_COLOR[item.code] } : undefined
  }))

  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, type: 'scroll' },
    series: [
      {
        name: '事件大类',
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '46%'],
        avoidLabelOverlap: true,
        label: { formatter: '{b}\n{d}%' },
        data
      }
    ]
  }
}

/**
 * 图 2：事件子类分布（横向柱状图）。
 *
 * category 轴数据必须 **reverse**：横向柱图的 y 轴自下而上排布，
 * 不反转的话后端按 count 降序返回的结果会让最大值落在**底部**。
 * `name` 可能为 null（后端未翻译时），回退到 task code。
 */
export function taskBarOption(stat: EventStat): StatChartOption {
  const items = [...(stat.byTask ?? [])].reverse()

  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
    xAxis: { type: 'value', name: '事件数' },
    yAxis: {
      type: 'category',
      data: items.map((item) => item.name || item.task)
    },
    series: [
      {
        name: '事件子类',
        type: 'bar',
        barMaxWidth: 22,
        itemStyle: { color: '#409eff' },
        label: { show: true, position: 'right' },
        data: items.map((item) => item.count)
      }
    ]
  }
}

/**
 * 图 3：每日趋势（折线 + 面积 + dataZoom）。
 * dataZoom 同时给 `inside`（滚轮/拖拽）与 `slider`（底部滑块）两种交互。
 */
export function dailyLineOption(stat: EventStat): StatChartOption {
  const days = stat.byDay ?? []

  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 8, right: 24, top: 24, bottom: 56, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: days.map((item) => item.date)
    },
    yAxis: { type: 'value', name: '事件数' },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', start: 0, end: 100, height: 20, bottom: 8 }
    ],
    series: [
      {
        name: '每日事件数',
        type: 'line',
        smooth: true,
        showSymbol: days.length <= SHOW_SYMBOL_MAX_DAYS,
        areaStyle: { opacity: 0.18 },
        itemStyle: { color: '#409eff' },
        data: days.map((item) => item.count)
      }
    ]
  }
}

/** 从 byEventType 里取某个大类的计数，缺失返 0（看板卡片不得显示 undefined/NaN） */
export function countOfEventType(stat: EventStat, code: number): number {
  const hit = (stat.byEventType ?? []).find((item) => item.code === code)
  return hit?.count ?? 0
}
