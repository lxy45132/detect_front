<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getEventDetail, updateEvent } from '@/api/event'
import { BizError } from '@/api/interceptors'
import { BIZ_CODE } from '@/constants/error-code'
import {
  asNumber,
  diffEditForm,
  emptyEditForm,
  toEditForm,
  visibleGroups,
  type EditForm
} from '@/models/eventEditModel'
import type { EventRecordDetail } from '@/types/api'

/**
 * 事件修正弹窗（设计规格 §4.4）。
 *
 * 契约（Task 9 立壳时已固定，签名不变）：
 * - props  modelValue：开关；eventId：待修正的事件主键，null 时不发请求
 * - emits  update:modelValue：v-model 回写；saved：PUT 成功后通知宿主刷新
 *
 * 弹窗自己拉详情：一是行上只有列表 VO（字段不全），二是避开「抽屉里的副本可能已陈旧」。
 */
const props = defineProps<{ modelValue: boolean; eventId: number | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void; (e: 'saved'): void }>()

const detail = ref<EventRecordDetail | null>(null)
const form = ref<EditForm>(emptyEditForm())
const loading = ref(false)
const saving = ref(false)

const groups = computed(() => visibleGroups(detail.value?.eventType))

/**
 * 实时算 diff 驱动「保存」按钮：patch 为空即禁用 —— 这是首要交互，
 * `ElMessage.info` 只是程序化调用时的兜底。
 */
const diff = computed(() =>
  detail.value ? diffEditForm(detail.value, form.value) : { patch: {}, ignored: [] }
)
const canSave = computed(() => Object.keys(diff.value.patch).length > 0)

async function fetchDetail(id: number): Promise<void> {
  loading.value = true
  try {
    const data = await getEventDetail(id)
    detail.value = data
    form.value = toEditForm(data)
  } catch (error) {
    detail.value = null
    form.value = emptyEditForm()
    if (error instanceof BizError && error.code === BIZ_CODE.EVENT_NOT_FOUND) {
      ElMessage.warning('事件不存在或已被删除')
      close()
    }
  } finally {
    loading.value = false
  }
}

function close(): void {
  emit('update:modelValue', false)
}

/**
 * 数字控件**不能用 v-model**（后端事实 #4）：`el-input-number` 的 modelValue 是
 * `number | null`（不收 string），emit 是 `number | undefined`，而表单模型是
 * `string | number | null`，故走 `:model-value="asNumber(...)"` + 显式回写。
 */
function onNumberInput(key: keyof EditForm, value: number | undefined): void {
  form.value[key] = value ?? null
}

async function handleSave(): Promise<void> {
  if (!detail.value || saving.value) return

  const { patch, ignored } = diffEditForm(detail.value, form.value)
  if (Object.keys(patch).length === 0) {
    ElMessage.info('没有需要保存的改动')
    return
  }

  // 数字字段清空发 null 会被后端 setIgnoreNullValue(true) 静默忽略，
  // 必须先告知用户「这些字段不会被清空」，由他决定是否继续保存其余改动
  if (ignored.length > 0) {
    try {
      await ElMessageBox.confirm(
        `以下数字字段不支持清空，将被忽略：${ignored.join('、')}。是否继续保存其余改动？`,
        '部分改动不会生效',
        { type: 'warning', confirmButtonText: '继续保存', cancelButtonText: '取消' }
      )
    } catch {
      return // 用户取消
    }
  }

  saving.value = true
  try {
    await updateEvent(detail.value.id, patch)
    ElMessage.success('修正成功')
    emit('saved')
    close()
  } catch (error) {
    if (error instanceof BizError && error.code === BIZ_CODE.EVENT_NOT_FOUND) {
      ElMessage.warning('事件不存在或已被删除')
      close()
    }
    // 其余错误提示已由拦截器统一弹出，这里不重复弹
  } finally {
    saving.value = false
  }
}

watch(
  () => [props.modelValue, props.eventId] as const,
  ([visible, id]) => {
    if (visible && id !== null) {
      void fetchDetail(id)
    } else if (!visible) {
      // 关闭即清空：下次打开不闪现上一条记录的表单值
      detail.value = null
      form.value = emptyEditForm()
    }
  },
  { immediate: true }
)
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="eventId === null ? '修正事件信息' : `修正事件 #${eventId}`"
    width="640px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-loading="loading">
      <el-form v-if="detail" label-width="110px" size="default" @submit.prevent>
        <template v-for="group in groups" :key="group.key">
          <el-divider content-position="left">{{ group.title }}</el-divider>
          <el-row :gutter="12">
            <el-col v-for="meta in group.fields" :key="meta.key" :span="12">
              <el-form-item :label="meta.label">
                <el-input-number
                  v-if="meta.kind === 'number'"
                  :model-value="asNumber(form[meta.key])"
                  :min="meta.min"
                  :max="meta.max"
                  :precision="meta.precision"
                  :controls="false"
                  class="edit__control"
                  @update:model-value="onNumberInput(meta.key, $event)"
                />
                <el-input
                  v-else
                  v-model="form[meta.key]"
                  :maxlength="meta.maxlength"
                  :placeholder="meta.placeholder ?? '留空表示不修改'"
                  clearable
                />
              </el-form-item>
            </el-col>
          </el-row>
        </template>
      </el-form>

      <el-empty v-else-if="!loading" description="暂无可修正的字段" />
    </div>

    <template #footer>
      <span v-if="detail && !canSave" class="sub-text edit__hint">没有需要保存的改动</span>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!canSave" @click="handleSave">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.edit__control {
  width: 100%;
}

.edit__hint {
  margin-right: 12px;
}
</style>
