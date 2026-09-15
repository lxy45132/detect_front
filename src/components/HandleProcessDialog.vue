<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { batchProcess, processEvent } from '@/api/handle'
import { useEnum } from '@/composables/useEnum'
import { HANDLE_STATUS } from '@/constants/error-code'
import {
  allowedTargets,
  allowedTargetsForAny,
  canTransition
} from '@/models/handleStatusMachine'
import type { BatchHandleResult, TodoItem } from '@/types/api'

/**
 * 预警状态流转弹窗（规格 §3.2）。
 *
 * **契约**（页面按此接线）：
 * - props  modelValue：开关；events：待流转的行（单条 = 长度 1，比规格 §3.2 的 `mode` prop 更简，
 *   由 events.length 推导单/批模式）；presetTarget：预选目标态（可选，非法值自动忽略）
 * - emits  update:modelValue：v-model 回写；processed：单条成功即发，批量在用户关闭结果视图时发
 *
 * 弹窗自持 API 调用（与 `EventEditDialog` 一致），成功后 emit 通知宿主刷新列表。
 * 错误提示由 axios 拦截器统一弹，本组件不重复弹。
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    events: TodoItem[]
    presetTarget?: number | null
  }>(),
  { presetTarget: null }
)
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'processed'): void
}>()

const { handleStatusLabel } = useEnum()

/** 当前选中的目标态；null 表示未选（提交按钮据此禁用） */
const target = ref<number | null>(null)
const remark = ref('')
/**
 * 同步置位的提交闸 —— 一阶段登录页连点缺陷的教训：
 * 只依赖异步 API 的 pending 状态挡不住同 tick 内的连点，必须在事件处理器首行同步拦截。
 */
const submitting = ref(false)
/** 批量成功后的结果视图数据；非 null 时弹窗切到结果视图 */
const result = ref<BatchHandleResult | null>(null)
/**
 * 批量已完成但尚未通知宿主的标志。幂等闸：`notifyIfBatchDone()` 只在未通知过时发一次，
 * 避免「X/ESC 关结果视图 + 关闭后 watch 分支」双路径重复 emit。
 *
 * 背景：EP dialog 默认 `showClose=true` 与 `closeOnPressEscape=true`，用户可经 X/ESC 关窗，
 * 两条路径都仅发 `update:modelValue(false)`，不经 `closeResult()` —— 若不兵底，`processed`
 * 永不发出，宿主列表不会刷新（后端已改 → 前端陈旧，再点流转就撞 3001）。
 */
const batchDone = ref(false)

/** events.length > 1 即批量模式（不单设 mode prop，规格允许此简化） */
const isBatch = computed(() => props.events.length > 1)

/**
 * 允许的目标态集合（升序）：
 * - 单条：按该行 handleStatus 查矩阵
 * - 批量：并集 —— 只要**任意一行**允许流转到该目标，按钮即可选（规格 §3.2）
 */
const allowed = computed<number[]>(() => {
  if (props.events.length === 0) return []
  if (isBatch.value) {
    return allowedTargetsForAny(props.events.map((e) => e.handleStatus))
  }
  return allowedTargets(props.events[0].handleStatus)
})

/**
 * 批量预检计数：勾选集中有多少行**当前状态**允许流转到 target（仅提示不拦截，后端仍是权威）。
 * 单条模式下这个数没意义（要么 1 要么 0，用户已在按钮上看到），故只在批量模式渲染。
 */
const eligibleCount = computed(() => {
  if (target.value === null) return 0
  return props.events.filter((e) => canTransition(e.handleStatus, target.value)).length
})

/** 目标态 radio 的三项（0 未处理不作为流转目标，矩阵也无入边） */
const targetOptions = computed(() =>
  [HANDLE_STATUS.PROCESSING, HANDLE_STATUS.RESOLVED, HANDLE_STATUS.IGNORED].map((code) => ({
    code,
    label: handleStatusLabel(code),
    disabled: !allowed.value.includes(code)
  }))
)

const canSubmit = computed(
  () => !result.value && target.value !== null && !submitting.value && props.events.length > 0
)

const dialogTitle = computed(() => {
  if (result.value) return '处理结果'
  if (isBatch.value) return `批量处理 ${props.events.length} 条预警`
  const id = props.events[0]?.id
  return id !== undefined ? `处理预警 #${id}` : '处理预警'
})

/**
 * remark 空串场景**不发键**（对齐后端 `setIgnoreNullValue(true)` 的语义 —— 发 null 会被静默忽略，
 * 与「不传」等价但阅读成本高，直接不发键更清爽）。
 */
