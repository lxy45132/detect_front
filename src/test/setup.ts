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

/**
 * jsdom 25 的 Blob 未实现 `text()` / `arrayBuffer()` / `stream()`（实测三者均为 undefined，
 * 只有 `slice()`），而 `readErrorFromBlob` 要靠 `blob.text()` 读回导出超限时的 JSON 错误体。
 * 用 jsdom 确实提供的 FileReader 补一个等价实现 —— 真实浏览器原生支持 `blob.text()`，
 * 故业务代码不必为测试环境改写。
 */
if (typeof Blob.prototype.text !== 'function') {
  Object.defineProperty(Blob.prototype, 'text', {
    writable: true,
    configurable: true,
    value: function blobText(this: Blob): Promise<string> {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(reader.error)
        reader.readAsText(this)
      })
    }
  })
}

// Element Plus 与其图标**刻意不在这里全局注册** —— 那会让每个纯函数测试文件也付一次
// 导入/安装成本（实测：setup 从 68ms 涨到 95.73s，全量测试 3.55s → 13.05s）。
// 组件测试在文件顶部 `import '@/test/element-plus'` 按需注入即可。
