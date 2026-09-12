import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
// 组件测试专用：注入 Element Plus 与图标（纯函数测试不付这份成本）
import '@/test/element-plus'
import SnapImage from '@/components/SnapImage.vue'

const SNAP = 'http://localhost:9000/detect/event/20260912/abc.jpg'

describe('SnapImage 无图降级', () => {
  it('src 为 null 时显示「无抓拍图」占位且不渲染 img', () => {
    const wrapper = mount(SnapImage, {
      props: { src: null, width: 60, height: 40, preview: false }
    })

    expect(wrapper.text()).toContain('无抓拍图')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ElImage' }).exists()).toBe(false)
  })

  it('src 为空白串时同样走「无抓拍图」占位', () => {
    const wrapper = mount(SnapImage, { props: { src: '   ' } })

    expect(wrapper.text()).toContain('无抓拍图')
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('props 有默认值：不传任何 props 时为 60×40 + 无图占位 + 不开预览', () => {
    // 真正走一遍 withDefaults：上面几个用例都显式传了 props，盖不到默认值分支
    const wrapper = mount(SnapImage)
    const style = wrapper.find('.snap-image').attributes('style') ?? ''

    expect(style).toContain('width: 60px')
    expect(style).toContain('height: 40px')
    expect(wrapper.text()).toContain('无抓拍图')
    expect(wrapper.findComponent({ name: 'ElImage' }).exists()).toBe(false)
  })

  it('紧凑态（宽 <80）隐去图标、文案换行完整显示，不被裁切成看不出区别', () => {
    const compact = mount(SnapImage, { props: { src: null, width: 60, height: 40 } })
    const roomy = mount(SnapImage, { props: { src: null, width: 320, height: 200 } })

    expect(compact.find('.snap-image__fallback--compact').exists()).toBe(true)
    expect(compact.find('.snap-image__text--compact').exists()).toBe(true)
    expect(compact.find('.el-icon').exists()).toBe(false)
    // 宽裕尺寸（详情抽屉大图）仍保留图标 + 单行文案
    expect(roomy.find('.snap-image__fallback--compact').exists()).toBe(false)
    expect(roomy.find('.el-icon').exists()).toBe(true)
  })
})

describe('SnapImage 正常渲染', () => {
  it('有 src 时渲染 el-image 且 src 原样透传', async () => {
    const wrapper = mount(SnapImage, {
      props: { src: SNAP, width: 60, height: 40, preview: false }
    })
    // el-image 在 onMounted 里才把 props.src 写进内部 imageSrc，img 下一个 tick 才进 DOM
    await nextTick()
    const img = wrapper.find('img')

    expect(wrapper.findComponent({ name: 'ElImage' }).exists()).toBe(true)
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe(SNAP)
  })

  it('preview=true 时 preview-src-list 含该 src，false 时为空数组', () => {
    const withPreview = mount(SnapImage, {
      props: { src: SNAP, width: 300, height: 200, preview: true }
    })
    const withoutPreview = mount(SnapImage, {
      props: { src: SNAP, width: 60, height: 40, preview: false }
    })

    expect(withPreview.findComponent({ name: 'ElImage' }).props('previewSrcList')).toEqual([SNAP])
    expect(withoutPreview.findComponent({ name: 'ElImage' }).props('previewSrcList')).toEqual([])
  })

  it('width/height 反映到容器样式（占位容器固定尺寸，避免缺图时表格行高跳动）', () => {
    const wrapper = mount(SnapImage, {
      props: { src: SNAP, width: 640, height: 360, preview: false }
    })
    const style = wrapper.find('.snap-image').attributes('style') ?? ''

    expect(style).toContain('width: 640px')
    expect(style).toContain('height: 360px')
  })
})

describe('SnapImage 加载失败降级', () => {
  it('图片加载失败（MinIO 私有桶 403）时显示「图片不可访问」而非「无抓拍图」', async () => {
    const wrapper = mount(SnapImage, {
      props: { src: SNAP, width: 60, height: 40, preview: false }
    })
    await nextTick()

    // 两个占位语义不同：前者是「有图但取不到」，后者是「本来就没图」，
    // 统一显示「无抓拍图」会让运维误判成「后端没存图」而查错方向
    await wrapper.find('img').trigger('error')

    expect(wrapper.text()).toContain('图片不可访问')
    expect(wrapper.text()).not.toContain('无抓拍图')
    expect(wrapper.find('img').exists()).toBe(false)
  })
})