function buildRemark(): string | undefined {
  const trimmed = remark.value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function resetState(): void {
  // presetTarget 指向非法目标时静默忽略（避免用户看到「预选了但 radio 禁用」的困惑态）
  const preset = props.presetTarget
  target.value =
    preset !== null && preset !== undefined && allowed.value.includes(preset) ? preset : null
  remark.value = ''
  result.value = null
  submitting.value = false
  batchDone.value = false
}

/** 幂等通知宿主：仅在 batchDone 为真时 emit processed，并立即复位避免重发 */
function notifyIfBatchDone(): void {
  if (!batchDone.value) return
  batchDone.value = false
  emit('processed')
}

function close(): void {
  emit('update:modelValue', false)
}

async function submit(): Promise<void> {
  // 同 tick 连点闸：submitting 只在异步 API 前置真才能挡住第二次点击（依赖 canSubmit 计算属性不够，
  // 因为 disabled 属性的 DOM 更新是异步的，同 tick 内两次点击都能通过守卫）
  if (submitting.value || !canSubmit.value || target.value === null) return

  const remarkValue = buildRemark()
  submitting.value = true
  try {
    if (isBatch.value) {
      const res = await batchProcess({
        eventIds: props.events.map((e) => e.id),
        toStatus: target.value,
        ...(remarkValue !== undefined ? { remark: remarkValue } : {})
      })
      // 批量成功切结果视图，不立即 emit processed —— 用户看完明细点关闭时才通知宿主刷新，
      // 否则明细会随弹窗关闭一并消失，用户失去「哪些行被跳过、为什么」的信息
      result.value = res
      batchDone.value = true
      // in-flight 关窗兵底：请求在飞期间宿主已把 modelValue 置 false（路由跳转、外部控制等），
      // 弹窗已不可见 → 结果视图无人能点「关闭」，此时立即补发 processed
      if (!props.modelValue) notifyIfBatchDone()
    } else {
      await processEvent({
        eventId: props.events[0].id,
        toStatus: target.value,
        ...(remarkValue !== undefined ? { remark: remarkValue } : {})
      })
      ElMessage.success('处理成功')
      emit('processed')
      close()
    }
  } catch {
    // 拦截器已弹提示；不关窗让用户可以修改 remark 或换目标态重试
  } finally {
    submitting.value = false
  }
}

/** 结果视图的关闭按钮：此时才通知宿主刷新（emit processed），随后关窗 */
function closeResult(): void {
  notifyIfBatchDone()
  close()
}

/**
 * 弹窗开关监听：只监听 `modelValue` 的跳变（false→true 重置、true→false 兵底通知 + 清空），
 * 不监听 `props.events` / `props.presetTarget` —— 宿主如果写 `:events="[row]"`（内联字面量）
 * 或传会重算的 computed，父级任何一次重渲染都会让 events 换引用 → 误触发重置 →
 * 弹窗还开着但用户已选目标态与已输入 remark 被清空（与 `EventEditDialog` 只监听标量同构）。
 */
watch(
  () => props.modelValue,
  (visible, prev) => {
    if (visible && !prev) {
      resetState()
    } else if (!visible) {
      // 关闭时兵底补发（X/ESC/取消 三路径），随后清空避免下次打开闪现旧值
      notifyIfBatchDone()
      target.value = null
      remark.value = ''
      result.value = null
      submitting.value = false
      batchDone.value = false
    }
  },
  { immediate: true }
)

/**
 * events 变了但弹窗仍开着（宿主换了一批选中行）：只失效非法 target，不动 remark。
 * 重置 target 而不重置备注 —— 备注很可能仍适用（同一批处理意图），而 target 可能已不合法。
 */
watch(allowed, (list) => {
  if (target.value !== null && !list.includes(target.value)) target.value = null
})
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="560px"
    :close-on-click-modal="false"
    :show-close="!submitting"
    :close-on-press-escape="!submitting"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <!-- 结果视图（批量成功后）：显示成功/跳过数与 skipped 明细 -->
    <div v-if="result" class="process-result">
      <el-alert
        :type="result.skipped.length === 0 ? 'success' : 'warning'"
        :closable="false"
        show-icon
      >
        <template #title>
          成功 {{ result.processed }} 条，跳过 {{ result.skipped.length }} 条
        </template>
      </el-alert>

      <div v-if="result.skipped.length > 0" class="process-result__skipped">
        <div class="sub-text process-result__skipped-title">跳过明细：</div>
        <ul class="process-result__skipped-list">
          <li v-for="item in result.skipped" :key="item.eventId">
            <span class="process-result__skipped-id">#{{ item.eventId }}</span>
            <span class="process-result__skipped-reason">{{ item.reason }}</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- 表单视图 -->
    <el-form v-else label-width="90px" size="default" @submit.prevent>
      <el-form-item label="目标状态">
        <el-radio-group v-model="target">
          <el-radio
            v-for="opt in targetOptions"
            :key="opt.code"
            :value="opt.code"
            :disabled="opt.disabled"
          >
            {{ opt.label }}
          </el-radio>
        </el-radio-group>
      </el-form-item>

      <!-- 批量预检提示：仅提示不拦截（后端仍是权威，非法行进 skipped） -->
      <el-form-item v-if="isBatch && target !== null" label=" ">
        <span class="sub-text process-hint">
          选中 {{ events.length }} 条，其中 {{ eligibleCount }} 条可流转到该目标
        </span>
      </el-form-item>

      <el-form-item label="处理备注">
        <el-input
          v-model="remark"
          type="textarea"
          :rows="3"
          :maxlength="500"
          show-word-limit
          placeholder="选填，上限 500 字"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <!-- 结果视图只留关闭按钮；表单视图为取消 + 提交 -->
      <el-button v-if="result" type="primary" @click="closeResult">关闭</el-button>
      <template v-else>
        <el-button :disabled="submitting" @click="close">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="!canSubmit"
          @click="submit"
        >
          提交
        </el-button>
      </template>
    </template>
  </el-dialog>
</template>

<style scoped>
.process-hint {
  line-height: 32px;
}

.process-result__skipped {
  margin-top: 12px;
}

.process-result__skipped-title {
  margin-bottom: 4px;
}

.process-result__skipped-list {
  margin: 0;
  padding-left: 20px;
  max-height: 240px;
  overflow-y: auto;
}

.process-result__skipped-id {
  display: inline-block;
  min-width: 60px;
  font-family: 'Consolas', 'Monaco', monospace;
  color: var(--dp-text-muted, #909399);
}

.process-result__skipped-reason {
  margin-left: 8px;
}
</style>
