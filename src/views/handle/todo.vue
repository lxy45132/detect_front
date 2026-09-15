<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Refresh, Search,SetUp } from '@element-plus/icons-vue'
import EventDetailDrawer from '@/components/EventDetailDrawer.vue'
import HandleProcessDialog from '@/components/HandleProcessDialog.vue'
import SnapImage from '@/components/SnapImage.vue'
import { useEnum } from '@/composables/useEnum'
import { useTodoQuery } from '@/composables/useTodoQuery'
import { HANDLE_STATUS } from '@/constants/error-code'
import { allowedTargets } from '@/models/handleStatusMachine'
import { useDictStore } from '@/stores/dict'
import type { TodoItem } from '@/types/api'
import { dash, textOr } from '@/utils/format'

/**
 * 目标态 code → 动作动词（视图内常量）。
 *
 * 字典只提供状态**中文名**（「处理中」「已处理」「误报忽略」），不提供**动作动词**
 * （「开始处理」「标记已解决」「误报忽略」）—— 前者是名词描述，后者是操作指令，语义不同。
 * 硬编码在视图内而非 useEnum：只有本视图需要，避免污染全局枚举层。
 */
const ACTION_LABEL: Record<number, string> = {
  [HANDLE_STATUS.PROCESSING]: '开始处理',
  [HANDLE_STATUS.RESOLVED]: '标记已解决',
  [HANDLE_STATUS.IGNORED]: '误报忽略'
}

const dict = useDictStore()

const {
  form,
  page,
  size,
  total,
  rows,
  selection,
  loading,
  load,
  search,
  resetForm,
  onPageChange,
  onSizeChange,
  onSelectionChange,
  reloadCurrent,
  reloadAfterBatch
} = useTodoQuery()

const { priorityLabel, priorityTag, handleStatusLabel, handleStatusTag } = useEnum()

const drawerVisible = ref(false)
const activeId = ref<number | null>(null)

const processVisible = ref(false)
/** 弹窗当前承载的行；单条 = 长度 1，批量 = 勾选集 */
const processEvents = ref<TodoItem[]>([])
/** 弹窗预选目标态；单条从操作列按钮传入，批量为 null（用户在弹窗内选） */
const processPresetTarget = ref<number | null>(null)
/**
 * 记录本次弹窗是单条还是批量模式 —— `@processed` 回调据此路由到 `reloadCurrent`/`reloadAfterBatch`。
 * 不从 `processEvents.length` 推导：单条流转后 processEvents 仍持有该行（弹窗未清），
 * 长度信息在关窗瞬间不可靠；显式记录模式最稳。
 */
const processIsBatch = ref(false)

/** el-table row-click 回传的列信息（只取用得到的字段） */
interface ClickedColumn {
  type?: string
}

// 字典先于列表：下拉选项与 code→中文翻译都靠它。load() 内部已对失败回退静态字典，不阻塞页面
onMounted(async () => {
  await dict.load()
  await load()
})

function openDetail(row: TodoItem): void {
  activeId.value = row.id
  drawerVisible.value = true
}

/**
 * 整行点击开详情，但点勾选列时不开。
 * 操作列的所有按钮已各自 `@click.stop` 从事件层阻断冒泡，
 * 故不需要再按列的中文标题判断（依赖显示文案太脆，改文案或国际化就会静默失效）。
 */
function onRowClick(row: TodoItem, column: ClickedColumn): void {
  if (column?.type === 'selection') return
  openDetail(row)
}

/** 单条流转：从操作列按钮进入，预选目标态省去用户在弹窗内再点一次 */
function openProcess(row: TodoItem, target: number): void {
  processEvents.value = [row]
  processPresetTarget.value = target
  processIsBatch.value = false
  processVisible.value = true
}

/** 批量流转：从工具栏进入，不预选目标态（勾选集可能混合状态，交给弹窗内并集判断） */
function openBatch(): void {
  if (selection.value.length === 0) return
  processEvents.value = [...selection.value]
  processPresetTarget.value = null
  processIsBatch.value = true
  processVisible.value = true
}

/**
 * 弹窗处理成功回调：
 * - 单条 → `reloadCurrent()`：保页码回查（本页可能少 1 行或行数不变，末页收敛在 composable 内处理）
 * - 批量 → `reloadAfterBatch()`：清勾选 + 回第 1 页（跨页流转后原页码无意义）
 *
 * 成功提示由弹窗内部单点负责，这里**不得再弹一次**。
 */
function onProcessed(): void {
  if (processIsBatch.value) {
    void reloadAfterBatch()
  } else {
    void reloadCurrent()
  }
}
</script>

