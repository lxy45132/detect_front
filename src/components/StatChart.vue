<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { StatChartOption } from '@/models/statOptions'

/**
 * 按需引入并**模块级注册**（幂等：多次 import 只注册一次）。
 *
 * `AxisPointerComponent` 必须显式注册 —— 缺了它 `tooltip.axisPointer.type = 'shadow'`
 * 会静默退化成无阴影指示器，不报错，只是效果不对，很难查。
 */
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer
])

const props = withDefaults(
  defineProps<{ option: StatChartOption; height?: string }>(),
  { height: '320px' }
)

const container = ref<HTMLDivElement>()
/**
 * 实例存 shallowRef：深层 reactive 代理会让每次 setOption 慢一个数量级
 * （ECharts 实例内部有大量循环引用结构）。
 */
const chart = shallowRef<echarts.ECharts>()

/** 单图为空时自己也兜一次底，不依赖页面判断（页面另有整体空态） */
const isEmpty = computed(() => {
  const series = (props.option as { series?: unknown }).series
  const first = Array.isArray(series) ? series[0] : series
  const data = (first as { data?: unknown[] } | undefined)?.data
  return !Array.isArray(data) || data.length === 0
})

function render(): void {
  if (!chart.value) return
  // 第二参 notMerge = true：数据从 12 天变成 5 天时，不 notMerge 会残留旧点
  chart.value.setOption(props.option, true)
}

function handleResize(): void {
  chart.value?.resize()
}

onMounted(() => {
  if (container.value) {
    chart.value = echarts.init(container.value)
    render()
  }
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  // 不移除监听 + dispose 会泄漏实例：反复进出看板会累积
  window.removeEventListener('resize', handleResize)
  chart.value?.dispose()
  chart.value = undefined
})

// 不用 deep: true —— option 每次都是新对象，浅比较足够；deep 会遍历整个 option 树
watch(
  () => props.option,
  () => render()
)

// 空态与非空态切换时容器尺寸变过（v-show），需要重算一次
watch(isEmpty, async () => {
  await nextTick()
  handleResize()
})
</script>

<template>
  <div class="stat-chart" :style="{ height }">
    <el-empty v-if="isEmpty" class="stat-chart__empty" description="暂无数据" :image-size="60" />
    <div v-show="!isEmpty" ref="container" class="stat-chart__canvas"></div>
  </div>
</template>

<style scoped>
.stat-chart {
  position: relative;
  width: 100%;
}

.stat-chart__canvas {
  width: 100%;
  height: 100%;
}

.stat-chart__empty {
  height: 100%;
  padding: 0;
}
</style>
