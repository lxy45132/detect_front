<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Refresh, Search } from '@element-plus/icons-vue'
import EventDetailDrawer from '@/components/EventDetailDrawer.vue'
import { useEnum } from '@/composables/useEnum'
import { useHandleRecords } from '@/composables/useHandleRecords'
import { useDictStore } from '@/stores/dict'
import { dash, textOr } from '@/utils/format'

/**
 * 预警处理记录页（规格 §3.3）。
 *
 * 只读列表：筛选 2 项（事件 ID 文本 + 处理时间区间），后端固定 `handle_time DESC, id DESC`。
 * 事件 ID 列渲染为 link 按钮，点击复用一阶段 `EventDetailDrawer`（事件已被逻辑删时后端 1001
 * 由拦截器统一提示，不特殊处理）。
 */
const dict = useDictStore()

const { form, page, size, total, rows, loading, load, search, resetForm, onPageChange, onSizeChange } =
  useHandleRecords()

const { handleStatusLabel, handleStatusTag } = useEnum()

const drawerVisible = ref(false)
const activeId = ref<number | null>(null)

// 字典先于列表：处理状态 tag 依赖 handleStatusLabel。load() 内部已对失败回退静态字典，不阻塞页面
onMounted(async () => {
  await dict.load()
  await load()
})

/** 点击事件 ID 开详情抽屉（复用一阶段组件，事件已被逻辑删时抽屉内部会提示并关闭） */
function openEventDetail(eventId: number): void {
  activeId.value = eventId
  drawerVisible.value = true
}
</script>

<template>
  <div class="page-container">
    <!-- 筛选区：仅 2 项（规格 §3.3：不做 handlerId 筛选，用户对 ID 无感知） -->
    <el-card shadow="never" class="filter-card">
      <el-form :model="form" inline label-width="76px" @submit.prevent>
        <el-form-item label="事件 ID">
          <!--
            文本框而非 el-input-number：EP 数字输入清空返 undefined（与 cleanParams null 剔除不匹配），
            中间态如 "8a" 会被 EP 静默丢弃反馈差；改文本框 + composable 内 /^\d+$/ 校验，
            非法输入不发键，用户看得到自己输错了。
          -->
          <el-input
            v-model="form.eventIdText"
            placeholder="精确匹配（纯数字）"
            clearable
            style="width: 200px"
            @keyup.enter="search"
          />
        </el-form-item>

        <el-form-item label="处理时间">
          <el-date-picker
            v-model="form.dateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 360px"
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :icon="Search" @click="search">查询</el-button>
          <el-button :icon="Refresh" @click="resetForm">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 表格区：表头不设 sortable（后端固定 handle_time DESC，前端排序是假的） -->
    <el-card shadow="never">
      <div class="table-toolbar">
        <span class="table-toolbar__title">
          处理记录
          <span class="sub-text">共 {{ total }} 条</span>
        </span>
      </div>

      <el-table v-loading="loading" :data="rows" row-key="id" stripe>
        <el-table-column prop="id" label="记录 ID" width="90" align="right" />

        <el-table-column label="事件 ID" width="100" align="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEventDetail(row.eventId)">
              #{{ row.eventId }}
            </el-button>
          </template>
        </el-table-column>

        <!-- 流转：fromStatus tag → toStatus tag；fromStatus 为 null 显破折号（首次流转无前态） -->
        <el-table-column label="流转" min-width="200" align="center">
          <template #default="{ row }">
            <el-tag
              v-if="row.fromStatus !== null"
              :type="handleStatusTag(row.fromStatus)"
              effect="light"
              size="small"
            >
              {{ handleStatusLabel(row.fromStatus) }}
            </el-tag>
            <span v-else>{{ dash(null) }}</span>
            <span class="records__arrow">→</span>
            <el-tag :type="handleStatusTag(row.toStatus)" effect="light" size="small">
              {{ handleStatusLabel(row.toStatus) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="处理人" width="140">
          <template #default="{ row }">{{ textOr(row.handlerName) }}</template>
        </el-table-column>

        <el-table-column label="处理备注" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ textOr(row.handleRemark) }}</template>
        </el-table-column>

        <!-- 后端已格式化为 yyyy-MM-dd HH:mm:ss，前端不二次转换 -->
        <el-table-column label="处理时间" width="168">
          <template #default="{ row }">{{ textOr(row.handleTime) }}</template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          :current-page="page"
          :page-size="size"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @current-change="onPageChange"
          @size-change="onSizeChange"
        />
      </div>
    </el-card>

    <!--
      事件详情抽屉复用一阶段组件（零改动）；@edited 回调无意义（本页只读，修正后不影响处理记录），
      故不接线。抽屉内部对 1001（事件已被逻辑删）已有 warning 提示 + 自动关闭分支。
    -->
    <EventDetailDrawer v-model="drawerVisible" :event-id="activeId" />
  </div>
</template>

<style scoped>
.records__arrow {
  margin: 0 6px;
  color: var(--dp-text-muted, #909399);
}
</style>
