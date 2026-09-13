<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import EventEditDialog from '@/components/EventEditDialog.vue'
import SnapImage from '@/components/SnapImage.vue'
import { getEventDetail } from '@/api/event'
import { BizError } from '@/api/interceptors'
import { useEnum } from '@/composables/useEnum'
import { useDictStore } from '@/stores/dict'
import type { EventRecordDetail } from '@/types/api'
import { dash, textOr } from '@/utils/format'

/**
 * 事件详情抽屉（设计规格 §4.3）。
 *
 * 契约（Task 9 立壳时已固定，签名不变）：
 * - props  modelValue：开关；eventId：待查详情的事件主键，null 时不发请求
 * - emits  update:modelValue：v-model 回写；edited：内部修正成功后通知宿主刷新列表
 * - expose reload()：宿主在外部完成修正后调它重拉详情，避免抽屉里看到旧值
 */
const props = defineProps<{ modelValue: boolean; eventId: number | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void; (e: 'edited'): void }>()

const dict = useDictStore()
const { priorityLabel, priorityTag, handleStatusLabel, handleStatusTag, pushStatusLabel } = useEnum()

const detail = ref<EventRecordDetail | null>(null)
const loading = ref(false)
const editVisible = ref(false)

/**
 * 事件子类 code 必须从 `sourceData.task` 取（后端事实 #2）：
 * `EventRecordDetailVO` **没有** `task` 字段（只有列表 VO 与 TodoVO 有），
 * 读 `detail.task` 恒为 undefined，子类名会整列显示破折号。
 */
const taskCode = computed<string | null>(() => {
  const raw = detail.value?.sourceData
  if (raw && typeof raw === 'object') {
    const value = (raw as Record<string, unknown>).task
    if (typeof value === 'string' && value !== '') return value
  }
  return null
})

/**
 * sourceData 展示文本：后端解析成功给对象 → 格式化 JSON；
 * 解析失败回退成字符串 → **原样展示**（对字符串调 JSON.stringify 会多一层引号与转义）。
 */
const sourceDataText = computed(() => {
  const raw = detail.value?.sourceData
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'string') return raw
  try {
    return JSON.stringify(raw, null, 2)
  } catch {
    return String(raw)
  }
})

/** 业务字段按大类动态渲染（规格 §4.3 第 4 区）；空值统一 dash，不留空白行 */
const businessFields = computed<{ label: string; value: string }[]>(() => {
  const d = detail.value
  if (!d) return []
  const fields: { label: string; value: string }[] = []

  if (d.eventType === 200) {
    fields.push(
      { label: '车牌号', value: dash(d.plateNum) },
      { label: '特殊车辆类别', value: dash(d.vehicleType) },
      { label: '车辆类别', value: dash(d.vehicleNormalType) },
      { label: '品牌', value: dash(d.vehicleLogo) },
      { label: '子品牌', value: dash(d.vehicleSubLogo) },
      { label: '颜色', value: dash(d.vehicleColor) },
      { label: '年款', value: dash(d.vehicleModel) },
      { label: '限高(米)', value: dash(d.heightPermitted) }
    )
  } else if (d.eventType === 100) {
    fields.push(
      { label: '姓名', value: dash(d.name) },
      { label: '身份证号', value: dash(d.cardno) },
      { label: '库名称', value: dash(d.libName) },
      { label: '相似度', value: dash(d.similarity) },
      { label: '库底图', value: dash(d.identifyFaceUrl) },
      { label: '可见光图', value: dash(d.visibleLightUrl) }
    )
  } else if (d.eventType === 300) {
    fields.push({ label: '聚集人数', value: dash(d.crowdNum) })
  }

  return fields
})

async function fetchDetail(id: number): Promise<void> {
  loading.value = true
  try {
    detail.value = await getEventDetail(id)
  } catch (error) {
    detail.value = null
    // 1001 = 事件不存在（可能已被他人删除）：提示并关闭，不留一个空白抽屉在那
    if (error instanceof BizError && error.code === 1001) {
      ElMessage.warning('事件不存在或已被删除')
      close()
    }
    // 其余错误提示已由拦截器统一弹出
  } finally {
    loading.value = false
  }
}

function close(): void {
  emit('update:modelValue', false)
}

function openEdit(): void {
  editVisible.value = true
}

/** 抽屉内修正成功：重拉详情（否则看到的是修改前的旧值）+ 通知宿主刷新列表 */
function onEdited(): void {
  emit('edited')
  void reload()
}

/**
 * 重拉详情（供宿主在修正保存后调用）。
 * 抽屉未打开时直接返回：否则从表格行点「修正」保存后，会对着一个用户看不见的抽屉
 * 白发一次请求；若此时事件刚被他人删除返 1001，还会在「修正成功」旁边再冒一条警告。
 */
