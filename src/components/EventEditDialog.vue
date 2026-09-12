<script setup lang="ts">
/**
 * 事件修正弹窗。
 *
 * 契约（Task 10 填充内部实现，**签名不得变**）：
 * - props  modelValue：开关；eventId：待修正的事件主键，null 时不发请求
 * - emits  update:modelValue：v-model 回写；saved：PUT 成功后通知宿主刷新
 *
 * 弹窗自己拉详情：一是行上只有列表 VO（字段不全），二是避开「抽屉里的副本可能已陈旧」。
 */
defineProps<{ modelValue: boolean; eventId: number | null }>()
defineEmits<{ (e: 'update:modelValue', value: boolean): void; (e: 'saved'): void }>()
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="修正事件信息"
    width="640px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-empty :description="eventId === null ? '未选中事件' : `事件 #${eventId} 表单尚未装载`" />
  </el-dialog>
</template>
