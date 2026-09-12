import { config } from '@vue/test-utils'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import ElementPlus from 'element-plus'

/**
 * 组件测试专用的 Element Plus 注入（副作用式导入）。
 *
 * 用法：在组件测试文件顶部写 `import '@/test/element-plus'`。
 *
 * 刻意不放进 `src/test/setup.ts`：`@vue/test-utils` 的 `config` 是**每个测试文件**一份，
 * 但 setup.ts 会对所有文件生效 —— 全局注册会让纯函数测试也付一次 element-plus + 全量图标的
 * 导入/安装成本（实测 setup 从 68ms 涨到 95.73s，全量测试 3.55s → 13.05s）。
 *
 * 图标不在 ElementPlus 插件里，必须单独注册，否则模板里的 `<Picture />`、`<Camera />`、
 * `<Loading />`、`<User />` 等会报 Failed to resolve component。
 * jsdom 不做视觉渲染，故**不引入 Element Plus 的 CSS**。
 */
config.global.plugins = [...(config.global.plugins ?? []), ElementPlus]
config.global.components = {
  ...(config.global.components ?? {}),
  ...ElementPlusIconsVue
}