function reload(): void {
  if (!props.modelValue || props.eventId === null) return
  void fetchDetail(props.eventId)
}

watch(
  () => [props.modelValue, props.eventId] as const,
  ([visible, id]) => {
    if (visible && id !== null) {
      void fetchDetail(id)
    } else if (!visible) {
      // 关闭即清空：否则下次打开会先闪现上一条记录的内容
      detail.value = null
    }
  },
  { immediate: true }
)

defineExpose({ reload })
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="事件详情"
    size="720px"
    :close-on-click-modal="true"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-loading="loading" class="detail">
      <template v-if="detail">
        <!-- 1. 头部：ID + 三个标签 + 抓拍时间 -->
        <div class="detail__header">
          <span class="detail__id">事件 #{{ detail.id }}</span>
          <el-tag type="primary" effect="light" size="small">
            {{ textOr(detail.eventTypeName, dict.labelOf('eventType', detail.eventType)) }}
          </el-tag>
          <el-tag :type="priorityTag(detail.priority)" effect="light" size="small">
            {{ priorityLabel(detail.priority) }}
          </el-tag>
          <el-tag :type="handleStatusTag(detail.handleStatus)" effect="light" size="small">
            {{ handleStatusLabel(detail.handleStatus) }}
          </el-tag>
          <span class="sub-text">{{ detail.snapTime }}</span>
        </div>

        <!-- 2. 抓拍图（可点击放大） -->
        <div class="detail__snap">
          <SnapImage :src="detail.snapUrl" :width="320" :height="200" preview />
        </div>

        <!-- 3. 基础信息 -->
        <el-descriptions title="基础信息" :column="2" border size="small">
          <el-descriptions-item label="设备名称">
            {{ textOr(detail.deviceName) }}
          </el-descriptions-item>
          <el-descriptions-item label="设备编号">{{ dash(detail.deviceNum) }}</el-descriptions-item>
          <el-descriptions-item label="事件大类">
            {{ textOr(detail.eventTypeName, dict.labelOf('eventType', detail.eventType)) }}
          </el-descriptions-item>
          <el-descriptions-item label="事件子类">
            {{ dict.labelOf('task', taskCode) }}
          </el-descriptions-item>
          <el-descriptions-item label="推送状态">
            {{ pushStatusLabel(detail.status) }}
          </el-descriptions-item>
          <el-descriptions-item label="命中规则">
            <template v-if="detail.hitRule">
              {{ detail.hitRule.ruleName }}
              <span class="sub-text">（{{ dict.labelOf('ruleType', detail.hitRule.ruleType) }}）</span>
            </template>
            <span v-else>未命中</span>
          </el-descriptions-item>
        </el-descriptions>

        <!-- 4. 业务字段（按大类动态） -->
        <el-descriptions
          v-if="businessFields.length"
          title="业务字段"
          :column="2"
          border
          size="small"
          class="detail__section"
        >
          <el-descriptions-item v-for="field in businessFields" :key="field.label" :label="field.label">
            {{ field.value }}
          </el-descriptions-item>
        </el-descriptions>

        <!-- 5. 检测元数据 -->
        <div class="detail__section">
          <div class="detail__section-title">检测元数据</div>
          <pre v-if="sourceDataText" class="json-pre">{{ sourceDataText }}</pre>
          <div v-else class="muted">无</div>
        </div>

        <!-- 6. 处理历史（详情 VO 内嵌，不另请 /alert-handles/{eventId}/history） -->
        <div class="detail__section">
          <div class="detail__section-title">处理历史</div>
          <el-timeline v-if="detail.handleHistory.length">
            <el-timeline-item
              v-for="(item, index) in detail.handleHistory"
              :key="index"
              :timestamp="textOr(item.handleTime)"
              placement="top"
            >
              <div>
                {{ textOr(item.handlerName, '未知处理人') }}
                →
                {{ dict.labelOf('handleStatus', item.toStatus) }}
              </div>
              <div v-if="item.handleRemark" class="sub-text">{{ item.handleRemark }}</div>
            </el-timeline-item>
          </el-timeline>
          <div v-else class="muted">暂无处理记录</div>
        </div>
      </template>

      <el-empty v-else-if="!loading" description="暂无详情数据" />
    </div>

    <!-- 7. 底部操作 -->
    <template #footer>
      <el-button type="primary" :disabled="!detail" @click="openEdit">修正</el-button>
      <el-button @click="close">关闭</el-button>
    </template>

    <EventEditDialog v-model="editVisible" :event-id="eventId" @saved="onEdited" />
  </el-drawer>
</template>

<style scoped>
.detail__header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.detail__id {
  font-size: 16px;
  font-weight: 600;
}

.detail__snap {
  margin-bottom: 16px;
}

.detail__section {
  margin-top: 16px;
}

.detail__section-title {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
}
</style>
