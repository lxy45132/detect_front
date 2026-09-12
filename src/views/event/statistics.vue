<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Refresh, Search } from '@element-plus/icons-vue'
import StatChart from '@/components/StatChart.vue'
import { getEventStatistics } from '@/api/event'
import { EVENT_TYPE } from '@/constants/error-code'
import {
  countOfEventType,
  dailyLineOption,
  pieOption,
  taskBarOption,
  type StatChartOption
} from '@/models/statOptions'
import type { EventStat } from '@/types/api'
import { DASH, percent } from '@/utils/format'

/** 空态初值：请求失败或未查询时卡片显示 0、图表显示空态，不白屏 */
const EMPTY_STAT: EventStat = { total: 0, byEventType: [], byTask: [], byDay: [] }

/**
 * daterange 的起止时刻：EP 的 `default-time` 让开始补 00:00:00、结束补 23:59:59，
 * 否则「选到 9/13」实际只查到 9/13 00:00:00，当天数据全丢。
 */
const DEFAULT_TIME: [Date, Date] = [
  new Date(2000, 0, 1, 0, 0, 0),
  new Date(2000, 0, 1, 23, 59, 59)
]

const dateRange = ref<[string, string] | null>(null)
const deviceNum = ref('')
const loading = ref(false)
const stat = ref<EventStat>(EMPTY_STAT)
/** 查询失败标记：失败时不显示「暂无数据」而显示失败提示，避免把故障当成没数据 */
const failed = ref(false)

const cards = computed(() => {
  const total = stat.value.total
  const items = [
    { label: '事件总量', count: total, code: null },
    { label: '车辆事件数', count: countOfEventType(stat.value, EVENT_TYPE.VEHICLE), code: EVENT_TYPE.VEHICLE },
    { label: '聚集事件数', count: countOfEventType(stat.value, EVENT_TYPE.CROWD), code: EVENT_TYPE.CROWD },
    { label: '人脸事件数', count: countOfEventType(stat.value, EVENT_TYPE.FACE), code: EVENT_TYPE.FACE }
  ]
  return items.map((item) => ({
    label: item.label,
    count: item.count,
    // 总量卡不算占比；total 为 0 时显示破折号而不是 NaN%
    ratio: item.code === null || total === 0 ? DASH : percent(item.count / total)
  }))
})

const pieOpt = computed<StatChartOption>(() => pieOption(stat.value))
const barOpt = computed<StatChartOption>(() => taskBarOption(stat.value))
const lineOpt = computed<StatChartOption>(() => dailyLineOption(stat.value))
const hasData = computed(() => stat.value.total > 0)

async function load(): Promise<void> {
  loading.value = true
  failed.value = false
  try {
    stat.value = await getEventStatistics({
      startTime: dateRange.value?.[0] ?? undefined,
      endTime: dateRange.value?.[1] ?? undefined,
      deviceNum: deviceNum.value.trim() || undefined
    })
  } catch {
    // 错误提示已由拦截器统一弹出；这里只把看板置为空态，不留上一次的旧数据
    stat.value = EMPTY_STAT
    failed.value = true
  } finally {
    loading.value = false
  }
}

function reset(): void {
  dateRange.value = null
  deviceNum.value = ''
  void load()
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="page-container">
    <el-card shadow="never" class="filter-card">
      <el-form inline label-width="76px" @submit.prevent>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD HH:mm:ss"
            :default-time="DEFAULT_TIME"
            style="width: 340px"
          />
        </el-form-item>
        <el-form-item label="设备编号">
          <el-input
            v-model="deviceNum"
            placeholder="全部"
            clearable
            style="width: 180px"
            @keyup.enter="load"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="load">查询</el-button>
          <el-button :icon="Refresh" @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 四张统计卡：顺序照规格 §4.5（总量 / 车辆 / 聚集 / 人脸） -->
    <el-row :gutter="16">
      <el-col v-for="card in cards" :key="card.label" :xs="12" :sm="12" :md="6">
        <el-card shadow="never" class="stat-card">
          <div class="stat-card__label">{{ card.label }}</div>
          <div class="stat-card__value">{{ card.count }}</div>
          <div class="sub-text">占比 {{ card.ratio }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card v-if="failed" shadow="never">
      <el-empty description="统计数据加载失败，请检查后端服务后重试" />
    </el-card>

    <el-card v-else-if="!hasData" shadow="never">
      <el-empty description="所选条件下暂无数据" />
    </el-card>

    <template v-else>
      <el-card shadow="never">
        <div class="table-toolbar__title chart-title">事件大类占比</div>
        <StatChart :option="pieOpt" height="320px" />
      </el-card>

      <el-card shadow="never">
        <div class="table-toolbar__title chart-title">事件子类分布</div>
        <StatChart :option="barOpt" height="360px" />
      </el-card>

      <el-card shadow="never">
        <div class="table-toolbar__title chart-title">每日趋势</div>
        <StatChart :option="lineOpt" height="320px" />
      </el-card>
    </template>
  </div>
</template>

<style scoped>
.stat-card {
  margin-bottom: 16px;
  text-align: center;
}

.stat-card__label {
  font-size: 13px;
  color: var(--dp-text-muted);
}

.stat-card__value {
  margin: 6px 0 2px;
  font-size: 26px;
  font-weight: 600;
  line-height: 1.2;
}

.chart-title {
  margin-bottom: 8px;
}
</style>
