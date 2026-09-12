<script setup lang="ts">
import { computed } from 'vue'

/**
 * 抓拍图展示组件：无图 / 加载失败两态降级。
 *
 * 已知后端约束（设计规格 §3.6）：MinIO 桶 `detect` 创建时未设公读策略
 * （`OssTemplate.ensureBucket` 仅 `makeBucket`），浏览器匿名 GET snapUrl 返 **403**。
 * 故必须优雅降级：加载失败显示占位，而非破图或抛全局错误。
 * 运维侧执行 `mc anonymous set download myminio/detect` 即可恢复正常显示，无需改代码。
 */
const props = withDefaults(
  defineProps<{
    /** MinIO 抓拍图 URL，事件无抓拍图时为 null */
    src?: string | null
    width?: number
    height?: number
    /** 是否允许点击放大预览（详情抽屉开，表格缩略图关） */
    preview?: boolean
  }>(),
  { src: null, width: 60, height: 40, preview: false }
)

const hasSrc = computed(() => typeof props.src === 'string' && props.src.trim() !== '')
/** 占位容器固定尺寸：缺图时也不塌陷，避免表格行高跳动 */
const boxStyle = computed(() => ({ width: `${props.width}px`, height: `${props.height}px` }))
const previewList = computed(() => (hasSrc.value ? [props.src as string] : []))
</script>

<template>
  <div class="snap-image" :style="boxStyle">
    <el-image
      v-if="hasSrc"
      :src="src as string"
      :preview-src-list="preview ? previewList : []"
      :preview-teleported="true"
      :hide-on-click-modal="true"
      fit="cover"
      class="snap-image__img"
    >
      <template #error>
        <div
          class="snap-image__fallback"
          title="MinIO 桶为私有，浏览器无法直接访问；执行 mc anonymous set download myminio/detect 可开启公读"
        >
          <el-icon><Picture /></el-icon>
          <span class="snap-image__text">图片不可访问</span>
        </div>
      </template>
      <template #placeholder>
        <div class="snap-image__fallback">
          <el-icon class="is-loading"><Loading /></el-icon>
        </div>
      </template>
    </el-image>

    <div
      v-else
      class="snap-image__fallback"
      title="该事件未上传抓拍图（Python 端图片编码失败时 snapImage 可为 null）"
    >
      <el-icon><Camera /></el-icon>
      <span class="snap-image__text">无抓拍图</span>
    </div>
  </div>
</template>

<style scoped>
.snap-image {
  flex: 0 0 auto;
  border-radius: var(--dp-radius, 4px);
  overflow: hidden;
  background: #f2f3f5;
  border: 1px solid var(--dp-border, #e4e7ed);
}

.snap-image__img {
  display: block;
  width: 100%;
  height: 100%;
}

.snap-image__fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 100%;
  height: 100%;
  color: #c0c4cc;
  font-size: 16px;
}

/* 窄容器下文案不换行、溢出隐藏，保证 60px 缩略图不被撑破 */
.snap-image__text {
  max-width: 100%;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
}
</style>
