import { vi } from 'vitest'

/**
 * 全局测试环境补丁。
 *
 * jsdom 不实现 `matchMedia` 与 `ResizeObserver`，而 Element Plus（响应式断点）与
 * ECharts（容器尺寸监听）在挂载时会直接调用它们，缺桩会让组件测试整片报
 * `window.matchMedia is not a function`。此处只做空实现，不模拟任何媒体查询结果。
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
})

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverStub
})

// Element Plus 的全局插件注册（config.global.plugins = [ElementPlus]）留到 Task 8 再加：
// 本阶段只测纯函数，提前引入会拖慢全部测试。