<template>
  <div class="page-container">
    <!-- 筛选区：inline 表单，4 项（无 handleStatus —— 待办接口语义固定 {0,1}） -->
    <el-card shadow="never" class="filter-card">
      <el-form :model="form" inline label-width="76px" @submit.prevent>
        <el-form-item label="优先级">
          <el-select v-model="form.priority" placeholder="全部" clearable style="width: 130px">
            <el-option
              v-for="item in dict.priorityOptions"
              :key="String(item.code)"
              :label="item.name"
              :value="item.code"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="事件大类">
          <el-select v-model="form.eventType" placeholder="全部" clearable style="width: 150px">
            <el-option
              v-for="item in dict.eventTypeOptions"
              :key="String(item.code)"
              :label="item.name"
              :value="item.code"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="设备编号">
          <el-input
            v-model="form.deviceNum"
            placeholder="全部"
            clearable
            style="width: 170px"
            @keyup.enter="search"
          />
        </el-form-item>

        <el-form-item label="抓拍时间">
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

    <!-- 表格区 -->
    <el-card shadow="never">
      <div class="table-toolbar">
        <span class="table-toolbar__title">
          预警待办
          <span class="sub-text">共 {{ total }} 条，已选 {{ selection.length }} 条</span>
        </span>
        <div class="table-toolbar__actions">
          <el-button
            type="primary"
            plain
            :icon="SetUp"
            :disabled="selection.length === 0"
            @click="openBatch"
          >
            批量处理
          </el-button>
        </div>
      </div>

      <!--
        表头刻意不设 sortable：后端固定 handle_status ASC + priority DESC + snap_time DESC（紧急置顶），
        前端排序是假的，设了会误导用户。reserve-selection + row-key 让跳页后已勾选项不丢。
      -->
      <el-table
        v-loading="loading"
        :data="rows"
        row-key="id"
        stripe
        @selection-change="onSelectionChange"
        @row-click="onRowClick"
      >
        <el-table-column type="selection" width="46" reserve-selection align="center" />

        <el-table-column label="抓拍图" width="86" align="center">
          <template #default="{ row }">
            <!-- 缩略图可点击放大；@click.stop 阻断冒泡避免同时触发 row-click 开抽屉 -->
            <div @click.stop>
              <SnapImage :src="row.snapUrl" :width="60" :height="40" preview />
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="id" label="ID" width="76" align="right" />

        <el-table-column label="设备" min-width="150">
          <template #default="{ row }">
            <div>{{ textOr(row.deviceName, row.deviceNum) }}</div>
            <div v-if="row.deviceName" class="sub-text">{{ row.deviceNum }}</div>
          </template>
        </el-table-column>

        <el-table-column label="事件类型" min-width="140">
          <template #default="{ row }">
            <div>{{ textOr(row.eventTypeName, dict.labelOf('eventType', row.eventType)) }}</div>
            <div class="sub-text">{{ dict.labelOf('task', row.task) }}</div>
          </template>
        </el-table-column>

        <el-table-column label="车牌" width="110">
          <template #default="{ row }">{{ dash(row.plateNum) }}</template>
        </el-table-column>

        <el-table-column label="人数" width="76" align="right">
          <template #default="{ row }">{{ dash(row.crowdNum) }}</template>
        </el-table-column>

        <!-- 后端已格式化为 yyyy-MM-dd HH:mm:ss，前端不二次转换 -->
        <el-table-column prop="snapTime" label="抓拍时间" width="168" />

        <el-table-column label="优先级" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="priorityTag(row.priority)" effect="light" size="small">
              {{ priorityLabel(row.priority) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="处理状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="handleStatusTag(row.handleStatus)" effect="light" size="small">
              {{ handleStatusLabel(row.handleStatus) }}
            </el-tag>
          </template>
        </el-table-column>

        <!-- todo VO 直接给规则名（hitRuleName），不像列表页只有 hitRuleId 需要显 tag -->
        <el-table-column label="命中规则" min-width="140">
          <template #default="{ row }">{{ textOr(row.hitRuleName) }}</template>
        </el-table-column>

        <el-table-column label="操作" width="240" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="openDetail(row)">详情</el-button>
            <!--
              矩阵驱动的动态按钮：从 allowedTargets(row.handleStatus) 取合法目标态，
              未处理(0) → [开始处理, 误报忽略]；处理中(1) → [标记已解决, 误报忽略]；
              终态(2/3) → []（无按钮，只剩详情）
            -->
            <el-button
              v-for="t in allowedTargets(row.handleStatus)"
              :key="t"
              link
              type="primary"
              @click.stop="openProcess(row, t)"
            >
              {{ ACTION_LABEL[t] }}
            </el-button>
          </template>
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

    <EventDetailDrawer v-model="drawerVisible" :event-id="activeId" @edited="load" />
    <HandleProcessDialog
      v-model="processVisible"
      :events="processEvents"
      :preset-target="processPresetTarget"
      @processed="onProcessed"
    />
  </div>
</template>
