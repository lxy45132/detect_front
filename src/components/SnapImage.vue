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
/**
 * 紧凑态（表格缩略图）：宽 60px 时内容区只有 58px，放不下图标 + 6 个字的「图片不可访问」
 * （12px × 6 CJK ≈ 72px），硬切会让两个占位文案看不出区别 —— 而「有图但取不到」与
 * 「本来就没图」必须可区分，否则运维会误判成「后端没存图」而查错方向。
 * 故紧凑态下隐去图标、让文案换行完整显示（完整原因仍由 title 提示承载）。
 */
const compact = computed(() => props.width < 80)
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
          :class="{ 'snap-image__fallback--compact': compact }"
          title="MinIO 桶为私有，浏览器无法直接访问；执行 mc anonymous set download myminio/detect 可开启公读"
        >
          <el-icon v-if="!compact"><Picture /></el-icon>
          <span class="snap-image__text" :class="{ 'snap-image__text--compact': compact }">
            图片不可访问
          </span>
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
      :class="{ 'snap-image__fallback--compact': compact }"
      title="该事件未上传抓拍图（Python 端图片编码失败时 snapImage 可为 null）"
    >
      <el-icon v-if="!compact"><Camera /></el-icon>
      <span class="snap-image__text" :class="{ 'snap-image__text--compact': compact }">
        无抓拍图
      </span>
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

/* 宽裕尺寸（详情抽屉大图）：图标 + 单行文案 */
.snap-image__text {
  max-width: 100%;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 紧凑态（表格缩略图）：无图标，文案换行完整显示，不被裁切成看不出区别 */
.snap-image__fallback--compact {
  gap: 0;
  padding: 0 2px;
}

.snap-image__text--compact {
  white-space: normal;
  word-break: break-all;
  text-align: center;
  line-height: 1.15;
}
</style>
