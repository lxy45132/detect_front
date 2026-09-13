<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, Delete, Download, Refresh, Search } from '@element-plus/icons-vue'
import EventDetailDrawer from '@/components/EventDetailDrawer.vue'
import EventEditDialog from '@/components/EventEditDialog.vue'
import SnapImage from '@/components/SnapImage.vue'
import { useEventQuery } from '@/composables/useEventQuery'
import { useEnum } from '@/composables/useEnum'
import { useDictStore } from '@/stores/dict'
import type { EventRecordItem } from '@/types/api'
import { dash, textOr } from '@/utils/format'

const dict = useDictStore()

const {
  form,
  page,
  size,
  total,
  rows,
  selection,
  loading,
  exporting,
  taskOptions,
  load,
  search,
  resetForm,
  onEventTypeChange,
  onPageChange,
  onSizeChange,
  onSelectionChange,
  removeOne,
  removeMany,
  exportAs
} = useEventQuery()

const { priorityLabel, priorityTag, handleStatusLabel, handleStatusTag } = useEnum()

const drawerVisible = ref(false)
const dialogVisible = ref(false)
const activeId = ref<number | null>(null)
const drawerRef = ref<InstanceType<typeof EventDetailDrawer> | null>(null)

/** el-table row-click 回传的列信息（只取用得到的字段） */
interface ClickedColumn {
  type?: string
}

// 字典先于列表：下拉选项与 code→中文翻译都靠它。load() 内部已对失败回退静态字典，不阻塞页面
onMounted(async () => {
  await dict.load()
  await load()
})

function openDetail(row: EventRecordItem): void {
  activeId.value = row.id
  drawerVisible.value = true
}

function openEdit(row: EventRecordItem): void {
  activeId.value = row.id
  dialogVisible.value = true
}

/**
 * 整行点击开详情，但点勾选列时不开。
 * 操作列的三个按钮已各自 `@click.stop` 从事件层阻断冒泡，
 * 故不需要再按列的中文标题判断（依赖显示文案太脆，改文案或国际化就会静默失效）。
 */
function onRowClick(row: EventRecordItem, column: ClickedColumn): void {
  if (column?.type === 'selection') return
  openDetail(row)
}

/**
 * 修正成功（页面级弹窗）：刷新列表 + 重拉抽屉详情。
 * 「修正成功」提示由弹窗内部单点负责，这里**不得再弹一次**（否则两条相同绿提示叠在一起）。
 */
function onSaved(): void {
  void load()
  drawerRef.value?.reload()
}

async function onDelete(row: EventRecordItem): Promise<void> {
  if (await removeOne(row.id)) {
    ElMessage.success(`已删除事件 #${row.id}`)
  }
}

/** 批量删除跨多行、影响面大，用 ElMessageBox 重确认（单行删除才用就地的气泡确认） */
async function onBatchDelete(): Promise<void> {
  const ids = selection.value.map((row) => row.id)
  if (ids.length === 0) return
  try {
    await ElMessageBox.confirm(`确认删除选中的 ${ids.length} 条事件记录？`, '批量删除', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消'
    })
  } catch {
    return // 用户取消
  }
  if (await removeMany(ids)) {
    ElMessage.success(`已删除 ${ids.length} 条事件记录`)
  }
}

async function onExport(format: 'xlsx' | 'csv'): Promise<void> {
  if (await exportAs(format)) {
    ElMessage.success('导出完成，请查看浏览器下载')
  }
}
</script>

<template>
  <div class="page-container">
    <!-- 筛选区：inline 表单，窄屏自动换行；输入框回车即查 -->
    <el-card shadow="never" class="filter-card">
      <el-form :model="form" inline label-width="76px" @submit.prevent>
        <el-form-item label="设备编号">
          <el-input
            v-model="form.deviceNum"
            placeholder="全部"
            clearable
            style="width: 170px"
            @keyup.enter="search"
          />
        </el-form-item>

        <el-form-item label="事件大类">
          <el-select
            v-model="form.eventType"
            placeholder="全部"
            clearable
            style="width: 150px"
            @change="onEventTypeChange"
          >
            <el-option
              v-for="item in dict.eventTypeOptions"
              :key="String(item.code)"
              :label="item.name"
              :value="item.code"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="事件子类">
          <el-select v-model="form.task" placeholder="全部" clearable style="width: 170px">
            <el-option
              v-for="item in taskOptions"
              :key="item.code"
              :label="item.name"
              :value="item.code"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="处理状态">
          <el-select v-model="form.handleStatus" placeholder="全部" clearable style="width: 140px">
            <el-option
              v-for="item in dict.handleStatusOptions"
              :key="String(item.code)"
              :label="item.name"
              :value="item.code"
            />
          </el-select>
        </el-form-item>

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

        <el-form-item label="车牌号">
          <el-input
            v-model="form.plateNum"
            placeholder="模糊匹配"
            clearable
            style="width: 160px"
            @keyup.enter="search"
          />
        </el-form-item>

        <el-form-item label="关键词">
          <el-input
            v-model="form.keyword"
            placeholder="车牌或设备名"
            clearable
            style="width: 180px"
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
          事件记录
          <span class="sub-text">共 {{ total }} 条，已选 {{ selection.length }} 条</span>
        </span>
        <div class="table-toolbar__actions">
          <el-button
            type="danger"
            plain
            :icon="Delete"
            :disabled="selection.length === 0"
            @click="onBatchDelete"
          >
            批量删除
          </el-button>

          <el-dropdown trigger="click" @command="onExport">
            <el-button :icon="Download" :loading="exporting">
              导出<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="xlsx">导出 Excel（.xlsx）</el-dropdown-item>
                <el-dropdown-item command="csv">导出 CSV（.csv）</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <!--
        表头刻意不设 sortable：后端固定 ORDER BY snap_time DESC，前端排序是假的，
        设了会误导用户。reserve-selection + row-key 让跳页后已勾选项不丢。
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
            <!-- 计划要求缩略图可点击放大；用 @click.stop 阻断冒泡，避免同时触发 row-click 开抽屉 -->
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

        <el-table-column label="车型" width="110">
          <template #default="{ row }">{{ dash(row.vehicleNormalType) }}</template>
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

        <el-table-column label="命中规则" width="110" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.hitRuleId" type="warning" effect="plain" size="small">
              已命中 #{{ row.hitRuleId }}
            </el-tag>
            <span v-else>{{ dash(null) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="176" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="openDetail(row)">详情</el-button>
            <el-button link type="primary" @click.stop="openEdit(row)">修正</el-button>
            <el-popconfirm
              :title="`确认删除事件 #${row.id}？`"
              width="220"
              confirm-button-text="删除"
              cancel-button-text="取消"
              @confirm="onDelete(row)"
            >
              <template #reference>
                <el-button link type="danger" @click.stop>删除</el-button>
              </template>
            </el-popconfirm>
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

    <EventDetailDrawer
      ref="drawerRef"
      v-model="drawerVisible"
      :event-id="activeId"
      @edited="load"
    />
    <EventEditDialog v-model="dialogVisible" :event-id="activeId" @saved="onSaved" />
  </div>
</template>
