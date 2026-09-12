<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <el-card shadow="never">
    <el-empty
      :description="`「${route.meta.title ?? '该'}」模块尚未实现，详见 docs/IMPLEMENTATION_LOG.md 未完成清单`"
    />
  </el-card>
</template>
