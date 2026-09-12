<script setup lang="ts">
/**
 * 事件详情抽屉。
 *
 * 契约（Task 10 填充内部实现，**签名不得变**）：
 * - props  modelValue：开关；eventId：待查详情的事件主键，null 时不发请求
 * - emits  update:modelValue：v-model 回写；edited：内部修正成功后通知宿主刷新列表
 * - expose reload()：宿主在外部完成修正后调它重拉详情，避免抽屉里看到旧值
 */
defineProps<{ modelValue: boolean; eventId: number | null }>()
defineEmits<{ (e: 'update:modelValue', value: boolean): void; (e: 'edited'): void }>()

function reload(): void {
  /* Task 10 实现：重新 GET /event-records/{id} */
}
defineExpose({ reload })
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="事件详情"
    size="720px"
    :close-on-click-modal="true"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-empty :description="eventId === null ? '未选中事件' : `事件 #${eventId} 详情尚未装载`" />
  </el-drawer>
</template>
