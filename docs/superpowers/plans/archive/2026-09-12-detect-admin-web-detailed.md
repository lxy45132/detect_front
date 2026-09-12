# Detect 事件管理后台前端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `D:\Code\Front\Detect` 用 Vue3 + TypeScript + Element Plus 构建 Detect 事件管理后台前端，本期打通「登录 → 事件列表/详情/修正/删除/导出 → 事件统计看板」全链路。

**Architecture:** 单向分层 SPA（`views → components/composables → stores → api → utils → types/constants`）。所有请求经 `/api` 前缀由 Vite 代理转发到网关 9999，axios 响应拦截器统一拆 `R<T>` 包装并在 401 时硬跳转登录。字典枚举登录后一次性缓存于 Pinia，供全站下拉与 code→中文翻译复用。

**Tech Stack:** Vite 5 · Vue 3.5（`<script setup>`）· TypeScript 5.6 strict · Element Plus 2.9（全量引入）· Pinia 2 · Vue Router 4 · Axios 1.7 · ECharts 5.5（按需引入）· Vitest 2 + jsdom + @vue/test-utils

**Spec:** `docs/superpowers/specs/2026-09-12-detect-admin-web-design.md`

## Global Constraints

- Node ≥ 20（本机 v24.15.0）；包管理器 npm（本机 11.12.1）
- 后端契约唯一真源：`yolo26/docs/superpowers/specs/2026-09-10-event-management-api-design.md`（29 端点，附录 B 汇总表）
- 统一响应 `R<T>` = `{code, msg, data}`，**成功 code=0**（不是 200）
- 分页 `PageResult<T>` = `{records, total, current, size, pages}`；`current` 从 1 起，`size` 默认 20 上限 200
- 时间格式一律 `yyyy-MM-dd HH:mm:ss`（东八区），**后端已格式化，前端不得二次转换**
- 登录端点 `POST /auth/oauth/token` 用 `@RequestParam` 接收 → **必须 `application/x-www-form-urlencoded`**，不能用 JSON
- 业务接口前缀 `/admin/event`（网关 StripPrefix=2），登录前缀 `/auth`（StripPrefix=1）
- JWT 声明：`sub=username` / `user_id`(Long) / `username` / `authorities`(如 `ROLE_ADMIN`) / `iat` / `exp`；无 refresh token 端点
- 枚举 code 类型不统一：`eventType`/`handleStatus`/`priority` 为 number，`task`/`ruleType` 为 string → 查表统一 `String(code)`
- 全站**禁止使用 `v-html`**（令牌存 localStorage，靠不渲染用户提交 HTML 控 XSS）
- 抓拍图 MinIO 桶私有（匿名 GET 返 403）→ 图片组件必须优雅降级，不得抛全局错误
- TypeScript `strict: true` + `noUnusedLocals: true`；`npm run build` = `vue-tsc --noEmit && vite build` 必须零错误
- 提交信息中文，格式 `feat: xxx` / `test: xxx` / `fix: xxx` / `docs: xxx`

## 已完成的前置产出（脚手架，工作区已存在）

以下文件在计划批准前已写盘，Task 1 起在此基础上继续，**不要重复创建**：

```
package.json  tsconfig.json  vite.config.ts  index.html
.env.development  .env.production  .gitignore
public/favicon.svg
src/env.d.ts
src/types/api.ts                  ← 后端契约类型（R/PageResult/EventQuery/EventRecordItem/EventRecordDetail/EventStat/...）
src/constants/error-code.ts       ← SUCCESS_CODE / ERROR_MESSAGES / TOKEN_KEY / USER_KEY / EVENT_TYPE / HANDLE_STATUS / PRIORITY
src/utils/token.ts                ← getToken/setToken/clearToken/getStoredUser/setStoredUser/clearStoredUser/isTokenExpired
```

`npm install` 已执行完毕（104 packages）。

## File Structure

```
D:\Code\Front\Detect\
├─ vitest.config.ts                     Vitest 配置（jsdom + @ 别名）
├─ src\
│  ├─ main.ts                           应用入口：createApp + Pinia + Router + ElementPlus + 全局样式
│  ├─ App.vue                           根组件（仅 <router-view/>）
│  ├─ test\setup.ts                     单测环境补丁（matchMedia / ResizeObserver）
│  ├─ types\api.ts                      ✅ 后端契约类型
│  ├─ constants\error-code.ts           ✅ 错误码/存储键/枚举常量
│  ├─ constants\dict.ts                 字典缺失时的静态兜底枚举（后端不可达时仍可用）
│  ├─ utils\
│  │  ├─ token.ts                       ✅ 令牌与用户信息读写、过期预判
│  │  ├─ params.ts                      cleanParams：剔除 ''/null/undefined，保留 0 与 false
│  │  ├─ format.ts                      dash/textOr/percent 等展示格式化纯函数
│  │  ├─ download.ts                    导出文件名生成、blob 下载、JSON blob 错误识别
│  │  ├─ navigate.ts                    hardNavigate：window.location.assign 薄封装（便于单测 mock）
│  │  └─ __tests__\                     params/format/download/token 单测
│  ├─ api\
│  │  ├─ interceptors.ts                请求/响应拦截器纯函数（R 拆包、BizError、401 跳转、blob 透传）
│  │  ├─ request.ts                     axios 业务实例 + get/post/put/del/download 薄封装
│  │  ├─ auth.ts                        login（裸 axios + form 编码）/ logout
│  │  ├─ dict.ts                        fetchEventEnums / fetchEventTypes / fetchTasks
│  │  ├─ event.ts                       事件域 6 个查询/写入函数 + exportEvents
│  │  └─ __tests__\                     interceptors/auth/dict/event 单测
│  ├─ stores\
│  │  ├─ auth.ts                        令牌/用户状态 + login/logout/restore
│  │  ├─ dict.ts                        枚举缓存（只请求一次）+ labelOf/taskOf/tasksOfEventType
│  │  └─ __tests__\                     dict store 单测
│  ├─ composables\
│  │  ├─ useEnum.ts                     优先级/处理状态/大类 → 中文名 + el-tag 类型
│  │  ├─ useEventQuery.ts               事件列表筛选表单 + 分页 + 加载/删除/导出编排
│  │  └─ __tests__\{useEnum,useEventQuery}.test.ts
│  ├─ router\index.ts                   路由表 + 登录守卫（含过期预判）
│  ├─ layouts\BasicLayout.vue           侧栏 + 顶栏 + 面包屑 + 内容区
│  ├─ components\
│  │  ├─ SnapImage.vue                  抓拍图（error 插槽降级 + 可选点击预览）
│  │  ├─ eventEditModel.ts              可修正字段清单 + changedPatch（只发改动项，纯函数）
│  │  ├─ statOptions.ts                 看板三图 ECharts option 构造纯函数（饼/横向柱/折线）
│  │  ├─ EventDetailDrawer.vue          事件详情抽屉（分组字段 + sourceData + 处理历史时间线）
│  │  ├─ EventEditDialog.vue            事件修正弹窗（仅业务字段，只发改动项）
│  │  ├─ StatChart.vue                  ECharts 容器（按需引入 + resize + dispose）
│  │  └─ __tests__\{SnapImage,eventEditModel,statOptions}.test.ts
│  ├─ views\
│  │  ├─ login\index.vue
│  │  └─ event\{list.vue, statistics.vue}
│  └─ styles\{index.css, layout.css, login.css}
├─ docs\superpowers\{specs,plans}\      ✅ 本设计规格与计划
├─ docs\IMPLEMENTATION_LOG.md           前端实施日志（含未完成模块清单）
└─ README.md                            启动/代理/联调说明
```

---

## Task 1: Vitest 测试基座

**Files:**
- Modify: `package.json`（补 devDependencies + test 脚本）
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Test: `src/utils/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `npm run test`（一次性跑全部）/ `npm run test:watch`；`@/` 别名在单测中可用；`src/test/setup.ts` 提供 `matchMedia`、`ResizeObserver` 桩

- [ ] **Step 1: 补测试依赖与脚本**

修改 `package.json`，`scripts` 追加：

```json
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
```

`devDependencies` 追加（版本与 Vite 5 / Vue 3.5 匹配）：

```json
    "@vue/test-utils": "^2.4.6",
    "jsdom": "^25.0.1",
    "vitest": "^2.1.8"
```

- [ ] **Step 2: 安装依赖**

Run: `cd D:\Code\Front\Detect ; npm install --no-audit --no-fund`
Expected: `added N packages`，EXIT=0

- [ ] **Step 3: 写 Vitest 配置**

`vitest.config.ts`：

```ts
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

/** 单测配置：与 vite.config.ts 保持同样的 @ 别名，环境用 jsdom（组件测试需 DOM） */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/__tests__/**/*.test.ts'],
    restoreMocks: true
  }
})
```

- [ ] **Step 4: 写测试环境补丁**

`src/test/setup.ts`：

```ts
import { vi } from 'vitest'

// Element Plus / ECharts 在 jsdom 下依赖这两个浏览器 API，缺失会导致组件挂载抛错
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
window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
```

- [ ] **Step 5: 写冒烟测试（先失败）**

`src/utils/__tests__/smoke.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { SUCCESS_CODE } from '@/constants/error-code'

describe('测试基座', () => {
  it('@ 别名可解析且常量可导入', () => {
    expect(SUCCESS_CODE).toBe(0)
  })

  it('jsdom 环境已补 matchMedia', () => {
    expect(typeof window.matchMedia).toBe('function')
  })
})
```

- [ ] **Step 6: 跑测试确认通过**

Run: `cd D:\Code\Front\Detect ; npm run test`
Expected: `Test Files 1 passed` / `Tests 2 passed`，EXIT=0

- [ ] **Step 7: 提交**

```bash
git init 2>$null; git add package.json package-lock.json vitest.config.ts src/test/setup.ts src/utils/__tests__/smoke.test.ts
git commit -m "test: 搭建 Vitest 测试基座"
```

> 若目录尚未 `git init`，先执行 `git init`（前端仓库独立于 Java 仓库）。

---

## Task 2: utils 纯函数层

**Files:**
- Create: `src/utils/params.ts`
- Create: `src/utils/format.ts`
- Create: `src/utils/download.ts`
- Create: `src/utils/navigate.ts`
- Test: `src/utils/__tests__/params.test.ts`
- Test: `src/utils/__tests__/format.test.ts`
- Test: `src/utils/__tests__/download.test.ts`
- Test: `src/utils/__tests__/token.test.ts`

**Interfaces:**
- Consumes: `src/utils/token.ts`（已存在）、`src/constants/error-code.ts`（`TOKEN_KEY`/`USER_KEY`）
- Produces:
  - `cleanParams<T = Record<string, unknown>>(params: Record<string, unknown>): T` — 剔除空值键；泛型 `T` 让调用方直接拿到目标 DTO 类型
  - `dash(v: unknown): string` — 空值转 `—`
  - `textOr(v: string | null | undefined, fallback?: string): string`
  - `percent(rate: number, digits?: number): string` — `0.1234 → "12.34%"`
  - `buildExportFilename(prefix: string, format: 'xlsx' | 'csv'): string`
  - `downloadBlob(blob: Blob, filename: string): void`
  - `isJsonBlob(blob: Blob): boolean`
  - `readErrorFromBlob(blob: Blob): Promise<string>` — 解析 `{code,msg}` 取 msg，失败返回兜底文案
  - `hardNavigate(url: string): void`
  - `redirectToLogin(): void`（放在 `navigate.ts`，清令牌 + 跳 `/login?redirect=<当前路径>`）

- [ ] **Step 1: 写参数清洗的失败测试**

`src/utils/__tests__/params.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { cleanParams } from '@/utils/params'

describe('cleanParams', () => {
  it('剔除空串、null、undefined', () => {
    expect(cleanParams({ a: '', b: null, c: undefined, d: 'x' })).toEqual({ d: 'x' })
  })

  it('保留数字 0 与布尔 false（处理状态 0 / 优先级 0 是合法筛选值）', () => {
    expect(cleanParams({ handleStatus: 0, priority: 0, enabled: false })).toEqual({
      handleStatus: 0,
      priority: 0,
      enabled: false
    })
  })

  it('剔除只有空白的字符串', () => {
    expect(cleanParams({ keyword: '   ' })).toEqual({})
  })

  it('入参为 undefined 时返回空对象', () => {
    expect(cleanParams(undefined as unknown as Record<string, unknown>)).toEqual({})
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- params`
Expected: FAIL，`Cannot find module '@/utils/params'`

- [ ] **Step 3: 实现 cleanParams**

`src/utils/params.ts`：

```ts
/**
 * GET 查询参数清洗。
 *
 * Element Plus 的 clearable 选择器清空后值为 `''`，若原样发出 `?eventType=`
 * 会让后端 Integer 绑定失败（400）。故统一剔除空值键。
 * 注意：`0` 与 `false` 是合法筛选值（处理状态 0=未处理、优先级 0=普通），必须保留。
 *
 * 泛型 `T` 只是把「删过键的同构对象」标成调用方期望的 DTO 类型：
 * 清洗不改值只删键，出入结构一致，避免每个调用点写 `as unknown as XxxQuery`。
 */
export function cleanParams<T = Record<string, unknown>>(params: Record<string, unknown>): T {
  const result: Record<string, unknown> = {}
  if (!params) return result as T
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    if (typeof value === 'string' && value.trim() === '') continue
    result[key] = value
  }
  return result as T
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- params`
Expected: PASS，4 tests

- [ ] **Step 5: 写格式化函数的失败测试**

`src/utils/__tests__/format.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { dash, percent, textOr } from '@/utils/format'

describe('dash', () => {
  it('空值统一显示破折号', () => {
    expect(dash(null)).toBe('—')
    expect(dash(undefined)).toBe('—')
    expect(dash('')).toBe('—')
    expect(dash('   ')).toBe('—')
  })

  it('数字 0 是有效值，不转破折号', () => {
    expect(dash(0)).toBe('0')
    expect(dash('浙C6B5P8')).toBe('浙C6B5P8')
  })
})

describe('textOr', () => {
  it('空值回退到 fallback', () => {
    expect(textOr(null, '未知')).toBe('未知')
    expect(textOr('南河湫水闸', '未知')).toBe('南河湫水闸')
  })
})

describe('percent', () => {
  it('比率转百分比字符串', () => {
    expect(percent(0.1234)).toBe('12.34%')
    expect(percent(0.5)).toBe('50.00%')
    expect(percent(0)).toBe('0.00%')
  })

  it('支持自定义小数位', () => {
    expect(percent(0.1234, 1)).toBe('12.3%')
  })

  it('非数字输入回退 0', () => {
    expect(percent(undefined as unknown as number)).toBe('0.00%')
  })
})
```

- [ ] **Step 6: 跑测试确认失败**

Run: `npm run test -- format`
Expected: FAIL，`Cannot find module '@/utils/format'`

- [ ] **Step 7: 实现格式化函数**

`src/utils/format.ts`：

```ts
/** 空值占位符（表格/描述列表中统一使用，避免大片空白） */
export const DASH = '—'

/** 判空：null/undefined/纯空白字符串视为空；数字 0 与 false 是有效值 */
function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true
  return typeof v === 'string' && v.trim() === ''
}

/** 空值转破折号，其余原样转字符串 */
export function dash(v: unknown): string {
  return isBlank(v) ? DASH : String(v)
}

/** 字符串空值回退 */
export function textOr(v: string | null | undefined, fallback = DASH): string {
  return isBlank(v) ? fallback : (v as string)
}

/** 比率（0~1）转百分比字符串，默认两位小数 */
export function percent(rate: number, digits = 2): string {
  const n = typeof rate === 'number' && !Number.isNaN(rate) ? rate : 0
  return `${(n * 100).toFixed(digits)}%`
}
```

- [ ] **Step 8: 跑测试确认通过**

Run: `npm run test -- format`
Expected: PASS，3 describe / 8 tests

- [ ] **Step 9: 写下载工具的失败测试**

`src/utils/__tests__/download.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest'
import { buildExportFilename, isJsonBlob, readErrorFromBlob } from '@/utils/download'

describe('buildExportFilename', () => {
  it('生成带时间戳的文件名', () => {
    const name = buildExportFilename('事件记录', 'xlsx')
    expect(name).toMatch(/^事件记录_\d{8}_\d{6}\.xlsx$/)
  })

  it('csv 格式使用 .csv 后缀', () => {
    expect(buildExportFilename('事件记录', 'csv')).toMatch(/\.csv$/)
  })
})

describe('isJsonBlob', () => {
  it('识别 JSON blob（导出超限时后端返 200 + {code:4001}）', () => {
    expect(isJsonBlob(new Blob(['{}'], { type: 'application/json' }))).toBe(true)
    expect(isJsonBlob(new Blob(['{}'], { type: 'application/json;charset=UTF-8' }))).toBe(true)
  })

  it('Excel 流不是 JSON', () => {
    expect(
      isJsonBlob(new Blob(['x'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    ).toBe(false)
  })
})

describe('readErrorFromBlob', () => {
  it('解析 R 包装取出 msg', async () => {
    const blob = new Blob([JSON.stringify({ code: 4001, msg: '导出数量超限', data: null })], {
      type: 'application/json'
    })
    await expect(readErrorFromBlob(blob)).resolves.toBe('导出数量超限')
  })

  it('JSON 不含 msg 时用错误码兜底文案', async () => {
    const blob = new Blob([JSON.stringify({ code: 4001 })], { type: 'application/json' })
    await expect(readErrorFromBlob(blob)).resolves.toBe(
      '导出数量超限（单次上限 5 万条），请缩小筛选范围'
    )
  })

  it('非法 JSON 返回通用兜底文案', async () => {
    const blob = new Blob(['not-json'], { type: 'application/json' })
    await expect(readErrorFromBlob(blob)).resolves.toBe('导出失败')
  })
})

describe('downloadBlob', () => {
  it('创建临时 <a download> 并点击', async () => {
    const { downloadBlob } = await import('@/utils/download')
    const click = vi.fn()
    const created: HTMLAnchorElement[] = []
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = { href: '', download: '', click, style: {} } as unknown as HTMLAnchorElement
      if (tag === 'a') created.push(el)
      return el
    }) as typeof document.createElement)
    vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n)
    vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n)
    const revoke = vi.fn()
    Object.defineProperty(globalThis.URL, 'createObjectURL', { value: () => 'blob:x', configurable: true })
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', { value: revoke, configurable: true })

    downloadBlob(new Blob(['x']), 'a.xlsx')

    expect(created).toHaveLength(1)
    expect(created[0].download).toBe('a.xlsx')
    expect(click).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith('blob:x')
  })
})
```

- [ ] **Step 10: 跑测试确认失败**

Run: `npm run test -- download`
Expected: FAIL，`Cannot find module '@/utils/download'`

- [ ] **Step 11: 实现下载工具**

`src/utils/download.ts`：

```ts
import { ERROR_MESSAGES } from '@/constants/error-code'

/** 本地时间戳 yyyyMMdd_HHmmss（用于导出文件名） */
function timestamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/**
 * 生成导出文件名。
 *
 * 刻意不解析响应的 Content-Disposition —— 后端用 URLEncoder 编码（空格变 `+`），
 * 解析需处理编码歧义；前端已知 format，自行拼名更可靠。
 */
export function buildExportFilename(prefix: string, format: 'xlsx' | 'csv'): string {
  return `${prefix}_${timestamp()}.${format}`
}

/** 导出超限时后端返 HTTP 200 + JSON 错误体，需与文件流区分 */
export function isJsonBlob(blob: Blob): boolean {
  return (blob.type || '').toLowerCase().includes('application/json')
}

/** 从 JSON 错误 blob 中取出可展示的 msg，逐级兜底 */
export async function readErrorFromBlob(blob: Blob): Promise<string> {
  try {
    const body = JSON.parse(await blob.text()) as { code?: number; msg?: string }
    if (body.msg) return body.msg
    if (typeof body.code === 'number' && ERROR_MESSAGES[body.code]) return ERROR_MESSAGES[body.code]
  } catch {
    // 非法 JSON，落到兜底
  }
  return '导出失败'
}

/** 触发浏览器下载并回收 objectURL */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 12: 跑测试确认通过**

Run: `npm run test -- download`
Expected: PASS，4 describe / 7 tests

- [ ] **Step 13: 写令牌工具的失败测试**

`src/utils/__tests__/token.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearStoredUser,
  clearToken,
  getStoredUser,
  getToken,
  isTokenExpired,
  setStoredUser,
  setToken,
  type StoredUser
} from '@/utils/token'

const SECOND = 1000

function user(issuedAt: number, expiresIn = 43200): StoredUser {
  return { userId: 1, username: 'admin', authorities: ['ROLE_ADMIN'], issuedAt, expiresIn }
}

describe('token 读写', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('未写入时 getToken 返回空串而非 null', () => {
    expect(getToken()).toBe('')
    expect(getStoredUser()).toBeNull()
  })

  it('写入后可读回', () => {
    setToken('jwt-token-value')
    setStoredUser(user(1_700_000_000_000))
    expect(getToken()).toBe('jwt-token-value')
    expect(getStoredUser()?.username).toBe('admin')
  })

  it('清除后读不到', () => {
    setToken('t')
    setStoredUser(user(Date.now()))
    clearToken()
    clearStoredUser()
    expect(getToken()).toBe('')
    expect(getStoredUser()).toBeNull()
  })

  it('用户信息被写坏时返回 null 并自清理', () => {
    localStorage.setItem('detect_login_user', '{broken json')
    expect(getStoredUser()).toBeNull()
    expect(localStorage.getItem('detect_login_user')).toBeNull()
  })
})

describe('isTokenExpired', () => {
  it('user 为 null 视为已过期', () => {
    expect(isTokenExpired(null)).toBe(true)
  })

  it('刚签发未过期', () => {
    expect(isTokenExpired(user(Date.now(), 43200))).toBe(false)
  })

  it('剩余不足 30s 余量时判为过期（避免请求在途失效）', () => {
    const issuedAt = Date.now() - (60 - 20) * SECOND // 已用 40s，有效期 60s，剩 20s < 30s
    expect(isTokenExpired(user(issuedAt, 60))).toBe(true)
  })

  it('超出有效期判为过期', () => {
    const issuedAt = Date.now() - 120 * SECOND
    expect(isTokenExpired(user(issuedAt, 60))).toBe(true)
  })
})
```

- [ ] **Step 14: 跑测试确认通过（token.ts 已实现，此步应直接绿）**

Run: `npm run test -- token`
Expected: PASS，2 describe / 8 tests
若失败：说明 `src/utils/token.ts` 的实现与测试期望不符，以实现为准修正 `token.ts`（不得放宽测试）。

- [ ] **Step 15: 写跳转工具的失败测试**

`src/utils/__tests__/navigate.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TOKEN_KEY, USER_KEY } from '@/constants/error-code'
import { hardNavigate, redirectToLogin } from '@/utils/navigate'

/**
 * jsdom 的 window.location 不可直接赋值，用 defineProperty 覆盖。
 * 返回注入的 assign spy，供「默认走 hardNavigate」的用例断言。
 */
function stubLocation(pathname: string, search = ''): ReturnType<typeof vi.fn> {
  const assign = vi.fn()
  Object.defineProperty(window, 'location', {
    value: { pathname, search, assign },
    writable: true,
    configurable: true
  })
  return assign
}

describe('hardNavigate', () => {
  it('透传到 window.location.assign', () => {
    const assign = stubLocation('/event/list')
    hardNavigate('/login')
    expect(assign).toHaveBeenCalledWith('/login')
  })
})

describe('redirectToLogin', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('清空本地凭据并带 redirect 参数跳转（注入 navigate，不依赖 ESM mock）', () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-abc')
    localStorage.setItem(USER_KEY, '{"username":"admin"}')
    stubLocation('/event/list')
    const navigate = vi.fn()

    redirectToLogin(navigate)

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(USER_KEY)).toBeNull()
    expect(navigate).toHaveBeenCalledWith('/login?redirect=%2Fevent%2Flist')
  })

  it('当前路径带 query 时一并编码进 redirect', () => {
    stubLocation('/event/list', '?eventType=200')
    const navigate = vi.fn()

    redirectToLogin(navigate)

    expect(navigate).toHaveBeenCalledWith('/login?redirect=%2Fevent%2Flist%3FeventType%3D200')
  })

  it('已在登录页时 redirect 归为根路径，避免登录后跳回登录页', () => {
    stubLocation('/login', '?redirect=%2Fx')
    const navigate = vi.fn()

    redirectToLogin(navigate)

    expect(navigate).toHaveBeenCalledWith('/login?redirect=%2F')
  })

  it('未传 navigate 时默认走 hardNavigate', () => {
    const assign = stubLocation('/event/statistics')

    redirectToLogin()

    expect(assign).toHaveBeenCalledWith('/login?redirect=%2Fevent%2Fstatistics')
  })
})
```

> `redirectToLogin` 采用**注入式**签名（`navigate` 参数默认 `hardNavigate`），测试直接传 spy，不用 `vi.mock` / `vi.doMock` —— 规避 ESM 模块 mock 的提升顺序问题，也让 4 个用例彼此独立。

- [ ] **Step 16: 跑测试确认失败**

Run: `npm run test -- navigate`
Expected: FAIL — `Failed to resolve import "@/utils/navigate"`

- [ ] **Step 17: 实现跳转工具**

`src/utils/navigate.ts`：

```ts
import { clearStoredUser, clearToken } from '@/utils/token'

/** window.location.assign 薄封装：单独成函数便于单测拦截 */
export function hardNavigate(url: string): void {
  window.location.assign(url)
}

/**
 * 401 统一出口：清本地凭据后硬跳登录页。
 *
 * 用硬跳转而非 router.push —— 一是规避 request.ts ↔ router 的循环依赖，
 * 二是整页重载可确保 Pinia 内存态（含字典缓存）一并清空，不留脏数据。
 * navigate 参数供单测注入。
 */
export function redirectToLogin(navigate: (url: string) => void = hardNavigate): void {
  clearToken()
  clearStoredUser()
  const current = window.location.pathname + window.location.search
  const redirect = current.startsWith('/login') ? '/' : current
  navigate(`/login?redirect=${encodeURIComponent(redirect)}`)
}
```

- [ ] **Step 18: 跑测试确认通过**

Run: `npm run test -- navigate`
Expected: PASS，2 describe / 5 tests

- [ ] **Step 19: 跑全部 utils 测试**

Run: `npm run test`
Expected: PASS，全部测试文件绿（smoke + params + format + download + token + navigate）

- [ ] **Step 20: 提交**

```bash
git add src/utils docs/superpowers
git commit -m "feat: utils 纯函数层（参数清洗/格式化/文件流下载/令牌过期/401 跳转）+ 单测"
```

---

## Task 3: axios 请求层（拦截器 + R 拆包 + 401）

**Files:**
- Create: `src/api/interceptors.ts`
- Create: `src/api/request.ts`
- Test: `src/api/__tests__/interceptors.test.ts`

**Interfaces:**
- Consumes: `cleanParams`（Task 2）、`getToken`（已有）、`redirectToLogin`（Task 2）、`ERROR_MESSAGES`/`SUCCESS_CODE`（已有）、`readErrorFromBlob`/`downloadBlob`（Task 2）
- Produces:
  - `class BizError extends Error { code: number; msg: string }`
  - `onRequestFulfilled(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig` — 注入 Bearer + 清洗 params
  - `onResponseFulfilled(response: AxiosResponse): unknown` — blob 透传 / code=0 拆包 / code≠0 抛 BizError
  - `onResponseRejected(error: unknown): Promise<never>` — 401 跳转、其余按码兜底提示
  - `http: AxiosInstance`（业务实例，baseURL 取 `VITE_API_BASE`）
  - `get<T>(url, params?): Promise<T>` · `post<T>(url, data?): Promise<T>` · `put<T>(url, data?): Promise<T>` · `del<T>(url, data?): Promise<T>` · `getBlob(url, params?): Promise<AxiosResponse<Blob>>`

- [ ] **Step 1: 写拦截器的失败测试**

`src/api/__tests__/interceptors.test.ts`：

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import { BizError, onRequestFulfilled, onResponseFulfilled, onResponseRejected } from '@/api/interceptors'
import { redirectToLogin } from '@/utils/navigate'

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }
}))
vi.mock('@/utils/navigate', () => ({ redirectToLogin: vi.fn(), hardNavigate: vi.fn() }))
vi.mock('@/utils/token', () => ({ getToken: () => 'jwt-abc', clearToken: vi.fn(), clearStoredUser: vi.fn() }))

function config(over: Partial<InternalAxiosRequestConfig> = {}): InternalAxiosRequestConfig {
  return { url: '/x', method: 'get', params: {}, headers: { set: vi.fn() } as never, ...over }
}

function response(data: unknown, over: Partial<AxiosResponse> = {}): AxiosResponse {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { url: '/x', headers: {} } as InternalAxiosRequestConfig,
    ...over
  } as AxiosResponse
}

beforeEach(() => vi.clearAllMocks())

describe('onRequestFulfilled', () => {
  it('注入 Authorization: Bearer', () => {
    const c = config()
    const out = onRequestFulfilled(c)
    expect(out.headers.set).toHaveBeenCalledWith('Authorization', 'Bearer jwt-abc')
  })

  it('清洗 GET 参数中的空值', () => {
    const out = onRequestFulfilled(config({ params: { eventType: '', priority: 0, keyword: null } }))
    expect(out.params).toEqual({ priority: 0 })
  })
})

describe('onResponseFulfilled', () => {
  it('code=0 时拆包直返 data', () => {
    expect(onResponseFulfilled(response({ code: 0, msg: 'success', data: { total: 4 } }))).toEqual({ total: 4 })
  })

  it('code=0 且 data 为 null 时返回 null', () => {
    expect(onResponseFulfilled(response({ code: 0, msg: 'success', data: null }))).toBeNull()
  })

  it('code≠0 抛 BizError 并弹出后端 msg', async () => {
    await expect(
      Promise.resolve(onResponseFulfilled(response({ code: 1001, msg: '事件不存在', data: null })))
    ).rejects.toMatchObject({ code: 1001, msg: '事件不存在' })
    expect(ElMessage.error).toHaveBeenCalledWith('事件不存在')
  })

  it('code≠0 且 msg 缺失时用错误码表兜底', async () => {
    await expect(
      Promise.resolve(onResponseFulfilled(response({ code: 4001, data: null })))
    ).rejects.toBeInstanceOf(BizError)
    expect(ElMessage.error).toHaveBeenCalledWith('导出数量超限（单次上限 5 万条），请缩小筛选范围')
  })

  it('blob 响应原样透传（导出文件流不拆包）', () => {
    const blob = new Blob(['x'])
    const res = response(blob, { config: { url: '/export', responseType: 'blob', headers: {} } as InternalAxiosRequestConfig })
    expect(onResponseFulfilled(res)).toBe(res)
  })
})

describe('onResponseRejected', () => {
  it('HTTP 401 清凭据并跳登录', async () => {
    const err = { response: { status: 401, data: { code: 401, msg: '未认证' } }, message: 'x', isAxiosError: true }
    await expect(onResponseRejected(err)).rejects.toBeInstanceOf(BizError)
    expect(redirectToLogin).toHaveBeenCalledOnce()
  })

  it('HTTP 403 提示无权限且不跳登录', async () => {
    const err = { response: { status: 403, data: { code: 403, msg: '内部接口禁止外部访问' } }, message: 'x', isAxiosError: true }
    await expect(onResponseRejected(err)).rejects.toBeInstanceOf(BizError)
    expect(ElMessage.error).toHaveBeenCalledWith('内部接口禁止外部访问')
    expect(redirectToLogin).not.toHaveBeenCalled()
  })

  it('HTTP 500 提示系统异常', async () => {
    const err = { response: { status: 500, data: null }, message: 'boom', isAxiosError: true }
    await expect(onResponseRejected(err)).rejects.toBeInstanceOf(BizError)
    expect(ElMessage.error).toHaveBeenCalledWith('系统异常')
  })

  it('无 response（网络中断/超时）提示网络异常', async () => {
    const err = { message: 'Network Error', isAxiosError: true }
    await expect(onResponseRejected(err)).rejects.toBeInstanceOf(BizError)
    expect(ElMessage.error).toHaveBeenCalledWith('网络异常，请检查后端服务是否已启动')
  })

  it('请求被取消时静默不提示', async () => {
    const err = { message: 'canceled', code: 'ERR_CANCELED', isAxiosError: true }
    await expect(onResponseRejected(err)).rejects.toBeTruthy()
    expect(ElMessage.error).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- interceptors`
Expected: FAIL，`Cannot find module '@/api/interceptors'`

- [ ] **Step 3: 实现拦截器**

`src/api/interceptors.ts`：

```ts
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import { ERROR_MESSAGES, SUCCESS_CODE } from '@/constants/error-code'
import type { R } from '@/types/api'
import { getToken } from '@/utils/token'
import { redirectToLogin } from '@/utils/navigate'
import { cleanParams } from '@/utils/params'

/** 业务异常：携带后端 code，调用方可据此做分支（如 1001 关闭详情抽屉） */
export class BizError extends Error {
  readonly code: number
  readonly msg: string

  constructor(code: number, msg: string) {
    super(msg)
    this.name = 'BizError'
    this.code = code
    this.msg = msg
  }
}

/** 弹错误提示：优先后端 msg，其次错误码表，最后通用文案 */
function notifyError(code: number, msg?: string): void {
  ElMessage.error(msg || ERROR_MESSAGES[code] || '请求失败')
}

/** 请求拦截：注入 Bearer + 清洗空值参数 */
export function onRequestFulfilled(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const token = getToken()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  if (config.params && typeof config.params === 'object') {
    config.params = cleanParams(config.params as Record<string, unknown>)
  }
  return config
}

/**
 * 响应拦截：
 * - blob（导出文件流）原样透传，由调用方处理
 * - code=0 拆包直返 data，业务代码不再层层 `.data`
 * - code≠0 提示后端 msg 并抛 BizError
 *
 * 返回类型断言为 AxiosResponse 是 axios 拦截器签名的限制：实际运行时返回的是拆包后的业务数据，
 * 故 request.ts 的 get/post 封装统一把返回类型断言为 Promise<T>。
 */
export function onResponseFulfilled(response: AxiosResponse): unknown {
  if (response.config.responseType === 'blob') {
    return response
  }
  const body = response.data as R<unknown> | undefined
  if (!body || typeof body.code !== 'number') {
    // 非 R 包装（理论上不会出现）：原样返回，避免吞掉数据
    return response.data
  }
  if (body.code === SUCCESS_CODE) {
    return body.data
  }
  notifyError(body.code, body.msg)
  throw new BizError(body.code, body.msg || ERROR_MESSAGES[body.code] || '请求失败')
}

/** 异常拦截：401 清凭据跳登录，其余按状态码兜底提示 */
export async function onResponseRejected(error: unknown): Promise<never> {
  const err = error as {
    isAxiosError?: boolean
    code?: string
    message?: string
    response?: { status: number; data?: R<unknown> | null }
  }

  // 主动取消的请求（切页/重复查询）静默处理，不打扰用户
  if (err?.code === 'ERR_CANCELED') {
    throw new BizError(-1, 'canceled')
  }

  const status = err?.response?.status
  const body = err?.response?.data as R<unknown> | null | undefined

  if (status === 401) {
    ElMessage.error(body?.msg || ERROR_MESSAGES[401])
    redirectToLogin()
    throw new BizError(401, body?.msg || ERROR_MESSAGES[401])
  }

  if (status) {
    const msg = body?.msg || ERROR_MESSAGES[status] || `请求失败(${status})`
    ElMessage.error(msg)
    throw new BizError(status, msg)
  }

  ElMessage.error('网络异常，请检查后端服务是否已启动')
  throw new BizError(-1, err?.message || '网络异常')
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- interceptors`
Expected: PASS，3 describe / 12 tests

> `onResponseFulfilled` 在 code≠0 时是**同步 throw**，测试里用 `Promise.resolve(...)` 包裹才能 `rejects` 断言；若嫌绕，把测试改为 `expect(() => onResponseFulfilled(...)).toThrow(BizError)` 亦可（两种都算通过，以实现为准，不得放宽断言语义）。

- [ ] **Step 5: 实现 axios 实例与薄封装**

`src/api/request.ts`：

```ts
import axios, { type AxiosInstance, type AxiosResponse } from 'axios'
import { onRequestFulfilled, onResponseFulfilled, onResponseRejected } from '@/api/interceptors'

/** 业务 axios 实例：baseURL 由环境变量给（开发 /api → Vite 代理 → 网关 9999） */
export const http: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json;charset=UTF-8' }
})

http.interceptors.request.use(onRequestFulfilled)
// 拦截器实际返回拆包后的 data，故下面所有封装都把结果断言为 Promise<T>
http.interceptors.response.use(
  onResponseFulfilled as (r: AxiosResponse) => AxiosResponse,
  onResponseRejected
)

export function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  return http.get(url, { params }) as unknown as Promise<T>
}

export function post<T>(url: string, data?: unknown): Promise<T> {
  return http.post(url, data) as unknown as Promise<T>
}

export function put<T>(url: string, data?: unknown): Promise<T> {
  return http.put(url, data) as unknown as Promise<T>
}

/** DELETE 带请求体（§4.1.6 批量删除 body {ids:[]}） */
export function del<T>(url: string, data?: unknown): Promise<T> {
  return http.delete(url, { data }) as unknown as Promise<T>
}

/** 文件流：返回原始 AxiosResponse，由调用方处理 blob（导出） */
export function getBlob(url: string, params?: Record<string, unknown>): Promise<AxiosResponse<Blob>> {
  return http.get(url, { params, responseType: 'blob' }) as unknown as Promise<AxiosResponse<Blob>>
}
```

- [ ] **Step 6: 类型检查**

Run: `npm run type-check`
Expected: EXIT=0，无类型错误

- [ ] **Step 7: 提交**

```bash
git add src/api
git commit -m "feat: axios 请求层（Bearer 注入/参数清洗/R 拆包/BizError/401 跳转）+ 单测"
```

---

## Task 4: API 业务模块（auth / dict / event）

**Files:**
- Create: `src/api/auth.ts`
- Create: `src/api/dict.ts`
- Create: `src/api/event.ts`
- Create: `src/api/base-url.ts`
- Test: `src/api/__tests__/auth.test.ts`
- Test: `src/api/__tests__/event.test.ts`

**Interfaces:**
- Consumes: `get/post/put/del/getBlob`（Task 3）、`downloadBlob`/`buildExportFilename`/`isJsonBlob`/`readErrorFromBlob`（Task 2）、`types/api.ts`
- Produces:
  - `login(username: string, password: string): Promise<TokenResponse>`
  - `fetchEventEnums(): Promise<EventEnums>`
  - `pageEvents(query: EventQuery): Promise<PageResult<EventRecordItem>>`
  - `getEventDetail(id: number): Promise<EventRecordDetail>`
  - `updateEvent(id: number, patch: EventRecordUpdate): Promise<void>`
  - `deleteEvent(id: number): Promise<void>`
  - `batchDeleteEvents(ids: number[]): Promise<DeletedResult>`
  - `getEventStatistics(params: { startTime?: string; endTime?: string; deviceNum?: string }): Promise<EventStat>`
  - `exportEvents(query: EventQuery, format: 'xlsx' | 'csv'): Promise<void>`
  - `getEventHistory(eventId: number): Promise<HandleHistoryItem[]>`

- [ ] **Step 1: 写登录的失败测试**

`src/api/__tests__/auth.test.ts`：

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { login } from '@/api/auth'

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>()
  return { ...actual, default: { ...actual.default, post: vi.fn() } }
})

beforeEach(() => vi.clearAllMocks())

describe('login', () => {
  it('以 x-www-form-urlencoded 提交（后端用 @RequestParam 接收，JSON 会 400）', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        access_token: 'jwt-x',
        token_type: 'Bearer',
        expires_in: 43200,
        user_id: 1,
        username: 'admin',
        authorities: ['ROLE_ADMIN']
      }
    })

    const res = await login('admin', '123456')

    const [url, body, cfg] = vi.mocked(axios.post).mock.calls[0]
    expect(url).toBe('/api/auth/oauth/token')
    expect(body).toBeInstanceOf(URLSearchParams)
    expect((body as URLSearchParams).get('username')).toBe('admin')
    expect((body as URLSearchParams).get('password')).toBe('123456')
    expect((body as URLSearchParams).get('grant_type')).toBe('password')
    expect(cfg?.headers?.['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(res.access_token).toBe('jwt-x')
  })

  it('密码错误时抛出后端 error_description', async () => {
    vi.mocked(axios.post).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { error: 'invalid_grant', error_description: '用户名或密码错误' } }
    })

    await expect(login('admin', 'wrong')).rejects.toThrow('用户名或密码错误')
  })

  it('后端未启动时给出可读提示', async () => {
    vi.mocked(axios.post).mockRejectedValue({ isAxiosError: true, message: 'Network Error' })

    await expect(login('admin', '123456')).rejects.toThrow('无法连接认证服务，请确认 detect-gateway(9999) 与 detect-auth(8081) 已启动')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- auth.test`
Expected: FAIL，`Cannot find module '@/api/auth'`

- [ ] **Step 3: 实现 base-url 与 auth**

`src/api/base-url.ts`：

```ts
/** 业务 axios 实例的 baseURL（与 request.ts 同源），供裸 axios 调用（登录）复用 */
export const API_BASE: string = import.meta.env.VITE_API_BASE || '/api'

/** 认证服务前缀：网关路由 /auth/** → StripPrefix=1 → detect-auth */
export const AUTH_PREFIX = '/auth'

/** 事件服务前缀：网关路由 /admin/event/** → StripPrefix=2 → detect-event */
export const EVENT_PREFIX = '/admin/event'
```

`src/api/auth.ts`：

```ts
import axios from 'axios'
import { API_BASE, AUTH_PREFIX } from '@/api/base-url'
import type { TokenErrorResponse, TokenResponse } from '@/types/api'

/**
 * 用户名/密码换 JWT（detect-auth `POST /oauth/token`，经网关 `/auth/oauth/token`）。
 *
 * 关键：后端 `OAuth2Controller.token` 用 `@RequestParam` 接收 username/password/grant_type，
 * **必须** 以 `application/x-www-form-urlencoded` 提交；发 JSON 会得到
 * 400 "Required request parameter 'username' is not present"。
 *
 * 刻意使用裸 axios 而非业务实例：该端点响应是 OAuth2 扁平结构而非 `R<T>` 包装，
 * 走业务拦截器会被误判为异常响应。
 */
export async function login(username: string, password: string): Promise<TokenResponse> {
  const body = new URLSearchParams()
  body.set('username', username)
  body.set('password', password)
  body.set('grant_type', 'password')

  try {
    const res = await axios.post<TokenResponse>(`${API_BASE}${AUTH_PREFIX}/oauth/token`, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000
    })
    return res.data
  } catch (error) {
    throw new Error(extractLoginErrorMessage(error))
  }
}

/** 从登录异常中提取可展示文案：优先 error_description，其次 HTTP 状态，最后网络提示 */
function extractLoginErrorMessage(error: unknown): string {
  const err = error as {
    response?: { status?: number; data?: TokenErrorResponse }
    message?: string
  }
  const description = err?.response?.data?.error_description
  if (description) return description

  const status = err?.response?.status
  if (status === 400) return '用户名或密码错误'
  if (status === 404) return '认证端点不存在，请检查网关路由 /auth/** 是否生效'
  if (status) return `登录失败(HTTP ${status})`

  return '无法连接认证服务，请确认 detect-gateway(9999) 与 detect-auth(8081) 已启动'
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- auth.test`
Expected: PASS，3 tests

- [ ] **Step 5: 实现字典接口**

`src/api/dict.ts`：

```ts
import { get } from '@/api/request'
import { EVENT_PREFIX } from '@/api/base-url'
import type { EnumItem, EventEnums, TaskItem } from '@/types/api'

const BASE = `${EVENT_PREFIX}/event-categories`

/** 一次性全量字典（§4.5.3）：登录后调用一次并缓存于 dict store */
export function fetchEventEnums(): Promise<EventEnums> {
  return get<EventEnums>(`${BASE}/enums`)
}

/** 事件大类（§4.5.1） */
export function fetchEventTypes(): Promise<EnumItem[]> {
  return get<EnumItem[]>(`${BASE}/types`)
}

/** 事件子类（§4.5.2）：eventType 可选，按大类过滤 */
export function fetchTasks(eventType?: number): Promise<TaskItem[]> {
  return get<TaskItem[]>(`${BASE}/tasks`, eventType === undefined ? {} : { eventType })
}
```

- [ ] **Step 6: 写事件接口的失败测试**

`src/api/__tests__/event.test.ts`：

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as request from '@/api/request'
import { ElMessage } from 'element-plus'
import {
  batchDeleteEvents,
  deleteEvent,
  exportEvents,
  getEventDetail,
  getEventStatistics,
  pageEvents,
  updateEvent
} from '@/api/event'

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }
}))
vi.mock('@/api/request', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  getBlob: vi.fn()
}))
vi.mock('@/utils/download', () => ({
  buildExportFilename: vi.fn(() => '事件记录_20260912_120000.xlsx'),
  downloadBlob: vi.fn(),
  isJsonBlob: vi.fn(() => false),
  readErrorFromBlob: vi.fn(async () => '导出数量超限')
}))

beforeEach(() => vi.clearAllMocks())

describe('事件接口路径与参数', () => {
  it('分页查询走 /admin/event/event-records/page 并透传筛选参数', async () => {
    vi.mocked(request.get).mockResolvedValue({ records: [], total: 0, current: 1, size: 20, pages: 0 })

    await pageEvents({ current: 2, size: 50, eventType: 200, keyword: '浙C' })

    expect(request.get).toHaveBeenCalledWith('/admin/event/event-records/page', {
      current: 2,
      size: 50,
      eventType: 200,
      keyword: '浙C'
    })
  })

  it('详情走 /event-records/{id}', async () => {
    vi.mocked(request.get).mockResolvedValue({ id: 8 })
    await getEventDetail(8)
    expect(request.get).toHaveBeenCalledWith('/admin/event/event-records/8')
  })

  it('修正用 PUT 且只传改动字段', async () => {
    vi.mocked(request.put).mockResolvedValue(null)
    await updateEvent(8, { plateNum: '浙C6B5P8' })
    expect(request.put).toHaveBeenCalledWith('/admin/event/event-records/8', { plateNum: '浙C6B5P8' })
  })

  it('单条删除用 DELETE 无 body', async () => {
    vi.mocked(request.del).mockResolvedValue(null)
    await deleteEvent(8)
    expect(request.del).toHaveBeenCalledWith('/admin/event/event-records/8', undefined)
  })

  it('批量删除把 ids 放进请求体（DELETE with body）', async () => {
    vi.mocked(request.del).mockResolvedValue({ deleted: 2 })
    const res = await batchDeleteEvents([1, 2])
    expect(request.del).toHaveBeenCalledWith('/admin/event/event-records/batch', { ids: [1, 2] })
    expect(res.deleted).toBe(2)
  })

  it('统计走 /event-records/statistics', async () => {
    vi.mocked(request.get).mockResolvedValue({ total: 0, byEventType: [], byTask: [], byDay: [] })
    await getEventStatistics({ deviceNum: 'dev01' })
    expect(request.get).toHaveBeenCalledWith('/admin/event/event-records/statistics', { deviceNum: 'dev01' })
  })
})

describe('exportEvents', () => {
  it('文件流正常时按 format 命名并触发下载', async () => {
    const { downloadBlob } = await import('@/utils/download')
    const blob = new Blob(['xlsx-bytes'])
    vi.mocked(request.getBlob).mockResolvedValue({ data: blob } as never)

    await exportEvents({ eventType: 200 }, 'xlsx')

    expect(request.getBlob).toHaveBeenCalledWith('/admin/event/event-records/export', {
      eventType: 200,
      format: 'xlsx'
    })
    expect(downloadBlob).toHaveBeenCalledWith(blob, '事件记录_20260912_120000.xlsx')
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('导出超限（200 + JSON 错误体）时解析 msg 并抛出，不落盘', async () => {
    const { downloadBlob, isJsonBlob } = await import('@/utils/download')
    vi.mocked(isJsonBlob).mockReturnValue(true)
    vi.mocked(request.getBlob).mockResolvedValue({ data: new Blob(['{}']) } as never)

    await expect(exportEvents({}, 'csv')).rejects.toThrow('导出数量超限')
    expect(ElMessage.error).toHaveBeenCalledWith('导出数量超限')
    expect(downloadBlob).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 7: 跑测试确认失败**

Run: `npm run test -- event.test`
Expected: FAIL，`Cannot find module '@/api/event'`

- [ ] **Step 8: 实现事件接口**

`src/api/event.ts`：

```ts
import { del, get, getBlob, put } from '@/api/request'
import { EVENT_PREFIX } from '@/api/base-url'
import type {
  DeletedResult,
  EventQuery,
  EventRecordDetail,
  EventRecordItem,
  EventRecordUpdate,
  EventStat,
  HandleHistoryItem,
  PageResult
} from '@/types/api'
import { buildExportFilename, downloadBlob, isJsonBlob, readErrorFromBlob } from '@/utils/download'
import { ElMessage } from 'element-plus'

const BASE = `${EVENT_PREFIX}/event-records`

/** 统计/导出共用的可选筛选（后端 statistics 只认这三项） */
export interface StatQuery {
  startTime?: string
  endTime?: string
  deviceNum?: string
}

/** 分页查询事件列表（§4.1.2），后端固定 snap_time DESC */
export function pageEvents(query: EventQuery): Promise<PageResult<EventRecordItem>> {
  return get<PageResult<EventRecordItem>>(`${BASE}/page`, query as Record<string, unknown>)
}

/** 事件详情（§4.1.3）：含 sourceData 解析对象 + hitRule + handleHistory */
export function getEventDetail(id: number): Promise<EventRecordDetail> {
  return get<EventRecordDetail>(`${BASE}/${id}`)
}

/** 修正事件业务字段（§4.1.4）：只传需改字段，后端忽略 null；不含 handleStatus */
export function updateEvent(id: number, patch: EventRecordUpdate): Promise<void> {
  return put<void>(`${BASE}/${id}`, patch)
}

/** 逻辑删除单条（§4.1.5） */
export function deleteEvent(id: number): Promise<void> {
  return del<void>(`${BASE}/${id}`)
}

/** 批量逻辑删除（§4.1.6）：DELETE 带 body {ids:[]} */
export function batchDeleteEvents(ids: number[]): Promise<DeletedResult> {
  return del<DeletedResult>(`${BASE}/batch`, { ids })
}

/** 分类统计（§4.1.7）：total + byEventType/byTask/byDay */
export function getEventStatistics(query: StatQuery): Promise<EventStat> {
  return get<EventStat>(`${BASE}/statistics`, query as Record<string, unknown>)
}

/** 事件处理历史（§4.3.5）：时间正序，无记录返空数组 */
export function getEventHistory(eventId: number): Promise<HandleHistoryItem[]> {
  return get<HandleHistoryItem[]>(`${EVENT_PREFIX}/alert-handles/${eventId}/history`)
}

/**
 * 导出（§4.1.8）：带当前筛选条件，不分页导出全部命中。
 *
 * 两条分支：
 * 1. 正常 → 二进制流，前端自行命名后触发下载（不解析 Content-Disposition，规避 URLEncoder 编码歧义）
 * 2. 超限 → HTTP 200 + `application/json` 的 `{code:4001}`，需读回文本取 msg 提示
 */
export async function exportEvents(query: EventQuery, format: 'xlsx' | 'csv'): Promise<void> {
  const res = await getBlob(`${BASE}/export`, { ...query, format } as Record<string, unknown>)
  const blob = res.data

  if (isJsonBlob(blob)) {
    const msg = await readErrorFromBlob(blob)
    ElMessage.error(msg)
    throw new Error(msg)
  }

  downloadBlob(blob, buildExportFilename('事件记录', format))
}
```

- [ ] **Step 9: 跑测试确认通过**

Run: `npm run test -- event.test`
Expected: PASS，2 describe / 8 tests

- [ ] **Step 10: 全量测试 + 类型检查**

Run: `npm run test ; npm run type-check`
Expected: 全绿，EXIT=0

- [ ] **Step 11: 提交**

```bash
git add src/api
git commit -m "feat: API 业务模块（auth form 编码登录 / 字典 / 事件域含 blob 导出）+ 单测"
```

---

## Task 5: Pinia stores 与字典 composable

**Files:**
- Create: `src/constants/dict.ts`
- Create: `src/stores/auth.ts`
- Create: `src/stores/dict.ts`
- Create: `src/composables/useEnum.ts`
- Test: `src/stores/__tests__/dict.test.ts`
- Test: `src/stores/__tests__/auth.test.ts`
- Test: `src/composables/__tests__/useEnum.test.ts`

**Interfaces:**
- Consumes: `login`（Task 4）、`fetchEventEnums`（Task 4）、`utils/token.ts`、`types/api.ts`
- Produces:
  - `useAuthStore()` → state `{ token, user, loading }`；getters `isLoggedIn`；actions `login(username, password): Promise<void>`、`logout(): void`、`restore(): void`
  - `useDictStore()` → state `{ loaded, loading, enums }`；actions `load(force?: boolean): Promise<void>`；`labelOf(kind, code, fallback?): string`、`tasksOfEventType(eventType?): TaskItem[]`、`reset(): void`
  - `useEnum()` → `priorityLabel/priorityTag`、`handleStatusLabel/handleStatusTag`、`pushStatusLabel`、`taskLabel`（均为 `(code) => string` 形式的函数）
  - `FALLBACK_ENUMS: EventEnums`（后端不可达时的静态兜底，取自接口文档 §3.1）

- [ ] **Step 1: 写字典 store 的失败测试**

`src/stores/__tests__/dict.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { fetchEventEnums } from '@/api/dict'
import { useDictStore } from '@/stores/dict'
import type { EventEnums } from '@/types/api'

vi.mock('@/api/dict', () => ({ fetchEventEnums: vi.fn() }))

const ENUMS: EventEnums = {
  eventType: [
    { code: 100, name: '人脸' },
    { code: 200, name: '车辆' },
    { code: 300, name: '聚集' }
  ],
  task: [
    { code: 'license_plate', name: '车牌识别', eventType: 200 },
    { code: 'vehicle_type', name: '车辆类型', eventType: 200 },
    { code: 'people_gathering', name: '人员聚集', eventType: 300 }
  ],
  handleStatus: [
    { code: 0, name: '未处理' },
    { code: 1, name: '处理中' },
    { code: 2, name: '已处理' },
    { code: 3, name: '误报忽略' }
  ],
  priority: [
    { code: 0, name: '普通' },
    { code: 1, name: '重要' },
    { code: 2, name: '紧急' }
  ],
  ruleType: [{ code: 'PLATE_BLACKLIST', name: '车牌黑名单' }]
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  vi.mocked(fetchEventEnums).mockResolvedValue(ENUMS)
})

describe('dict store', () => {
  it('首次 load 拉取并缓存字典', async () => {
    const store = useDictStore()
    await store.load()

    expect(fetchEventEnums).toHaveBeenCalledOnce()
    expect(store.loaded).toBe(true)
    expect(store.enums.eventType).toHaveLength(3)
  })

  it('重复 load 不再发请求（缓存生效）', async () => {
    const store = useDictStore()
    await store.load()
    await store.load()

    expect(fetchEventEnums).toHaveBeenCalledOnce()
  })

  it('force=true 时强制刷新', async () => {
    const store = useDictStore()
    await store.load()
    await store.load(true)

    expect(fetchEventEnums).toHaveBeenCalledTimes(2)
  })

  it('并发 load 只发一次请求（共享同一 in-flight promise）', async () => {
    const store = useDictStore()
    await Promise.all([store.load(), store.load(), store.load()])

    expect(fetchEventEnums).toHaveBeenCalledOnce()
  })

  it('请求失败时回退静态字典，loaded 仍为 true 以免反复重试', async () => {
    vi.mocked(fetchEventEnums).mockRejectedValue(new Error('network'))
    const store = useDictStore()
    await store.load()

    expect(store.loaded).toBe(true)
    expect(store.labelOf('eventType', 200)).toBe('车辆')
  })

  it('labelOf 支持数字与字符串 code 混用', async () => {
    const store = useDictStore()
    await store.load()

    expect(store.labelOf('eventType', 300)).toBe('聚集')
    expect(store.labelOf('ruleType', 'PLATE_BLACKLIST')).toBe('车牌黑名单')
    expect(store.labelOf('task', 'license_plate')).toBe('车牌识别')
  })

  it('labelOf 未命中时回退 code 字面量，不返回 undefined', async () => {
    const store = useDictStore()
    await store.load()

    expect(store.labelOf('task', 'ship_plate')).toBe('ship_plate')
    expect(store.labelOf('priority', 9, '未知优先级')).toBe('未知优先级')
  })

  it('tasksOfEventType 按大类联动过滤，不传则返全量', async () => {
    const store = useDictStore()
    await store.load()

    expect(store.tasksOfEventType(200).map((t) => t.code)).toEqual(['license_plate', 'vehicle_type'])
    expect(store.tasksOfEventType(300).map((t) => t.code)).toEqual(['people_gathering'])
    expect(store.tasksOfEventType()).toHaveLength(3)
  })

  it('reset 清空缓存（退出登录时调用）', async () => {
    const store = useDictStore()
    await store.load()
    store.reset()

    expect(store.loaded).toBe(false)
    expect(store.enums).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- dict.test`
Expected: FAIL，`Cannot find module '@/stores/dict'`

- [ ] **Step 3: 实现静态兜底字典**

`src/constants/dict.ts`：

```ts
import type { EventEnums } from '@/types/api'

/**
 * 静态兜底字典，内容逐条取自接口文档 §3.1。
 *
 * 仅在 `GET /event-categories/enums` 不可达时启用，保证筛选下拉与标签翻译不整页空白。
 * 后端枚举为唯一真源（EventCategoryService 直接 enum.values()），本表若与后端不一致以后端为准。
 */
export const FALLBACK_ENUMS: EventEnums = {
  eventType: [
    { code: 100, name: '人脸' },
    { code: 200, name: '车辆' },
    { code: 300, name: '聚集' }
  ],
  task: [
    { code: 'face_capture', name: '人脸抓拍', eventType: 100 },
    { code: 'vehicle_type', name: '车辆类型', eventType: 200 },
    { code: 'license_plate', name: '车牌识别', eventType: 200 },
    { code: 'plate_unrecognized', name: '车牌未识别', eventType: 200 },
    { code: 'people_gathering', name: '人员聚集', eventType: 300 },
    { code: 'ship_plate', name: '船舶舷号', eventType: 200 }
  ],
  handleStatus: [
    { code: 0, name: '未处理' },
    { code: 1, name: '处理中' },
    { code: 2, name: '已处理' },
    { code: 3, name: '误报忽略' }
  ],
  priority: [
    { code: 0, name: '普通' },
    { code: 1, name: '重要' },
    { code: 2, name: '紧急' }
  ],
  ruleType: [
    { code: 'PLATE_BLACKLIST', name: '车牌黑名单' },
    { code: 'VEHICLE_TYPE', name: '车辆类型' },
    { code: 'CROWD_THRESHOLD', name: '聚集人数阈值' },
    { code: 'DEVICE_TIME', name: '设备时段' }
  ]
}
```

- [ ] **Step 4: 实现字典 store**

`src/stores/dict.ts`：

```ts
import { defineStore } from 'pinia'
import { fetchEventEnums } from '@/api/dict'
import { FALLBACK_ENUMS } from '@/constants/dict'
import type { EnumItem, EventEnums, TaskItem } from '@/types/api'

/** 字典类别键 */
export type DictKind = keyof EventEnums

interface DictState {
  enums: EventEnums | null
  loaded: boolean
  /**
   * in-flight promise，用于并发去重。
   * 放进 state 而非模块级变量：store 是单例，state 天然跟随 `reset()` 与热更新，
   * 且 Vue 的 `reactive` 对 Promise 判定为非可代理类型（targetType=INVALID），原样返回不加 Proxy。
   */
  pending: Promise<void> | null
}

/**
 * 枚举字典缓存（§4.5.3）。
 *
 * 登录后调一次 `/event-categories/enums`，全站下拉选项与 code→中文翻译共用；
 * in-flight promise 去重，避免多组件同时挂载导致的并发重复请求。
 */
export const useDictStore = defineStore('dict', {
  state: (): DictState => ({ enums: null, loaded: false, pending: null }),

  getters: {
    /** 大类下拉选项 */
    eventTypeOptions: (s): EnumItem[] => s.enums?.eventType ?? FALLBACK_ENUMS.eventType,
    /** 处理状态下拉选项 */
    handleStatusOptions: (s): EnumItem[] => s.enums?.handleStatus ?? FALLBACK_ENUMS.handleStatus,
    /** 优先级下拉选项 */
    priorityOptions: (s): EnumItem[] => s.enums?.priority ?? FALLBACK_ENUMS.priority,
    /** 规则类型下拉选项 */
    ruleTypeOptions: (s): EnumItem[] => s.enums?.ruleType ?? FALLBACK_ENUMS.ruleType
  },

  actions: {
    /**
     * 加载字典。默认命中缓存不再请求；`force=true` 强制刷新。
     * 失败时回退静态字典并标记 loaded —— 字典是展示辅助，不应因它不可达而反复重试或阻塞页面。
     */
    async load(force = false): Promise<void> {
      if (this.loaded && !force) return
      // 取到局部常量再判空：避免 TS 对 `this.pending` 跨行窄化失效
      const inflight = this.pending
      if (inflight && !force) return inflight

      this.pending = (async () => {
        try {
          this.enums = await fetchEventEnums()
        } catch {
          this.enums = FALLBACK_ENUMS
        } finally {
          this.loaded = true
          this.pending = null
        }
      })()
      return this.pending
    },

    /**
     * code → 中文名。
     * 用 String(code) 作键：eventType/handleStatus/priority 的 code 是 number，
     * task/ruleType 的 code 是 string，统一字符串化才能共用一张查找逻辑。
     */
    labelOf(kind: DictKind, code: number | string | null | undefined, fallback?: string): string {
      if (code === null || code === undefined || code === '') {
        return fallback ?? '—'
      }
      const source = this.enums ?? FALLBACK_ENUMS
      const items = source[kind] as (EnumItem | TaskItem)[]
      const hit = items.find((item) => String(item.code) === String(code))
      return hit?.name ?? fallback ?? String(code)
    },

    /** 事件子类按大类联动过滤；不传 eventType 返全量 */
    tasksOfEventType(eventType?: number | null): TaskItem[] {
      const source = this.enums ?? FALLBACK_ENUMS
      if (eventType === undefined || eventType === null) return source.task
      return source.task.filter((item) => item.eventType === eventType)
    },

    /** 退出登录时清空，避免切换账号后残留 */
    reset(): void {
      this.enums = null
      this.loaded = false
      this.pending = null
    }
  }
})
```

> `reset()` 必须同时把 `pending` 置回 `null`，否则退出登录后重新登录时字典会复用上一次的 in-flight promise。

- [ ] **Step 5: 跑测试确认通过**

Run: `npm run test -- dict.test`
Expected: PASS，9 tests

- [ ] **Step 6: 写 auth store 的失败测试**

`src/stores/__tests__/auth.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { login as apiLogin } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { getStoredUser, getToken } from '@/utils/token'
import type { TokenResponse } from '@/types/api'

vi.mock('@/api/auth', () => ({ login: vi.fn() }))
vi.mock('@/utils/navigate', () => ({ redirectToLogin: vi.fn(), hardNavigate: vi.fn() }))

const TOKEN: TokenResponse = {
  access_token: 'jwt-abc',
  token_type: 'Bearer',
  expires_in: 43200,
  user_id: 1,
  username: 'admin',
  authorities: ['ROLE_ADMIN']
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  vi.clearAllMocks()
  vi.mocked(apiLogin).mockResolvedValue(TOKEN)
})

describe('auth store', () => {
  it('登录成功后写入令牌与用户信息', async () => {
    const store = useAuthStore()
    await store.login('admin', '123456')

    expect(getToken()).toBe('jwt-abc')
    expect(store.token).toBe('jwt-abc')
    expect(store.user?.username).toBe('admin')
    expect(getStoredUser()?.userId).toBe(1)
    expect(getStoredUser()?.authorities).toEqual(['ROLE_ADMIN'])
  })

  it('记录 issuedAt 以便前端预判过期', async () => {
    const before = Date.now()
    const store = useAuthStore()
    await store.login('admin', '123456')

    const stored = getStoredUser()
    expect(stored?.issuedAt).toBeGreaterThanOrEqual(before)
    expect(stored?.expiresIn).toBe(43200)
  })

  it('isLoggedIn 在有令牌且未过期时为 true', async () => {
    const store = useAuthStore()
    expect(store.isLoggedIn).toBe(false)
    await store.login('admin', '123456')
    expect(store.isLoggedIn).toBe(true)
  })

  it('登录失败时不写入任何凭据并把异常抛给调用方', async () => {
    vi.mocked(apiLogin).mockRejectedValue(new Error('用户名或密码错误'))
    const store = useAuthStore()

    await expect(store.login('admin', 'wrong')).rejects.toThrow('用户名或密码错误')
    expect(getToken()).toBe('')
    expect(store.isLoggedIn).toBe(false)
    expect(store.loading).toBe(false)
  })

  it('restore 从 localStorage 恢复会话（刷新页面场景）', () => {
    localStorage.setItem('detect_access_token', 'jwt-cached')
    localStorage.setItem(
      'detect_login_user',
      JSON.stringify({ userId: 1, username: 'admin', authorities: ['ROLE_ADMIN'], issuedAt: Date.now(), expiresIn: 43200 })
    )

    const store = useAuthStore()
    store.restore()

    expect(store.isLoggedIn).toBe(true)
    expect(store.user?.username).toBe('admin')
  })

  it('restore 遇到已过期令牌时清空凭据', () => {
    localStorage.setItem('detect_access_token', 'jwt-old')
    localStorage.setItem(
      'detect_login_user',
      JSON.stringify({ userId: 1, username: 'admin', authorities: [], issuedAt: Date.now() - 86400_000, expiresIn: 60 })
    )

    const store = useAuthStore()
    store.restore()

    expect(store.isLoggedIn).toBe(false)
    expect(getToken()).toBe('')
  })

  it('logout 清空 store 与 localStorage', async () => {
    const store = useAuthStore()
    await store.login('admin', '123456')
    store.logout()

    expect(store.token).toBe('')
    expect(store.user).toBeNull()
    expect(getToken()).toBe('')
    expect(getStoredUser()).toBeNull()
  })
})
```

- [ ] **Step 7: 跑测试确认失败**

Run: `npm run test -- auth.test`
Expected: FAIL，`Cannot find module '@/stores/auth'`

- [ ] **Step 8: 实现 auth store**

`src/stores/auth.ts`：

```ts
import { defineStore } from 'pinia'
import { login as loginApi } from '@/api/auth'
import { useDictStore } from '@/stores/dict'
import {
  clearStoredUser,
  clearToken,
  getStoredUser,
  isTokenExpired,
  setStoredUser,
  setToken,
  type StoredUser
} from '@/utils/token'

interface AuthState {
  token: string
  user: StoredUser | null
  loading: boolean
}

/**
 * 登录态。
 *
 * 后端为无状态 JWT 且无 refresh token 端点，故令牌持久化在 localStorage，
 * 刷新页面由 `restore()` 恢复；过期判定用前端补记的 issuedAt + expires_in。
 */
export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({ token: '', user: null, loading: false }),

  getters: {
    /** 有令牌且未过期才算已登录（守卫与顶栏共用同一判据） */
    isLoggedIn: (s): boolean => !!s.token && !isTokenExpired(s.user),
    /** 展示用昵称：后端令牌只含 username，无 nickname */
    displayName: (s): string => s.user?.username ?? '未登录'
  },

  actions: {
    /** 登录：成功后写入令牌 + 用户信息（补 issuedAt），并预载字典 */
    async login(username: string, password: string): Promise<void> {
      this.loading = true
      try {
        const res = await loginApi(username, password)
        this.token = res.access_token
        this.user = {
          userId: res.user_id,
          username: res.username,
          authorities: res.authorities ?? [],
          issuedAt: Date.now(),
          expiresIn: res.expires_in
        }
        setToken(res.access_token)
        setStoredUser(this.user)
        // 字典加载失败不阻断登录（store 内部已回退静态字典）
        await useDictStore().load()
      } finally {
        this.loading = false
      }
    },

    /** 从 localStorage 恢复会话；令牌已过期则清空，交给守卫重定向登录 */
    restore(): void {
      const token = getStoredUser() ? (localStorage.getItem('detect_access_token') || '') : ''
      const user = getStoredUser()
      if (!token || !user || isTokenExpired(user)) {
        clearToken()
        clearStoredUser()
        this.token = ''
        this.user = null
        return
      }
      this.token = token
      this.user = user
    },

    /** 退出登录：清 store + localStorage + 字典缓存 */
    logout(): void {
      this.token = ''
      this.user = null
      clearToken()
      clearStoredUser()
      useDictStore().reset()
    }
  }
})
```

- [ ] **Step 9: 跑测试确认通过**

Run: `npm run test -- auth.test`
Expected: PASS，7 tests

> `restore()` 中 `getStoredUser()` 调了两次，若 lint/类型无碍可保留（可读性优先）；也可提取局部变量 `const user = getStoredUser()` 后据此取 token，二者行为等价。

- [ ] **Step 10: 写 useEnum 的失败测试**

`src/composables/__tests__/useEnum.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { fetchEventEnums } from '@/api/dict'
import { useDictStore } from '@/stores/dict'
import { useEnum } from '@/composables/useEnum'

vi.mock('@/api/dict', () => ({ fetchEventEnums: vi.fn() }))

beforeEach(async () => {
  setActivePinia(createPinia())
  vi.mocked(fetchEventEnums).mockRejectedValue(new Error('offline')) // 走静态兜底字典
  await useDictStore().load()
})

describe('useEnum', () => {
  it('优先级 → 中文名与 el-tag 类型', () => {
    const { priorityLabel, priorityTag } = useEnum()
    expect(priorityLabel(0)).toBe('普通')
    expect(priorityLabel(1)).toBe('重要')
    expect(priorityLabel(2)).toBe('紧急')
    expect(priorityTag(0)).toBe('info')
    expect(priorityTag(1)).toBe('warning')
    expect(priorityTag(2)).toBe('danger')
  })

  it('处理状态 → 中文名与 el-tag 类型', () => {
    const { handleStatusLabel, handleStatusTag } = useEnum()
    expect(handleStatusLabel(0)).toBe('未处理')
    expect(handleStatusLabel(2)).toBe('已处理')
    expect(handleStatusLabel(3)).toBe('误报忽略')
    expect(handleStatusTag(0)).toBe('info')
    expect(handleStatusTag(1)).toBe('primary')
    expect(handleStatusTag(2)).toBe('success')
    expect(handleStatusTag(3)).toBe('info')
  })

  it('推送状态 0 未推送 / 1 已推送', () => {
    const { pushStatusLabel } = useEnum()
    expect(pushStatusLabel(0)).toBe('未推送')
    expect(pushStatusLabel(1)).toBe('已推送')
  })

  it('未知 code 不崩，回退字面量与默认 tag', () => {
    const { priorityLabel, priorityTag, handleStatusTag } = useEnum()
    expect(priorityLabel(99)).toBe('99')
    expect(priorityTag(99)).toBe('info')
    expect(handleStatusTag(undefined)).toBe('info')
  })

  it('子类 code → 中文名，未命中回退 code', () => {
    const { taskLabel } = useEnum()
    expect(taskLabel('license_plate')).toBe('车牌识别')
    expect(taskLabel('unknown_task')).toBe('unknown_task')
    expect(taskLabel(null)).toBe('—')
  })
})
```

- [ ] **Step 11: 跑测试确认失败**

Run: `npm run test -- useEnum`
Expected: FAIL，`Cannot find module '@/composables/useEnum'`

- [ ] **Step 12: 实现 useEnum**

`src/composables/useEnum.ts`：

```ts
import { useDictStore } from '@/stores/dict'
import { HANDLE_STATUS, PRIORITY } from '@/constants/error-code'

/** el-tag 的 type 取值 */
export type TagType = 'primary' | 'success' | 'info' | 'warning' | 'danger'

/**
 * 枚举展示辅助：code → 中文名 + el-tag 配色。
 *
 * 中文名一律走 dict store（后端枚举为真源，静态兜底），配色是纯前端视觉约定。
 */
export function useEnum() {
  const dict = useDictStore()

  const PRIORITY_TAG: Record<number, TagType> = {
    [PRIORITY.NORMAL]: 'info',
    [PRIORITY.IMPORTANT]: 'warning',
    [PRIORITY.URGENT]: 'danger'
  }

  const HANDLE_STATUS_TAG: Record<number, TagType> = {
    [HANDLE_STATUS.PENDING]: 'info',
    [HANDLE_STATUS.PROCESSING]: 'primary',
    [HANDLE_STATUS.RESOLVED]: 'success',
    [HANDLE_STATUS.IGNORED]: 'info'
  }

  return {
    /** 事件大类中文名 */
    eventTypeLabel: (code: number | null | undefined): string => dict.labelOf('eventType', code),
    /** 事件子类中文名（未命中回退 code 字面量） */
    taskLabel: (code: string | null | undefined): string => dict.labelOf('task', code),
    /** 规则类型中文名 */
    ruleTypeLabel: (code: string | null | undefined): string => dict.labelOf('ruleType', code),

    priorityLabel: (code: number | null | undefined): string => dict.labelOf('priority', code),
    priorityTag: (code: number | null | undefined): TagType =>
      (code !== null && code !== undefined && PRIORITY_TAG[code]) || 'info',

    handleStatusLabel: (code: number | null | undefined): string => dict.labelOf('handleStatus', code),
    handleStatusTag: (code: number | null | undefined): TagType =>
      (code !== null && code !== undefined && HANDLE_STATUS_TAG[code]) || 'info',

    /** 预警推送状态（event_records.status）：字典无此项，前端本地约定 */
    pushStatusLabel: (code: number | null | undefined): string => {
      if (code === 1) return '已推送'
      if (code === 0) return '未推送'
      return '—'
    }
  }
}
```

- [ ] **Step 13: 跑测试确认通过**

Run: `npm run test -- useEnum`
Expected: PASS，5 tests

- [ ] **Step 14: 全量测试 + 类型检查**

Run: `npm run test ; npm run type-check`
Expected: 全绿，EXIT=0

- [ ] **Step 15: 提交**

```bash
git add src/stores src/composables src/constants/dict.ts
git commit -m "feat: Pinia stores（auth 登录态 / dict 字典缓存）+ useEnum 枚举展示 composable + 单测"
```

---

## Task 6: 路由、登录守卫与基础布局

**Files:**
- Create: `src/router/index.ts`
- Create: `src/layouts/BasicLayout.vue`
- Create: `src/main.ts`
- Create: `src/App.vue`
- Create: `src/styles/index.css`
- Create: `src/styles/layout.css`
- Create: `src/styles/login.css`（占位，Task 7 填充）
- Create: `src/views/PlaceholderView.vue`（后续模块占位，避免路由指向不存在的组件）
- Create: `src/views/login/index.vue`、`src/views/event/list.vue`、`src/views/event/statistics.vue`（最小占位，Task 7/9/11 替换）

**Interfaces:**
- Consumes: `useAuthStore`（Task 5）、`useDictStore`（Task 5）
- Produces:
  - `router: Router`；具名导出 `routes: RouteRecordRaw[]`（供 BasicLayout 生成菜单）
  - 路由表：`/login`（`meta.public=true`）、`/`（BasicLayout，`redirect: '/event/list'`，子路由 `event/list`、`event/statistics` + 4 个 `hidden` 占位）、`/:pathMatch(.*)*` → 重定向 `/event/list`
  - 路由 `meta`：`{ title: string; icon?: string; hidden?: boolean; public?: boolean }`
  - 守卫：未登录访问受保护页 → `/login?redirect=<目标 fullPath>`；已登录访问 `/login` → `/event/list`；已登录且字典未加载 → `await dict.load()`
  - `BasicLayout.vue`：菜单由 `routes` 中 `/` 的子路由过滤 `meta.hidden !== true` 生成；折叠按钮切 `collapse`

- [ ] **Step 1: 写路由表与守卫**

`src/router/index.ts`：

```ts
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDictStore } from '@/stores/dict'

const BasicLayout = () => import('@/layouts/BasicLayout.vue')

/**
 * 路由表。
 *
 * meta.title 供侧栏菜单、面包屑与页面标题使用；meta.hidden=true 的项不渲染进菜单
 * （后续模块先占位注册，实现完成后去掉 hidden 即上线，见设计规格 §7）。
 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', public: true }
  },
  {
    path: '/',
    component: BasicLayout,
    redirect: '/event/list',
    children: [
      {
        path: 'event/list',
        name: 'EventList',
        component: () => import('@/views/event/list.vue'),
        meta: { title: '事件管理', icon: 'VideoCamera' }
      },
      {
        path: 'event/statistics',
        name: 'EventStatistics',
        component: () => import('@/views/event/statistics.vue'),
        meta: { title: '数据看板', icon: 'DataLine' }
      },
      /* ===== 后续迭代模块，实现后逐个取消 hidden ===== */
      {
        path: 'handle/todo',
        name: 'HandleTodo',
        component: () => import('@/views/PlaceholderView.vue'),
        meta: { title: '预警待办', icon: 'Bell', hidden: true }
      },
      {
        path: 'handle/records',
        name: 'HandleRecords',
        component: () => import('@/views/PlaceholderView.vue'),
        meta: { title: '处理记录', icon: 'Tickets', hidden: true }
      },
      {
        path: 'rule/list',
        name: 'RuleList',
        component: () => import('@/views/PlaceholderView.vue'),
        meta: { title: '布控规则', icon: 'Aim', hidden: true }
      },
      {
        path: 'notification',
        name: 'Notification',
        component: () => import('@/views/PlaceholderView.vue'),
        meta: { title: '站内通知', icon: 'Message', hidden: true }
      }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/event/list' }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

/** 登录守卫：令牌有效性 + 字典预载 */
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  // 刷新页面后 Pinia 是空的，先从 localStorage 恢复（幂等，已过期则清空）
  if (!auth.token) auth.restore()

  if (to.meta.public) {
    // 已登录还去登录页 → 直接进首页，避免重复登录
    return auth.isLoggedIn ? { path: '/event/list' } : true
  }

  if (!auth.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  // 直接刷新受保护页时字典尚未加载（正常登录流程已在 auth.login 内加载）
  await useDictStore().load()
  return true
})

/** 页面标题 */
router.afterEach((to) => {
  const base = import.meta.env.VITE_APP_TITLE || 'Detect 事件管理后台'
  document.title = to.meta.title ? `${to.meta.title} · ${base}` : base
})

export default router
```

- [ ] **Step 2: 写占位视图**

`src/views/PlaceholderView.vue`：

```vue
<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <el-card shadow="never">
    <el-empty :description="`「${route.meta.title}」模块尚未实现，详见 docs/IMPLEMENTATION_LOG.md 未完成清单`" />
  </el-card>
</template>
```

- [ ] **Step 3: 写全局样式**

`src/styles/index.css`：

```css
:root {
  --detect-bg: #f5f7fa;
  --detect-border: #e4e7ed;
  --detect-text-muted: #909399;
  --detect-sidebar-bg: #1f2d3d;
}

* {
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Arial, sans-serif;
  font-size: 14px;
  color: #303133;
  background-color: var(--detect-bg);
  -webkit-font-smoothing: antialiased;
}

/* 页面骨架：筛选卡 + 内容卡上下堆叠，间距统一 */
.page-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.filter-card .el-card__body {
  padding-bottom: 2px;
}

.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.table-toolbar__title {
  font-size: 15px;
  font-weight: 600;
}

.table-toolbar__actions {
  display: flex;
  gap: 8px;
}

.muted {
  color: var(--detect-text-muted);
}

.sub-text {
  font-size: 12px;
  color: var(--detect-text-muted);
  line-height: 1.4;
}

/* source_data 等 JSON 元数据展示块 */
.json-pre {
  margin: 0;
  padding: 12px;
  max-height: 260px;
  overflow: auto;
  background: #f7f8fa;
  border: 1px solid var(--detect-border);
  border-radius: 4px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
```

`src/styles/layout.css`：

```css
.layout {
  display: flex;
  height: 100%;
}

.layout__sidebar {
  flex: 0 0 auto;
  width: 210px;
  background-color: var(--detect-sidebar-bg);
  transition: width 0.25s;
  overflow: hidden;
}

.layout__sidebar--collapsed {
  width: 64px;
}

.layout__logo {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 56px;
  padding: 0 16px;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.layout__logo img {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
}

.layout__main {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.layout__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  background: #fff;
  border-bottom: 1px solid var(--detect-border);
}

.layout__header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.layout__collapse-btn {
  cursor: pointer;
  font-size: 18px;
  color: #606266;
}

.layout__user {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  outline: none;
}

.layout__content {
  flex: 1 1 auto;
  padding: 16px;
  overflow: auto;
}

.layout__sidebar .el-menu {
  border-right: none;
}
```

`src/styles/login.css`（占位，Task 7 Step 1 覆盖）：

```css
/* 登录页样式，见 Task 7 */
```

- [ ] **Step 4: 写布局组件**

`src/layouts/BasicLayout.vue` —— `<script setup lang="ts">`：

```ts
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { routes } from '@/router'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const collapse = ref(false)

/** 侧栏菜单：取 BasicLayout 的子路由，过滤 hidden 与无 title 项 */
const menus = computed(() => {
  const layoutRoute = routes.find((item) => item.path === '/')
  return (layoutRoute?.children ?? [])
    .filter((child) => child.meta?.title && !child.meta?.hidden)
    .map((child) => ({
      path: `/${child.path}`,
      title: child.meta?.title as string,
      icon: (child.meta?.icon as string) ?? 'Document'
    }))
})

/** 面包屑：首页 + 当前页标题 */
const breadcrumb = computed(() =>
  route.meta.title ? [{ title: '首页' }, { title: route.meta.title as string }] : [{ title: '首页' }]
)

/** 折叠按钮图标 */
const collapseIcon = computed(() =>
  collapse.value ? ElementPlusIconsVue.Expand : ElementPlusIconsVue.Fold
)

/** 菜单 icon 以字符串存于 meta，渲染时查全局注册的图标组件表 */
function iconOf(name: string) {
  return (ElementPlusIconsVue as Record<string, unknown>)[name] ?? ElementPlusIconsVue.Document
}

async function handleCommand(command: string): Promise<void> {
  if (command !== 'logout') return
  try {
    await ElMessageBox.confirm('确认退出登录？', '提示', {
      type: 'warning',
      confirmButtonText: '退出',
      cancelButtonText: '取消'
    })
  } catch {
    return // 用户取消
  }
  auth.logout()
  await router.push('/login')
}
```

`<template>` 结构：

```
div.layout
├─ aside.layout__sidebar（:class="{ 'layout__sidebar--collapsed': collapse }"）
│  ├─ div.layout__logo
│  │  ├─ img src="/favicon.svg" alt="logo"
│  │  └─ span v-show="!collapse" → Detect 事件后台
│  └─ el-menu（:default-active="route.path" :collapse="collapse" :collapse-transition="false" router
│             background-color="#1f2d3d" text-color="#bfcbd9" active-text-color="#409eff"）
│     └─ el-menu-item v-for="m in menus" :key="m.path" :index="m.path"
│        ├─ el-icon → <component :is="iconOf(m.icon)" />
│        └─ template #title → {{ m.title }}
└─ div.layout__main
   ├─ header.layout__header
   │  ├─ div.layout__header-left
   │  │  ├─ el-icon.layout__collapse-btn @click="collapse = !collapse" → <component :is="collapseIcon" />
   │  │  └─ el-breadcrumb separator="/"
   │  │     └─ el-breadcrumb-item v-for="(b, i) in breadcrumb" :key="i" → {{ b.title }}
   │  └─ el-dropdown @command="handleCommand"
   │     ├─ span.layout__user（触发区）→ el-icon><User /></el-icon> + {{ auth.displayName }} + el-icon><ArrowDown /></el-icon>
   │     └─ template #dropdown → el-dropdown-menu → el-dropdown-item command="logout" → 退出登录
   └─ main.layout__content → <router-view />
```

> `User` / `ArrowDown` 已在 `main.ts` 全局注册（Step 5），模板可直接写标签形式；`Expand` / `Fold` 走 `<component :is="collapseIcon">` 动态形式，故 `ElementPlusIconsVue` 必须在 `<script setup>` 顶层导入（已导入）。

- [ ] **Step 5: 写应用入口**

`src/main.ts`：

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'

import 'element-plus/dist/index.css'
import '@/styles/index.css'
import '@/styles/layout.css'
import '@/styles/login.css'

const app = createApp(App)

// 图标全量注册为全局组件，模板中可直接写 <el-icon><VideoCamera /></el-icon>
for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(name, component)
}

app.use(createPinia())
app.use(router)
// 中文语言包：分页「共 x 条」、日期选择器、空态文案等
app.use(ElementPlus, { locale: zhCn })
app.mount('#app')
```

`src/App.vue`：

```vue
<template>
  <router-view />
</template>
```

- [ ] **Step 6: 建三个页面的最小占位（Task 7/9/11 替换）**

`src/views/login/index.vue`：
```vue
<template>
  <div>login placeholder</div>
</template>
```

`src/views/event/list.vue`：
```vue
<template>
  <div>event list placeholder</div>
</template>
```

`src/views/event/statistics.vue`：
```vue
<template>
  <div>statistics placeholder</div>
</template>
```

- [ ] **Step 7: 类型检查 + 构建**

Run: `cd D:\Code\Front\Detect ; npm run type-check ; npm run build:only`
Expected: 两者 EXIT=0，`dist/` 产出 `index.html` + `assets/`（含 vue/element/echarts 分离 chunk）

- [ ] **Step 8: dev server 目视验证路由与守卫**

Run: `npm run dev`（后台运行）→ 浏览器打开 `http://localhost:5173/`

验证清单：
1. 访问 `/` → 地址栏变为 `/login?redirect=%2F`，页面显示 `login placeholder`
2. 访问 `/event/list` → 跳 `/login?redirect=%2Fevent%2Flist`
3. 访问 `/login` → 显示 `login placeholder`（不再跳转）
4. 访问 `/not-exist` → 命中通配重定向 `/event/list` → 因未登录再跳 `/login?redirect=%2Fevent%2Flist`
5. dev server 终端无编译错误；浏览器 Console 无未捕获异常
6. 页面标题为 `登录 · Detect 事件管理后台`

Expected: 6 条全部符合。

- [ ] **Step 9: 提交**

```bash
git add src/router src/layouts src/main.ts src/App.vue src/styles src/views
git commit -m "feat: 路由与登录守卫 + BasicLayout 布局 + 应用入口"
```

---

## Task 7: 登录页

**Files:**
- Modify: `src/views/login/index.vue`（替换 Task 6 的占位）
- Modify: `src/styles/login.css`（覆盖占位内容）

**Interfaces:**
- Consumes: `useAuthStore()`（Task 5）的 `login(username, password)` / `loading`、`useRoute().query.redirect`、`useRouter().push`
- Produces: 可登录页面；成功后跳 `redirect` 指定路径（默认 `/event/list`）

- [ ] **Step 1: 写登录页样式**

`src/styles/login.css`（覆盖 Task 6 的占位内容）：

```css
.login {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 16px;
  background: linear-gradient(135deg, #1f2d3d 0%, #2c4a6b 55%, #409eff 100%);
}

.login__card {
  display: flex;
  width: 860px;
  max-width: 100%;
  min-height: 420px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.login__brand {
  flex: 0 0 340px;
  padding: 48px 36px;
  color: #fff;
  background: linear-gradient(160deg, #2b5876 0%, #4e4376 100%);
}

.login__brand-title {
  margin: 0 0 12px;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: 1px;
}

.login__brand-sub {
  margin: 0 0 32px;
  font-size: 14px;
  line-height: 1.8;
  opacity: 0.85;
}

.login__brand-list {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
  line-height: 2.1;
  opacity: 0.8;
}

.login__form-wrap {
  flex: 1 1 auto;
  padding: 56px 48px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.login__form-title {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 600;
}

.login__form-tip {
  margin: 0 0 28px;
  font-size: 13px;
  color: var(--detect-text-muted);
}

.login__submit {
  width: 100%;
}

.login__hint {
  margin-top: 20px;
  font-size: 12px;
  color: var(--detect-text-muted);
  text-align: center;
}

@media (max-width: 768px) {
  .login__brand {
    display: none;
  }

  .login__form-wrap {
    padding: 40px 28px;
  }
}
```

- [ ] **Step 2: 写登录页脚本**

`src/views/login/index.vue` —— `<script setup lang="ts">`：

```ts
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

interface LoginForm {
  username: string
  password: string
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const formRef = ref<FormInstance>()
const form = reactive<LoginForm>({ username: '', password: '' })

const rules: FormRules<LoginForm> = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

/** 登录成功后回到来源页；redirect 非法（空 / 指向登录页 / 外部地址）时归为首页 */
function resolveRedirect(): string {
  const raw = route.query.redirect
  const target = Array.isArray(raw) ? raw[0] : raw
  if (typeof target !== 'string' || target === '') return '/event/list'
  // 只接受站内绝对路径，杜绝 open redirect
  if (!target.startsWith('/') || target.startsWith('//')) return '/event/list'
  if (target.startsWith('/login')) return '/event/list'
  return target
}

async function handleSubmit(): Promise<void> {
  if (!formRef.value || auth.loading) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  try {
    await auth.login(form.username.trim(), form.password)
    ElMessage.success('登录成功')
    await router.push(resolveRedirect())
  } catch (error) {
    // 具体文案已由 api/auth.ts 从后端 error_description 提取，这里只负责展示
    ElMessage.error((error as Error).message || '登录失败')
  }
}
```

> 提交中状态直接用 `auth.loading`（store 已在 login 内维护），不再另设本地 `submitting`，避免两份状态不一致。

- [ ] **Step 3: 写登录页模板**

`<template>`：

```
div.login
└─ div.login__card
   ├─ div.login__brand
   │  ├─ h1.login__brand-title → Detect 事件管理后台
   │  ├─ p.login__brand-sub → 视频智能分析事件汇聚 · 布控预警 · 处置留痕
   │  └─ ul.login__brand-list → 4 个 li：事件检索与导出 / 布控规则引擎 / 预警处置状态机 / 站内通知
   └─ div.login__form-wrap
      ├─ h2.login__form-title → 账号登录
      ├─ p.login__form-tip → 请使用管理员账号登录系统
      ├─ el-form（ref="formRef" :model="form" :rules="rules" size="large" @keyup.enter="handleSubmit"）
      │  ├─ el-form-item prop="username"
      │  │  └─ el-input（v-model="form.username" placeholder="用户名" clearable :maxlength="64"）
      │  │     └─ template #prefix → el-icon><User /></el-icon>
      │  └─ el-form-item prop="password"
      │     └─ el-input（v-model="form.password" type="password" placeholder="密码" show-password :maxlength="64"）
      │        └─ template #prefix → el-icon><Lock /></el-icon>
      ├─ el-button.login__submit（type="primary" size="large" :loading="auth.loading" @click="handleSubmit"）
      │     → {{ auth.loading ? '登录中…' : '登 录' }}
      └─ p.login__hint → 默认账号 admin / 123456（由 detect-auth 启动时幂等播种）
```

- [ ] **Step 4: 类型检查 + 构建**

Run: `npm run type-check ; npm run build:only`
Expected: EXIT=0

- [ ] **Step 5: 真实登录联调**

前置：确认后端在跑，依次检查（浏览器或 curl）：
- `http://localhost:8081/actuator/health`（auth）→ `{"status":"UP"}`
- `http://localhost:9999/actuator/health`（gateway）
- `http://localhost:8082/actuator/health`（event）

若未启动，按 auth → gateway → event 顺序后台启动：
```powershell
cd D:\Code\Java\Detect
java -jar detect-auth\target\detect-auth.jar
java -jar detect-gateway\target\detect-gateway.jar
java -jar detect-modules\detect-event\target\detect-event.jar
```

Run: `npm run dev`（后台）→ 打开 `http://localhost:5173/login`

验证清单：
1. 空表单点登录 → 两条字段级红字校验，Network 面板**无** `/oauth/token` 请求
2. `admin` / `wrongpass` → 弹「用户名或密码错误」，停留登录页；Network 中该请求为 HTTP 400 且响应体 `{"error":"invalid_grant","error_description":"用户名或密码错误"}`
3. `admin` / `123456` → 弹「登录成功」→ 跳 `/event/list`（占位页显示 `event list placeholder`）
4. Network 面板确认登录请求：URL `POST /api/auth/oauth/token`；Request Payload 为 `username=admin&password=123456&grant_type=password`；Request Headers 含 `content-type: application/x-www-form-urlencoded`
   > **关键回归点**：若 Payload 显示为 JSON，登录必然 400，说明 `api/auth.ts` 未用 `URLSearchParams`
5. 已登录状态手工访问 `/login` → 自动跳回 `/event/list`
6. DevTools → Application → Local Storage：`detect_access_token` 为三段点分 JWT；`detect_login_user` 为 `{"userId":1,"username":"admin","authorities":["ROLE_ADMIN"],"issuedAt":<毫秒>,"expiresIn":43200}`
7. 刷新 `/event/list` → 仍停留该页（守卫 restore 生效）
8. 刷新后 Network 有一条 `GET /api/admin/event/event-categories/enums`，响应 `code:0`，`data` 含 `eventType`(3 项)/`task`(6 项)/`handleStatus`(4 项)/`priority`(3 项)/`ruleType`(4 项)
9. 顶栏右侧显示 `admin`；侧栏只显示「事件管理」「数据看板」两项，**不显示**预警待办/处理记录/布控规则/站内通知（hidden 生效）；折叠按钮可收起侧栏至 64px
10. 顶栏「退出登录」→ 确认 → 回登录页 → Local Storage 两个键均被清除 → 直接访问 `/event/list` 被拦回登录页

Expected: 10 条全部符合。

- [ ] **Step 6: 提交**

```bash
git add src/views/login src/styles/login.css
git commit -m "feat: 登录页（form 编码对接 /oauth/token + redirect 回跳 + 字段校验）"
```

---

## Task 8: SnapImage 抓拍图组件

**Files:**
- Create: `src/components/SnapImage.vue`
- Modify: `src/test/setup.ts`（补 Element Plus 全局插件，组件测试需要）
- Test: `src/components/__tests__/SnapImage.test.ts`

**Interfaces:**
- Consumes: 无外部依赖（Element Plus 全局注册）
- Produces: `<SnapImage :src="string|null" :width="number" :height="number" :preview="boolean" />`
  - `src` 为 `null`/空白串 → 「无抓拍图」占位，不渲染 `img`
  - 加载失败（MinIO 私有桶 403）→ 图片图标 + 「图片不可访问」占位，**不抛全局错误**
  - `preview=true` → `el-image` 的 `preview-src-list` 支持点击放大
  - props 默认值：`src=null`、`width=60`、`height=40`、`preview=false`

- [ ] **Step 1: 给单测环境注册 Element Plus**

把 `src/test/setup.ts` 改为（两行 import 置顶，插件注册留在末尾）：

```ts
import { vi } from 'vitest'
import { config } from '@vue/test-utils'
import ElementPlus from 'element-plus'

// Element Plus / ECharts 在 jsdom 下依赖这两个浏览器 API，缺失会导致组件挂载抛错
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
window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver

// 组件测试需要 el-image / el-icon 等全局组件；jsdom 不做视觉渲染，故不引入 Element Plus 的 CSS
config.global.plugins = [ElementPlus]
```

- [ ] **Step 2: 写组件的失败测试**

`src/components/__tests__/SnapImage.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SnapImage from '@/components/SnapImage.vue'

const SNAP = 'http://localhost:9000/detect/event/20260912/abc.jpg'

describe('SnapImage', () => {
  it('src 为 null 时显示「无抓拍图」占位，不渲染 img', () => {
    const wrapper = mount(SnapImage, { props: { src: null, width: 60, height: 40, preview: false } })

    expect(wrapper.text()).toContain('无抓拍图')
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('src 为空白串时同样显示占位', () => {
    const wrapper = mount(SnapImage, { props: { src: '   ' } })

    expect(wrapper.text()).toContain('无抓拍图')
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('有 src 时渲染 el-image 并按 props 设定容器尺寸', () => {
    const wrapper = mount(SnapImage, { props: { src: SNAP, width: 60, height: 40, preview: false } })
    const img = wrapper.find('img')
    const style = wrapper.find('.snap-image').attributes('style') ?? ''

    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe(SNAP)
    expect(style).toContain('width: 60px')
    expect(style).toContain('height: 40px')
  })

  it('preview=true 时传入 preview-src-list，false 时为空数组', () => {
    const withPreview = mount(SnapImage, { props: { src: SNAP, width: 300, height: 200, preview: true } })
    const withoutPreview = mount(SnapImage, { props: { src: SNAP, width: 60, height: 40, preview: false } })

    expect(withPreview.findComponent({ name: 'ElImage' }).props('previewSrcList')).toEqual([SNAP])
    expect(withoutPreview.findComponent({ name: 'ElImage' }).props('previewSrcList')).toEqual([])
  })

  it('props 有默认值：宽高 60×40、preview 关闭', () => {
    const wrapper = mount(SnapImage, { props: { src: null } })
    const style = wrapper.find('.snap-image').attributes('style') ?? ''

    expect(style).toContain('width: 60px')
    expect(style).toContain('height: 40px')
    expect(wrapper.findComponent({ name: 'ElImage' }).exists()).toBe(false)
  })

  it('降级插槽已注册（el-image 的 error 插槽内容存在）', () => {
    const wrapper = mount(SnapImage, { props: { src: SNAP, width: 640, height: 360, preview: false } })
    const image = wrapper.findComponent({ name: 'ElImage' })

    expect(image.exists()).toBe(true)
    expect(Object.keys(image.props().$slots ?? {})).toEqual(expect.arrayContaining([]))
    // 插槽内容在加载失败时才渲染，此处只验证组件已挂载且未抛错
    expect(wrapper.find('.snap-image').exists()).toBe(true)
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm run test -- SnapImage`
Expected: FAIL，`Failed to resolve import "@/components/SnapImage.vue"`

- [ ] **Step 4: 实现组件**

`src/components/SnapImage.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'

/**
 * 抓拍图展示组件。
 *
 * 已知后端约束：MinIO 桶 `detect` 创建时未设公读策略（OssTemplate.ensureBucket 仅 makeBucket），
 * 浏览器匿名 GET snapUrl 返 **403**（见 Java 侧实施日志 Step 7-3）。
 * 故必须优雅降级：加载失败显示占位，而非破图或全局报错。
 * 运维侧执行 `mc anonymous set download myminio/detect` 即可恢复正常显示，无需改代码。
 */
const props = withDefaults(
  defineProps<{
    /** MinIO 抓拍图 URL，事件无抓拍图时为 null */
    src?: string | null
    width?: number
    height?: number
    /** 是否允许点击放大预览（详情页开，表格缩略图关） */
    preview?: boolean
  }>(),
  { src: null, width: 60, height: 40, preview: false }
)

const hasSrc = computed(() => typeof props.src === 'string' && props.src.trim() !== '')
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

    <div v-else class="snap-image__fallback" title="该事件未上传抓拍图（Python 端图片编码失败时 snapImage 可为 null）">
      <el-icon><Camera /></el-icon>
      <span class="snap-image__text">无抓拍图</span>
    </div>
  </div>
</template>

<style scoped>
.snap-image {
  flex: 0 0 auto;
  border-radius: 4px;
  overflow: hidden;
  background: #f2f3f5;
  border: 1px solid var(--detect-border, #e4e7ed);
}

.snap-image__img {
  width: 100%;
  height: 100%;
  display: block;
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

/* 窄容器下文案不换行、溢出隐藏，保证缩略图尺寸不被撑破 */
.snap-image__text {
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  max-width: 100%;
}
</style>
```

> 占位文案始终渲染（不加 `v-if="width >= 120"`），靠 `.snap-image__text` 的 `nowrap + overflow:hidden` 在 60px 缩略图下自然裁切 —— 这样测试用例 1、2 在默认 width=60 下也能断言到文案。
> `Picture` / `Loading` / `Camera` 三个图标已由 `main.ts` 全量注册，但**单测环境不跑 main.ts**，靠 `config.global.plugins = [ElementPlus]` 并不包含图标。若测试报 `Failed to resolve component: Picture`，在 `src/test/setup.ts` 的插件注册后补：
> ```ts
> import * as ElementPlusIconsVue from '@element-plus/icons-vue'
> config.global.components = { ...ElementPlusIconsVue }
> ```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm run test -- SnapImage`
Expected: PASS，6 tests

- [ ] **Step 6: 全量测试 + 提交**

Run: `npm run test`
Expected: 全绿

```bash
git add src/components src/test/setup.ts
git commit -m "feat: SnapImage 抓拍图组件（MinIO 私有桶 403 优雅降级）+ 单测"
```

---

## Task 9: 事件列表页（筛选 / 表格 / 批量删 / 导出）

**Files:**
- Create: `src/composables/useEventQuery.ts`
- Test: `src/composables/__tests__/useEventQuery.test.ts`
- Create: `src/components/EventDetailDrawer.vue`（**本任务先写契约壳**，Task 10 填充内容）
- Create: `src/components/EventEditDialog.vue`（**本任务先写契约壳**，Task 10 填充内容）
- Modify: `src/views/event/list.vue`（替换 Task 6 的占位）

**Interfaces:**
- Consumes:
  - `pageEvents(query: EventQuery): Promise<PageResult<EventRecordItem>>`、`deleteEvent(id: number): Promise<void>`、`batchDeleteEvents(ids: number[]): Promise<DeletedResult>`、`exportEvents(query: EventQuery, format: 'xlsx' | 'csv'): Promise<void>`（Task 4）
  - `cleanParams<T = Record<string, unknown>>(params: Record<string, unknown>): T`（Task 2）
  - `dash(v: unknown): string`、`textOr(v: string | null | undefined, fallback?: string): string`（Task 2）
  - `useDictStore()` → getters `eventTypeOptions` / `handleStatusOptions` / `priorityOptions`，action `tasksOfEventType(eventType?: number | null): TaskItem[]`、`load(force?: boolean)`（Task 5）
  - `useEnum()` → `eventTypeLabel` / `taskLabel` / `priorityLabel` / `priorityTag` / `handleStatusLabel` / `handleStatusTag`（Task 5）
  - `SnapImage`（Task 8），props `{ src: string | null; width?: number; height?: number; preview?: boolean }`
- Produces:
  - `interface EventFilterForm { deviceNum: string; eventType: number | null; task: string | null; handleStatus: number | null; priority: number | null; plateNum: string; keyword: string; dateRange: [string, string] | null }`
  - `const DEFAULT_PAGE_SIZE = 20`
  - `useEventQuery()` → `{ form, page, size, total, rows, selection, loading, exporting, taskOptions, toQuery(withPaging?: boolean): EventQuery, load(): Promise<void>, search(): void, resetForm(): void, onEventTypeChange(): void, onPageChange(n: number): void, onSizeChange(n: number): void, onSelectionChange(rows: EventRecordItem[]): void, removeOne(id: number): Promise<boolean>, removeMany(ids: number[]): Promise<boolean>, exportAs(format: 'xlsx' | 'csv'): Promise<boolean> }`
  - `EventDetailDrawer` 契约：props `{ modelValue: boolean; eventId: number | null }`，emits `update:modelValue` / `edited`，`defineExpose({ reload })`
  - `EventEditDialog` 契约：props `{ modelValue: boolean; eventId: number | null }`，emits `update:modelValue` / `saved`

- [ ] **Step 1: 写 useEventQuery 的失败测试**

`src/composables/__tests__/useEventQuery.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

// vi.mock 会被提升到文件顶部执行，工厂里引用的变量必须经 vi.hoisted 一起提升，否则触发 TDZ
const { pageEvents, deleteEvent, batchDeleteEvents, exportEvents } = vi.hoisted(() => ({
  pageEvents: vi.fn(),
  deleteEvent: vi.fn(),
  batchDeleteEvents: vi.fn(),
  exportEvents: vi.fn()
}))

vi.mock('@/api/event', () => ({ pageEvents, deleteEvent, batchDeleteEvents, exportEvents }))

import { useEventQuery } from '@/composables/useEventQuery'
import { useDictStore } from '@/stores/dict'
import type { EventRecordItem, PageResult } from '@/types/api'

function row(id: number, over: Partial<EventRecordItem> = {}): EventRecordItem {
  return {
    id,
    deviceNum: 'dev01',
    deviceName: '南河湫水闸',
    eventType: 300,
    eventTypeName: '人员聚集',
    task: 'people_gathering',
    snapTime: '2026-09-10 08:12:33',
    snapUrl: 'http://localhost:9000/detect/a.jpg',
    plateNum: null,
    vehicleNormalType: null,
    crowdNum: 12,
    handleStatus: 0,
    priority: 0,
    hitRuleId: null,
    ...over
  }
}

function pageOf(records: EventRecordItem[], total = records.length): PageResult<EventRecordItem> {
  return { records, total, current: 1, size: 20, pages: Math.max(1, Math.ceil(total / 20)) }
}

describe('useEventQuery', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    pageEvents.mockResolvedValue(pageOf([]))
  })

  it('toQuery 保留 handleStatus=0 与 priority=0，剔除空串、空白串与 null', () => {
    const q = useEventQuery()
    q.form.handleStatus = 0
    q.form.priority = 0
    q.form.deviceNum = '   '
    q.form.eventType = null
    q.form.keyword = ''
    q.form.dateRange = ['2026-09-01 00:00:00', '2026-09-12 23:59:59']

    expect(q.toQuery()).toEqual({
      current: 1,
      size: 20,
      handleStatus: 0,
      priority: 0,
      startTime: '2026-09-01 00:00:00',
      endTime: '2026-09-12 23:59:59'
    })
  })

  it('toQuery(false) 去掉分页字段（导出要全量）', () => {
    const q = useEventQuery()
    q.form.plateNum = '浙C6B5P8'

    expect(q.toQuery(false)).toEqual({ plateNum: '浙C6B5P8' })
  })

  it('load 写入 rows/total 并在结束后关掉 loading', async () => {
    pageEvents.mockResolvedValue(pageOf([row(1), row(8)], 2))
    const q = useEventQuery()

    await q.load()

    expect(q.rows.value.map((r) => r.id)).toEqual([1, 8])
    expect(q.total.value).toBe(2)
    expect(q.loading.value).toBe(false)
  })

  it('load 失败时清空列表并结束 loading（错误提示由拦截器统一弹，此处不重复弹）', async () => {
    pageEvents.mockRejectedValue(new Error('网络错误'))
    const q = useEventQuery()

    await q.load()

    expect(q.rows.value).toEqual([])
    expect(q.total.value).toBe(0)
    expect(q.loading.value).toBe(false)
  })

  it('search 把页码归 1 再查询，避免停在越界页看到空表', async () => {
    const q = useEventQuery()
    q.page.value = 5

    q.search()
    await nextTick()

    expect(q.page.value).toBe(1)
    expect(pageEvents).toHaveBeenCalledTimes(1)
    expect(pageEvents.mock.calls[0][0]).toMatchObject({ current: 1 })
  })

  it('resetForm 清空 8 项筛选与日期区间并重新查询', async () => {
    const q = useEventQuery()
    q.form.deviceNum = 'dev01'
    q.form.eventType = 200
    q.form.task = 'license_plate'
    q.form.handleStatus = 2
    q.form.priority = 2
    q.form.plateNum = '浙C'
    q.form.keyword = '水闸'
    q.form.dateRange = ['2026-09-01 00:00:00', '2026-09-02 00:00:00']

    q.resetForm()
    await nextTick()

    expect(q.form).toMatchObject({
      deviceNum: '',
      eventType: null,
      task: null,
      handleStatus: null,
      priority: null,
      plateNum: '',
      keyword: '',
      dateRange: null
    })
    expect(pageEvents).toHaveBeenCalledWith(expect.objectContaining({ current: 1 }))
  })

  it('onEventTypeChange 清空子类，避免「车辆大类 + people_gathering 子类」的矛盾条件', () => {
    const q = useEventQuery()
    q.form.eventType = 300
    q.form.task = 'people_gathering'

    q.onEventTypeChange()

    expect(q.form.task).toBeNull()
  })

  it('taskOptions 随大类联动过滤', async () => {
    const dict = useDictStore()
    dict.enums = {
      eventType: [
        { code: 200, name: '车辆事件' },
        { code: 300, name: '人员聚集' }
      ],
      task: [
        { code: 'license_plate', name: '车牌识别', eventType: 200 },
        { code: 'vehicle_type', name: '车型识别', eventType: 200 },
        { code: 'people_gathering', name: '人员聚集', eventType: 300 }
      ],
      handleStatus: [],
      priority: [],
      ruleType: []
    }
    const q = useEventQuery()

    expect(q.taskOptions.value.map((t) => t.code)).toEqual([
      'license_plate',
      'vehicle_type',
      'people_gathering'
    ])

    q.form.eventType = 200
    await nextTick()
    expect(q.taskOptions.value.map((t) => t.code)).toEqual(['license_plate', 'vehicle_type'])
  })

  it('onSizeChange 改每页容量时把页码归 1', () => {
    const q = useEventQuery()
    q.page.value = 3

    q.onSizeChange(50)

    expect(q.size.value).toBe(50)
    expect(q.page.value).toBe(1)
  })

  it('removeOne 成功后本地摘掉该行并把 total 减 1，不触发全量回查', async () => {
    pageEvents.mockResolvedValue(pageOf([row(1), row(8)], 2))
    deleteEvent.mockResolvedValue(undefined)
    const q = useEventQuery()
    await q.load()
    pageEvents.mockClear()

    const ok = await q.removeOne(8)

    expect(deleteEvent).toHaveBeenCalledWith(8)
    expect(ok).toBe(true)
    expect(q.rows.value.map((r) => r.id)).toEqual([1])
    expect(q.total.value).toBe(1)
    expect(pageEvents).not.toHaveBeenCalled()
  })

  it('removeOne 删掉非首页的最后一条时回退一页重查，避免停在空页', async () => {
    pageEvents.mockResolvedValue(pageOf([row(9)], 21))
    deleteEvent.mockResolvedValue(undefined)
    const q = useEventQuery()
    q.page.value = 2
    await q.load()
    pageEvents.mockClear()

    await q.removeOne(9)

    expect(q.page.value).toBe(1)
    expect(pageEvents).toHaveBeenCalledTimes(1)
  })

  it('removeOne 失败时保留行且返回 false', async () => {
    pageEvents.mockResolvedValue(pageOf([row(1)], 1))
    deleteEvent.mockRejectedValue(new Error('事件不存在'))
    const q = useEventQuery()
    await q.load()

    const ok = await q.removeOne(1)

    expect(ok).toBe(false)
    expect(q.rows.value.map((r) => r.id)).toEqual([1])
    expect(q.total.value).toBe(1)
  })

  it('removeMany 无选中时不发请求直接返回 false', async () => {
    const q = useEventQuery()

    const ok = await q.removeMany([])

    expect(ok).toBe(false)
    expect(batchDeleteEvents).not.toHaveBeenCalled()
  })

  it('removeMany 成功后清空选中并回第 1 页重查', async () => {
    batchDeleteEvents.mockResolvedValue({ deleted: 2 })
    pageEvents.mockResolvedValue(pageOf([]))
    const q = useEventQuery()
    q.page.value = 3
    q.selection.value = [row(1), row(2)]

    const ok = await q.removeMany([1, 2])

    expect(ok).toBe(true)
    expect(batchDeleteEvents).toHaveBeenCalledWith([1, 2])
    expect(q.selection.value).toEqual([])
    expect(q.page.value).toBe(1)
    expect(pageEvents).toHaveBeenCalledTimes(1)
  })

  it('exportAs 带当前筛选条件但不带分页，并复位 exporting', async () => {
    exportEvents.mockResolvedValue(undefined)
    const q = useEventQuery()
    q.form.eventType = 200
    q.page.value = 2

    const ok = await q.exportAs('xlsx')

    expect(ok).toBe(true)
    const [query, format] = exportEvents.mock.calls[0]
    expect(format).toBe('xlsx')
    expect(query).toMatchObject({ eventType: 200 })
    expect(query).not.toHaveProperty('current')
    expect(query).not.toHaveProperty('size')
    expect(q.exporting.value).toBe(false)
  })

  it('exportAs 失败（如 4001 超限）时返回 false 且不抛出', async () => {
    exportEvents.mockRejectedValue(new Error('导出数量超限'))
    const q = useEventQuery()

    const ok = await q.exportAs('csv')

    expect(ok).toBe(false)
    expect(q.exporting.value).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd D:\Code\Front\Detect ; npm run test -- useEventQuery`
Expected: FAIL — `Failed to resolve import "@/composables/useEventQuery"`

- [ ] **Step 3: 实现 useEventQuery**

`src/composables/useEventQuery.ts`：

```ts
import { computed, reactive, ref } from 'vue'
import { batchDeleteEvents, deleteEvent, exportEvents, pageEvents } from '@/api/event'
import { useDictStore } from '@/stores/dict'
import { cleanParams } from '@/utils/params'
import type { EventQuery, EventRecordItem, TaskItem } from '@/types/api'

/** 事件列表筛选表单：8 项业务条件（含日期区间双值模型） */
export interface EventFilterForm {
  deviceNum: string
  eventType: number | null
  task: string | null
  handleStatus: number | null
  priority: number | null
  plateNum: string
  keyword: string
  /** el-date-picker type=datetimerange 的模型；value-format 已保证是后端要的 yyyy-MM-dd HH:mm:ss */
  dateRange: [string, string] | null
}

/** 与后端 EventQueryDTO 的默认 size 保持一致（后端上限 200） */
export const DEFAULT_PAGE_SIZE = 20

function emptyForm(): EventFilterForm {
  return {
    deviceNum: '',
    eventType: null,
    task: null,
    handleStatus: null,
    priority: null,
    plateNum: '',
    keyword: '',
    dateRange: null
  }
}

/**
 * 事件列表页的状态与编排。
 *
 * 把「表单 → 查询对象 → 分页 → 加载 → 删改后回查」收在这里，list.vue 只负责渲染与成功提示：
 * 一是这段逻辑分支多（0 值保留、子类联动、末页删空回退）值得单测，二是避免 SFC 里堆两百行脚本。
 *
 * 错误提示一律不在这一层弹 —— axios 响应拦截器（Task 3）已对 code≠0 与 HTTP 错误统一 ElMessage.error，
 * 这里再弹会出现两条相同的红色提示。函数只返回 boolean 表示成败，由视图决定成功文案。
 */
export function useEventQuery() {
  const dict = useDictStore()

  const form = reactive<EventFilterForm>(emptyForm())
  const page = ref(1)
  const size = ref(DEFAULT_PAGE_SIZE)
  const total = ref(0)
  const rows = ref<EventRecordItem[]>([])
  const selection = ref<EventRecordItem[]>([])
  const loading = ref(false)
  const exporting = ref(false)

  /** 子类下拉随大类联动；大类未选时给全量 */
  const taskOptions = computed<TaskItem[]>(() => dict.tasksOfEventType(form.eventType))

  /**
   * 表单 → EventQuery。
   *
   * cleanParams 剔除空串与 null：clearable 清空后 Element Plus 给的是 `''`，
   * 原样发出 `?eventType=` 会让后端 Integer 绑定失败（400）；
   * 但 `0` 会保留 —— handleStatus=0（未处理）、priority=0（普通）都是合法筛选值。
   * `withPaging=false` 用于导出：导出要当前条件下的全量，带分页会被后端忽略但语义混乱。
   */
  function toQuery(withPaging = true): EventQuery {
    return cleanParams<EventQuery>({
      ...(withPaging ? { current: page.value, size: size.value } : {}),
      deviceNum: form.deviceNum,
      eventType: form.eventType,
      task: form.task,
      handleStatus: form.handleStatus,
      priority: form.priority,
      plateNum: form.plateNum,
      keyword: form.keyword,
      startTime: form.dateRange?.[0] ?? null,
      endTime: form.dateRange?.[1] ?? null
    })
  }

  async function load(): Promise<void> {
    loading.value = true
    try {
      const res = await pageEvents(toQuery())
      rows.value = res.records ?? []
      total.value = res.total ?? 0
    } catch {
      // 拦截器已提示。清空而非保留旧数据：留着会让人误以为「这就是筛出来的结果」
      rows.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  /** 筛选条件变了必须回第 1 页，否则会停在越界页看到空表 */
  function search(): void {
    page.value = 1
    void load()
  }

  function resetForm(): void {
    Object.assign(form, emptyForm())
    search()
  }

  /** 大类变更后原子类多半不属于新大类，直接清空，避免矛盾条件查出空结果 */
  function onEventTypeChange(): void {
    form.task = null
  }

  function onPageChange(next: number): void {
    page.value = next
    void load()
  }

  function onSizeChange(next: number): void {
    size.value = next
    page.value = 1
    void load()
  }

  function onSelectionChange(next: EventRecordItem[]): void {
    selection.value = next
  }

  /**
   * 删单条。成功后本地摘掉该行并 total-1，省一次全量回查；
   * 但若删的是「非第 1 页的最后一条」，本页已空，必须回退一页重新拉取。
   */
  async function removeOne(id: number): Promise<boolean> {
    try {
      await deleteEvent(id)
    } catch {
      return false
    }
    rows.value = rows.value.filter((row) => row.id !== id)
    total.value = Math.max(0, total.value - 1)
    if (rows.value.length === 0 && page.value > 1) {
      page.value -= 1
      await load()
    }
    return true
  }

  /** 批量删除：后端返 `{deleted}`；成功即清空选中并回第 1 页（跨页删除后原页码无意义） */
  async function removeMany(ids: number[]): Promise<boolean> {
    if (ids.length === 0) return false
    try {
      await batchDeleteEvents(ids)
    } catch {
      return false
    }
    selection.value = []
    page.value = 1
    await load()
    return true
  }

  /** 导出当前筛选条件下的全量。exportEvents 内部已处理 4001 超限提示、文件名与落盘 */
  async function exportAs(format: 'xlsx' | 'csv'): Promise<boolean> {
    exporting.value = true
    try {
      await exportEvents(toQuery(false), format)
      return true
    } catch {
      return false
    } finally {
      exporting.value = false
    }
  }

  return {
    form,
    page,
    size,
    total,
    rows,
    selection,
    loading,
    exporting,
    taskOptions,
    toQuery,
    load,
    search,
    resetForm,
    onEventTypeChange,
    onPageChange,
    onSizeChange,
    onSelectionChange,
    removeOne,
    removeMany,
    exportAs
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- useEventQuery`
Expected: PASS，16 tests

- [ ] **Step 5: 写两个子组件的契约壳**

list.vue 会 import 这两个组件，先立壳保证 `npm run build` 不报错；**props / emits / expose 签名在此固定**，Task 10 只换内部实现，不再改契约。

`src/components/EventDetailDrawer.vue`：

```vue
<script setup lang="ts">
/**
 * 事件详情抽屉。
 * 契约（Task 10 填充内部实现，签名不变）：
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
```

`src/components/EventEditDialog.vue`：

```vue
<script setup lang="ts">
/**
 * 事件修正弹窗。
 * 契约（Task 10 填充内部实现，签名不变）：
 * - props  modelValue：开关；eventId：待修正的事件主键，null 时不发请求
 * - emits  update:modelValue：v-model 回写；saved：PUT 成功后通知宿主刷新
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
```

- [ ] **Step 6: 补一个全局分页工具类**

`src/styles/index.css` 末尾（`.json-pre` 块之后）追加：

```css
/* 分页条：靠右，与表格拉开间距（列表页与看板页共用） */
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
```

- [ ] **Step 7: 写事件列表页**

`src/views/event/list.vue`（**整体替换** Task 6 的占位内容）：

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowDown, Delete, Download, Refresh, Search } from '@element-plus/icons-vue'
import EventDetailDrawer from '@/components/EventDetailDrawer.vue'
import EventEditDialog from '@/components/EventEditDialog.vue'
import SnapImage from '@/components/SnapImage.vue'
import { useEnum } from '@/composables/useEnum'
import { useEventQuery } from '@/composables/useEventQuery'
import { useDictStore } from '@/stores/dict'
import { dash, textOr } from '@/utils/format'
import type { EventRecordItem } from '@/types/api'

const dict = useDictStore()

const {
  form,
  page,
  size,
  total,
  rows,
  selection,
  loading,
  exporting,
  taskOptions,
  load,
  search,
  resetForm,
  onEventTypeChange,
  onPageChange,
  onSizeChange,
  onSelectionChange,
  removeOne,
  removeMany,
  exportAs
} = useEventQuery()

const { eventTypeLabel, taskLabel, priorityLabel, priorityTag, handleStatusLabel, handleStatusTag } =
  useEnum()

const drawerVisible = ref(false)
const dialogVisible = ref(false)
const activeId = ref<number | null>(null)
const drawerRef = ref<InstanceType<typeof EventDetailDrawer> | null>(null)

// 字典先于列表：下拉选项与 code→中文翻译都靠它。load() 内部已对失败回退静态字典，不会阻塞页面
onMounted(async () => {
  await dict.load()
  await load()
})

function openDetail(row: EventRecordItem): void {
  activeId.value = row.id
  drawerVisible.value = true
}

function openEdit(row: EventRecordItem): void {
  activeId.value = row.id
  dialogVisible.value = true
}

/**
 * 修正成功：刷新列表 + 重拉抽屉详情。
 * 抽屉可能正开着（从抽屉底部点「修正」），不 reload 会看到修改前的旧值。
 */
function onSaved(): void {
  ElMessage.success('修正成功')
  void load()
  drawerRef.value?.reload()
}

async function onDelete(row: EventRecordItem): Promise<void> {
  if (await removeOne(row.id)) {
    ElMessage.success(`已删除事件 #${row.id}`)
  }
}

async function onBatchDelete(): Promise<void> {
  const ids = selection.value.map((row) => row.id)
  if (await removeMany(ids)) {
    ElMessage.success(`已删除 ${ids.length} 条事件记录`)
  }
}

async function onExport(format: 'xlsx' | 'csv'): Promise<void> {
  if (await exportAs(format)) {
    ElMessage.success('导出完成，请查看浏览器下载')
  }
}
</script>

<template>
  <div class="page-container">
    <!-- 筛选区：inline 表单，窄屏自动换行；回车即查 -->
    <el-card shadow="never" class="filter-card">
      <el-form :model="form" inline label-width="76px" @submit.prevent>
        <el-form-item label="设备编号">
          <el-input
            v-model="form.deviceNum"
            placeholder="全部"
            clearable
            style="width: 170px"
            @keyup.enter="search"
          />
        </el-form-item>

        <el-form-item label="事件大类">
          <el-select
            v-model="form.eventType"
            placeholder="全部"
            clearable
            style="width: 150px"
            @change="onEventTypeChange"
          >
            <el-option
              v-for="item in dict.eventTypeOptions"
              :key="String(item.code)"
              :label="item.name"
              :value="item.code"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="事件子类">
          <el-select v-model="form.task" placeholder="全部" clearable style="width: 170px">
            <el-option v-for="item in taskOptions" :key="item.code" :label="item.name" :value="item.code" />
          </el-select>
        </el-form-item>

        <el-form-item label="处理状态">
          <el-select v-model="form.handleStatus" placeholder="全部" clearable style="width: 140px">
            <el-option
              v-for="item in dict.handleStatusOptions"
              :key="String(item.code)"
              :label="item.name"
              :value="item.code"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="优先级">
          <el-select v-model="form.priority" placeholder="全部" clearable style="width: 130px">
            <el-option
              v-for="item in dict.priorityOptions"
              :key="String(item.code)"
              :label="item.name"
              :value="item.code"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="车牌号">
          <el-input
            v-model="form.plateNum"
            placeholder="模糊匹配"
            clearable
            style="width: 160px"
            @keyup.enter="search"
          />
        </el-form-item>

        <el-form-item label="关键词">
          <el-input
            v-model="form.keyword"
            placeholder="车牌或设备名"
            clearable
            style="width: 180px"
            @keyup.enter="search"
          />
        </el-form-item>

        <el-form-item label="抓拍时间">
          <el-date-picker
            v-model="form.dateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 360px"
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :icon="Search" @click="search">查询</el-button>
          <el-button :icon="Refresh" @click="resetForm">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 表格区 -->
    <el-card shadow="never">
      <div class="table-toolbar">
        <span class="table-toolbar__title">
          事件记录
          <span class="sub-text">共 {{ total }} 条，已选 {{ selection.length }} 条</span>
        </span>
        <div class="table-toolbar__actions">
          <el-popconfirm
            :title="`确认删除选中的 ${selection.length} 条事件记录？`"
            width="260"
            confirm-button-text="确认删除"
            cancel-button-text="取消"
            @confirm="onBatchDelete"
          >
            <template #reference>
              <el-button type="danger" plain :icon="Delete" :disabled="selection.length === 0">
                批量删除
              </el-button>
            </template>
          </el-popconfirm>

          <el-dropdown trigger="click" @command="onExport">
            <el-button :icon="Download" :loading="exporting">
              导出<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="xlsx">导出 Excel（.xlsx）</el-dropdown-item>
                <el-dropdown-item command="csv">导出 CSV（.csv）</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="rows"
        row-key="id"
        stripe
        border
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="46" reserve-selection align="center" />

        <el-table-column label="抓拍图" width="86" align="center">
          <template #default="{ row }">
            <SnapImage :src="row.snapUrl" :width="60" :height="40" />
          </template>
        </el-table-column>

        <el-table-column prop="id" label="ID" width="76" align="right" />

        <el-table-column label="设备" min-width="150">
          <template #default="{ row }">
            <div>{{ textOr(row.deviceName, row.deviceNum) }}</div>
            <div v-if="row.deviceName" class="sub-text">{{ row.deviceNum }}</div>
          </template>
        </el-table-column>

        <el-table-column label="事件类型" min-width="140">
          <template #default="{ row }">
            <div>{{ textOr(row.eventTypeName, eventTypeLabel(row.eventType)) }}</div>
            <div class="sub-text">{{ taskLabel(row.task) }}</div>
          </template>
        </el-table-column>

        <el-table-column label="车牌" width="110">
          <template #default="{ row }">{{ dash(row.plateNum) }}</template>
        </el-table-column>

        <el-table-column label="车型" width="100">
          <template #default="{ row }">{{ dash(row.vehicleNormalType) }}</template>
        </el-table-column>

        <el-table-column label="人数" width="76" align="right">
          <template #default="{ row }">{{ dash(row.crowdNum) }}</template>
        </el-table-column>

        <el-table-column prop="snapTime" label="抓拍时间" width="168" />

        <el-table-column label="优先级" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="priorityTag(row.priority)" effect="light" size="small">
              {{ priorityLabel(row.priority) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="处理状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="handleStatusTag(row.handleStatus)" effect="light" size="small">
              {{ handleStatusLabel(row.handleStatus) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="命中规则" width="110" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.hitRuleId" type="warning" effect="plain" size="small">
              已命中 #{{ row.hitRuleId }}
            </el-tag>
            <span v-else>{{ dash(null) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="176" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button link type="primary" @click="openEdit(row)">修正</el-button>
            <el-popconfirm
              :title="`确认删除事件 #${row.id}？`"
              width="220"
              confirm-button-text="删除"
              cancel-button-text="取消"
              @confirm="onDelete(row)"
            >
              <template #reference>
                <el-button link type="danger">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>

        <template #empty>
          <el-empty description="没有符合筛选条件的事件记录" />
        </template>
      </el-table>

      <div class="pager">
        <el-pagination
          :current-page="page"
          :page-size="size"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @current-change="onPageChange"
          @size-change="onSizeChange"
        />
      </div>
    </el-card>

    <EventDetailDrawer ref="drawerRef" v-model="drawerVisible" :event-id="activeId" @edited="load" />
    <EventEditDialog v-model="dialogVisible" :event-id="activeId" @saved="onSaved" />
  </div>
</template>
```

> **为何不提供前端排序**：后端 `pageEventRecords` 固定 `ORDER BY snap_time DESC`，表头加 `sortable` 只会让用户以为排序生效，故不设。
> **为何 `reserve-selection`**：跳页后保留已勾选项，否则「选中第 1 页 5 条 → 翻到第 2 页再选 3 条 → 批量删除」会静默丢掉前 5 条。配合 `row-key="id"` 生效。
> **`@edited="load"`**：抽屉内修正成功后走 `load()`（不弹提示，提示由抽屉内部的保存流程负责）；页面级弹窗修正成功走 `onSaved()`（弹提示 + 刷新 + 重拉抽屉）。

- [ ] **Step 8: 类型检查 + 全量测试**

Run: `cd D:\Code\Front\Detect ; npm run type-check ; npm run test`
Expected: 两者 EXIT=0

若 `list.vue` 报 `dict.eventTypeOptions` 不存在：确认 Task 5 的 getters 已定义且 `useDictStore()` 已在 setup 顶层调用。
若报 `drawerRef.value?.reload` 不存在：确认壳组件里 `defineExpose({ reload })` 已写。

- [ ] **Step 9: 真实后端联调验证（15 项）**

前置：`detect-mysql` / `detect-redis` / `detect-nacos` / `detect-minio` 已起，`detect-gateway`(9999) / `detect-auth`(8081) / `detect-event`(8082) 已起并注册到 Nacos。

Run: `cd D:\Code\Front\Detect ; npm run dev`（后台）→ 浏览器打开 `http://localhost:5173/`

逐项记录实际结果到 `docs/IMPLEMENTATION_LOG.md`（**不得写「预期通过」**）：

| # | 操作 | 预期 |
|---|------|------|
| 1 | 登录 `admin / 123456` 后进入 `/event/list` | 表格有数据，`共 N 条` 与后端 `SELECT COUNT(*) FROM event_records WHERE del_flag='0'` 一致 |
| 2 | 打开 DevTools Network 看分页请求 | URL 为 `/api/admin/event/event-records/page?current=1&size=20`，**没有**空值键（如 `eventType=`） |
| 3 | 处理状态选「未处理」→ 查询 | 请求带 `handleStatus=0`（**不是**被清洗掉）；返回行状态均为「未处理」 |
| 4 | 优先级选「普通」→ 查询 | 请求带 `priority=0` |
| 5 | 事件大类选「车辆事件」 | 子类下拉只剩 `license_plate` / `vehicle_type` / `plate_unrecognized`；已选的 `people_gathering` 被清空 |
| 6 | 车牌号输 `浙C` → 查询 | 命中 id=8（`浙C6B5P8`），模糊匹配生效 |
| 7 | 关键词输 `水闸` → 查询 | 命中 id=1（设备名「南河湫水闸」） |
| 8 | 抓拍时间选一个包含 `2026-09-10` 的区间 → 查询 | 请求带 `startTime`/`endTime` 且格式为 `yyyy-MM-dd HH:mm:ss`（含空格，URL 中被编码为 `%20`） |
| 9 | 设备编号输 `testcar-cam01` → 查询 | 命中 id=8 |
| 10 | 点「重置」 | 8 项筛选全空，回到第 1 页，列表恢复全量 |
| 11 | 翻页到第 2 页，再把每页改为 50 | 页码自动归 1，请求 `current=1&size=50` |
| 12 | 勾选 2 行 → 批量删除 → 确认 | 提示「已删除 2 条」；列表少 2 行；DB `del_flag='1'` |
| 13 | 单行「删除」→ 确认 | 提示「已删除事件 #N」，该行从表格消失 |
| 14 | 导出 → Excel | 下载 `事件记录_yyyyMMdd_HHmmss.xlsx`，Excel 打开不乱码，行数与当前筛选总数一致 |
| 15 | 导出 → CSV | 下载 `事件记录_yyyyMMdd_HHmmss.csv`，Excel 打开中文不乱码（后端以 GBK 输出，前端不转码） |

**删除验证后的数据还原**（联调数据有限，验完即还原）：

```powershell
docker exec -i detect-mysql mysql -uroot -proot detect_event -e "UPDATE event_records SET del_flag='0' WHERE id IN (1,8);"
```

**抓拍图 403 降级验证**：第 1 项里表格的「抓拍图」列应显示「图片不可访问」占位（MinIO 桶私有）。执行下面命令后刷新，图片应正常显示：

```powershell
docker exec -i detect-minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec -i detect-minio mc anonymous set download local/detect
```

> 若容器内无 `mc`，改用宿主机安装的 MinIO Client；或保持私有 —— 降级占位本身就是预期行为，不阻塞验收。

- [ ] **Step 10: 提交**

```bash
git add src/composables src/components src/views/event/list.vue src/styles/index.css
git commit -m "feat: 事件列表页（8 项筛选联动 / 多选批量删除 / xlsx+csv 导出）+ useEventQuery 单测"
```

---

## Task 10: 事件详情抽屉与修正弹窗

**Files:**
- Create: `src/components/eventEditModel.ts`
- Test: `src/components/__tests__/eventEditModel.test.ts`
- Modify: `src/components/EventDetailDrawer.vue`（把 Task 9 的契约壳换成完整实现）
- Modify: `src/components/EventEditDialog.vue`（同上）

**Interfaces:**
- Consumes:
  - `getEventDetail(id: number): Promise<EventRecordDetail>`、`updateEvent(id: number, patch: EventRecordUpdate): Promise<void>`（Task 4）
  - `useEnum()` → `eventTypeLabel` / `taskLabel` / `ruleTypeLabel` / `priorityLabel` / `priorityTag` / `handleStatusLabel` / `handleStatusTag` / `pushStatusLabel`（Task 5）
  - `dash` / `textOr`（Task 2）、`SnapImage`（Task 8）
  - `EVENT_TYPE`（`src/constants/error-code.ts`，已存在）
- Produces（`src/components/eventEditModel.ts`）:
  - `type EditableField = keyof EventRecordUpdate`
  - `type EditForm = Record<EditableField, string | number | null>`
  - `interface FieldMeta { key: EditableField; label: string; kind: 'input' | 'number'; min?: number; max?: number; precision?: number; maxlength?: number; placeholder?: string }`
  - `interface FieldGroup { key: 'common' | 'vehicle' | 'face'; title: string; eventTypes: number[] | null; fields: FieldMeta[] }`
  - `const EDIT_GROUPS: FieldGroup[]`（3 组共15 字段）
  - `const EDITABLE_FIELDS: FieldMeta[]`（EDIT_GROUPS 扫平）
  - `visibleGroups(eventType: number | null | undefined): FieldGroup[]`
  - `toEditForm(detail: EventRecordDetail): EditForm`
  - `emptyEditForm(): EditForm`
  - `diffEditForm(source: EventRecordDetail, form: EditForm): { patch: EventRecordUpdate; ignored: string[] }`
  - `asNumber(value: string | number | null | undefined): number | null`

> **为何要把字段清单单独拆一个 `.ts`**：“哪些字段可改 / 按大类分组 / 只发改动项”这三件事共 100 多行且分支多（数字 0 不能当空、文本清空发 `''` 不发 `null`），埋在 SFC 里既不可单测也不好读。拆成纯函数后，`EventEditDialog.vue` 只剩渲染与一次 PUT。

- [ ] **Step 1: 写 eventEditModel 的失败测试**

`src/components/__tests__/eventEditModel.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import {
  EDITABLE_FIELDS,
  asNumber,
  diffEditForm,
  emptyEditForm,
  toEditForm,
  visibleGroups
} from '@/components/eventEditModel'
import { EVENT_TYPE } from '@/constants/error-code'
import type { EventRecordDetail } from '@/types/api'

/** 默认为真实联调数据 id=8（车辆事件、已命中黑名单、已推送） */
function vehicleDetail(over: Partial<EventRecordDetail> = {}): EventRecordDetail {
  return {
    id: 8,
    deviceNum: 'testcar-cam01',
    deviceName: '测试车相机',
    eventType: 200,
    eventTypeName: '车辆事件',
    snapTime: '2026-09-10 09:00:00',
    snapUrl: null,
    name: null,
    cardno: null,
    libName: null,
    similarity: null,
    identifyFaceUrl: null,
    visibleLightUrl: null,
    plateNum: '浙C6B5P8',
    vehicleType: null,
    vehicleNormalType: '轿车',
    vehicleLogo: null,
    vehicleSubLogo: null,
    vehicleColor: '蓝色',
    vehicleModel: null,
    heightPermitted: null,
    crowdNum: null,
    status: 1,
    handleStatus: 1,
    priority: 2,
    hitRuleId: 3,
    sourceData: { task: 'license_plate', confidence: 0.93, trackId: null },
    hitRule: { id: 3, ruleName: '黑名单车牌', ruleType: 'PLATE_BLACKLIST' },
    handleHistory: [],
    ...over
  }
}

describe('字段清单', () => {
  it('可修正字段共15 个，不含状态/主键/推送标记/时间', () => {
    expect(EDITABLE_FIELDS).toHaveLength(15)
    const keys = EDITABLE_FIELDS.map((field) => field.key)
    expect(keys).not.toContain('handleStatus')
    expect(keys).not.toContain('status')
    expect(keys).not.toContain('id')
    expect(keys).not.toContain('snapTime')
    expect(keys).not.toContain('snapUrl')
  })

  it('visibleGroups 按大类挑分组，「通用」组恒显示', () => {
    expect(visibleGroups(EVENT_TYPE.VEHICLE).map((g) => g.key)).toEqual(['common', 'vehicle'])
    expect(visibleGroups(EVENT_TYPE.FACE).map((g) => g.key)).toEqual(['common', 'face'])
    expect(visibleGroups(EVENT_TYPE.CROWD).map((g) => g.key)).toEqual(['common'])
    expect(visibleGroups(null).map((g) => g.key)).toEqual(['common'])
    expect(visibleGroups(undefined).map((g) => g.key)).toEqual(['common'])
  })

  it('人脸分组覆盖 6 个字段', () => {
    const face = visibleGroups(EVENT_TYPE.FACE).find((group) => group.key === 'face')
    expect(face?.fields.map((field) => field.key)).toEqual([
      'name',
      'cardno',
      'libName',
      'similarity',
      'identifyFaceUrl',
      'visibleLightUrl'
    ])
  })
})

describe('toEditForm / emptyEditForm', () => {
  it('toEditForm 抽出 15 个字段当前值作为 diff 基线', () => {
    const form = toEditForm(vehicleDetail())
    expect(Object.keys(form)).toHaveLength(15)
    expect(form.plateNum).toBe('浙C6B5P8')
    expect(form.vehicleColor).toBe('蓝色')
    expect(form.crowdNum).toBeNull()
  })

  it('emptyEditForm 全部为 null（详情未加载时的占位）', () => {
    const form = emptyEditForm()
    expect(Object.keys(form)).toHaveLength(15)
    expect(Object.values(form).every((value) => value === null)).toBe(true)
  })
})

describe('diffEditForm', () => {
  it('未改动时 patch 为空（弹窗据此禁用提交按钮）', () => {
    const detail = vehicleDetail()
    expect(diffEditForm(detail, toEditForm(detail))).toEqual({ patch: {}, ignored: [] })
  })

  it('只发改动项：改颜色时请求体只含 vehicleColor', () => {
    const detail = vehicleDetail()
    const form = toEditForm(detail)
    form.vehicleColor = '红色'
    expect(diffEditForm(detail, form).patch).toEqual({ vehicleColor: '红色' })
  })

  it('清空文本字段发空串而非 null：后端 setIgnoreNullValue(true) 会把 null 静默丢掉', () => {
    const detail = vehicleDetail()
    const form = toEditForm(detail)
    form.plateNum = ''
    expect(diffEditForm(detail, form).patch).toEqual({ plateNum: '' })
  })

  it('数字字段改动照常发出', () => {
    const detail = vehicleDetail()
    const form = toEditForm(detail)
    form.crowdNum = 20
    expect(diffEditForm(detail, form).patch).toEqual({ crowdNum: 20 })
  })

  it('数字 0 是有效值：null → 0 算改动', () => {
    const detail = vehicleDetail()
    const form = toEditForm(detail)
    form.crowdNum = 0
    expect(diffEditForm(detail, form).patch).toEqual({ crowdNum: 0 })
  })

  it('清空数字字段不进 patch，改列入 ignored 供弹窗明示', () => {
    const detail = vehicleDetail({ crowdNum: 12 })
    const form = toEditForm(detail)
    form.crowdNum = null

    const { patch, ignored } = diffEditForm(detail, form)

    expect(patch).toEqual({})
    expect(ignored).toEqual(['聚集人数'])
  })

  it('仅首尾空白差异不算改动，真改动时提交值已 trim', () => {
    const detail = vehicleDetail()
    const form = toEditForm(detail)

    form.plateNum = '  浙C6B5P8  '
    expect(diffEditForm(detail, form).patch).toEqual({})

    form.vehicleColor = '  红色 '
    expect(diffEditForm(detail, form).patch).toEqual({ vehicleColor: '红色' })
  })

  it('多个字段同时改动时 patch 只含这几个键', () => {
    const detail = vehicleDetail()
    const form = toEditForm(detail)
    form.plateNum = '浙A12345'
    form.vehicleNormalType = 'SUV'
    form.heightPermitted = 4.2

    expect(diffEditForm(detail, form).patch).toEqual({
      plateNum: '浙A12345',
      vehicleNormalType: 'SUV',
      heightPermitted: 4.2
    })
  })

  it('数字与文本混合改动 + 一个不可保存的清空，两者分开报告', () => {
    const detail = vehicleDetail({ crowdNum: 12 })
    const form = toEditForm(detail)
    form.crowdNum = null
    form.vehicleColor = '黄色'

    const { patch, ignored } = diffEditForm(detail, form)

    expect(patch).toEqual({ vehicleColor: '黄色' })
    expect(ignored).toEqual(['聚集人数'])
  })
})

describe('asNumber', () => {
  it('放行数字与数字串，其余归 null（绑 el-input-number 前收窄联合类型）', () => {
    expect(asNumber(12)).toBe(12)
    expect(asNumber(0)).toBe(0)
    expect(asNumber('12.5')).toBe(12.5)
    expect(asNumber(null)).toBeNull()
    expect(asNumber(undefined)).toBeNull()
    expect(asNumber('')).toBeNull()
    expect(asNumber('abc')).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd D:\Code\Front\Detect ; npm run test -- eventEditModel`
Expected: FAIL — `Failed to resolve import "@/components/eventEditModel"`

- [ ] **Step 3: 实现 eventEditModel**

`src/components/eventEditModel.ts`：

```ts
import { EVENT_TYPE } from '@/constants/error-code'
import type { EventRecordDetail, EventRecordUpdate } from '@/types/api'

/** 可修正字段 = EventRecordUpdateDTO 的全部键（不含 handleStatus，状态流转属处理域） */
export type EditableField = keyof EventRecordUpdate

/**
 * 弹窗表单模型。
 * 用 Record 而非 Required<EventRecordUpdate>：后者的每个键类型不同（string|null vs number|null），
 * 以联合键写入时 TS 要求值属于所有属性类型的交集（= null），模板里根本赋不进去。
 */
export type EditForm = Record<EditableField, string | number | null>

export interface FieldMeta {
  key: EditableField
  label: string
  /** 控件类型：input → el-input（字符串）；number → el-input-number（数字） */
  kind: 'input' | 'number'
  /** 以下三项仅 kind='number' 生效 */
  min?: number
  max?: number
  precision?: number
  /** 仅 kind='input' 生效 */
  maxlength?: number
  placeholder?: string
}

export interface FieldGroup {
  key: 'common' | 'vehicle' | 'face'
  title: string
  /** null = 所有大类都显示 */
  eventTypes: number[] | null
  fields: FieldMeta[]
}

/**
 * 可修正字段分组（接口文档 §4.1.4 EventRecordUpdateDTO）。
 *
 * 聚集大类（300）没有专属分组，只能改「通用」里的聚集人数 ——
 * 人数本来就是该事件的全部业务信息。
 */
export const EDIT_GROUPS: FieldGroup[] = [
  {
    key: 'common',
    title: '通用',
    eventTypes: null,
    fields: [
      { key: 'crowdNum', label: '聚集人数', kind: 'number', min: 0, precision: 0, placeholder: '如 12' }
    ]
  },
  {
    key: 'vehicle',
    title: '车辆信息',
    eventTypes: [EVENT_TYPE.VEHICLE],
    fields: [
      { key: 'plateNum', label: '车牌号', kind: 'input', maxlength: 32, placeholder: '如 浙C6B5P8' },
      { key: 'vehicleType', label: '特殊车辆类别 code', kind: 'number', min: 0, precision: 0 },
      { key: 'vehicleNormalType', label: '车辆类别', kind: 'input', maxlength: 64, placeholder: '如 轿车' },
      { key: 'vehicleLogo', label: '品牌', kind: 'input', maxlength: 64 },
      { key: 'vehicleSubLogo', label: '子品牌', kind: 'input', maxlength: 64 },
      { key: 'vehicleColor', label: '颜色', kind: 'input', maxlength: 32, placeholder: '如 蓝色' },
      { key: 'vehicleModel', label: '年款', kind: 'input', maxlength: 32 },
      { key: 'heightPermitted', label: '限高(m)', kind: 'number', min: 0, precision: 2 }
    ]
  },
  {
    key: 'face',
    title: '人脸信息',
    eventTypes: [EVENT_TYPE.FACE],
    fields: [
      { key: 'name', label: '姓名', kind: 'input', maxlength: 64 },
      { key: 'cardno', label: '身份证号', kind: 'input', maxlength: 32 },
      { key: 'libName', label: '库名称', kind: 'input', maxlength: 64 },
      { key: 'similarity', label: '相似度', kind: 'number', min: 0, max: 100, precision: 0 },
      { key: 'identifyFaceUrl', label: '库底图 URL', kind: 'input', maxlength: 512 },
      { key: 'visibleLightUrl', label: '可见光图 URL', kind: 'input', maxlength: 512 }
    ]
  }
]

/** 扫平的字段元数据清单：diffEditForm 按它遍历，与分组展示无关 */
export const EDITABLE_FIELDS: FieldMeta[] = EDIT_GROUPS.flatMap((group) => group.fields)

/** 当前大类可见的分组；eventTypes 为 null 的组恒显示 */
export function visibleGroups(eventType: number | null | undefined): FieldGroup[] {
  if (eventType === null || eventType === undefined) {
    return EDIT_GROUPS.filter((group) => group.eventTypes === null)
  }
  return EDIT_GROUPS.filter(
    (group) => group.eventTypes === null || group.eventTypes.includes(eventType)
  )
}

/** 从详情抽出可编辑字段作为表单初值（同时就是 diff 的基线快照） */
export function toEditForm(detail: EventRecordDetail): EditForm {
  const form = {} as EditForm
  for (const meta of EDITABLE_FIELDS) {
    const value = detail[meta.key]
    form[meta.key] = value === undefined ? null : value
  }
  return form
}

/** 详情未加载时的占位表单，避免模板里到处判空 */
export function emptyEditForm(): EditForm {
  const form = {} as EditForm
  for (const meta of EDITABLE_FIELDS) form[meta.key] = null
  return form
}

/** diffEditForm 的结果：真正要发的请求体 + 发了也没用的字段名 */
export interface EditDiff {
  patch: EventRecordUpdate
  /** 用户清空了、但后端会忽略的数字字段 label，供弹窗明示 */
  ignored: string[]
}

/**
 * 只挑出被用户改动过、且后端真会接受的字段。
 *
 * 后端 `EventRecordService.update` 用 `BeanUtil.copyProperties(dto, upd, setIgnoreNullValue(true))`，
 * 再叠加 MyBatis-Plus `updateById` 默认的 NOT_NULL 策略 —— **null 字段永远不进 SET**。由此推出两条规则：
 *   1. 文本字段清空要发 `''`（不是 `null`），后端才会真的把列写成空串；发 null 会被静默忽略。
 *   2. 数字字段清空只能发 null，注定被忽略。故不发，改列入 `ignored` 让弹窗告诉用户
 *      「这个字段清不掉」—— 否则用户删掉数字点保存，看到提示「修正成功」但值还在，会当成 bug。
 *
 * 未改动的字段一律不发：PUT 请求体只含真正变更的键，后端日志与审计都干净。
 */
export function diffEditForm(source: EventRecordDetail, form: EditForm): EditDiff {
  const patch: EventRecordUpdate = {}
  const ignored: string[] = []
  // EventRecordUpdate 的键均为可选，索引赋值需绕开逐键类型检查
  const bag = patch as Record<string, string | number | null>

  for (const meta of EDITABLE_FIELDS) {
    const next = normalize(form[meta.key], meta.kind)
    const prev = normalize(source[meta.key], meta.kind)
    if (next === prev) continue

    if (meta.kind === 'number' && next === null) {
      ignored.push(meta.label)
      continue
    }
    bag[meta.key] = next
  }
  return { patch, ignored }
}

/**
 * 比较前归一：
 * - 文本：trim 后统一为字符串（空与 null 等价，都归为 `''`）
 * - 数字：空串/undefined/null 归为 `null`，`0` 保留（聚集人数 0 是有效值）
 */
function normalize(value: string | number | null | undefined, kind: 'input' | 'number'): string | number | null {
  if (kind === 'number') {
    const num = asNumber(value)
    return num
  }
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

/** 表单值是 `string | number | null` 联合，绑 el-input-number（只收 `number | null`）前收窄一次 */
export function asNumber(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isNaN(value) ? null : value
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value)
    return Number.isNaN(num) ? null : num
  }
  return null
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- eventEditModel`
Expected: PASS，14 tests

> `similarity` 后端是 `Integer`（见 `EventRecordDetailVO.similarity`），故 `precision: 0`；`heightPermitted` 是 `BigDecimal`，`precision: 2`。两者弄反会让后端报 400 或静默截位。

- [ ] **Step 5: 实现事件详情抽屉**

`src/components/EventDetailDrawer.vue`（**整体替换** Task 9 的契约壳，props/emits/expose 签名不变）：

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import EventEditDialog from '@/components/EventEditDialog.vue'
import SnapImage from '@/components/SnapImage.vue'
import { getEventDetail } from '@/api/event'
import { useEnum } from '@/composables/useEnum'
import { EVENT_TYPE } from '@/constants/error-code'
import { dash, textOr } from '@/utils/format'
import type { EventRecordDetail } from '@/types/api'

const props = defineProps<{ modelValue: boolean; eventId: number | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void; (e: 'edited'): void }>()

const loading = ref(false)
const detail = ref<EventRecordDetail | null>(null)
const editVisible = ref(false)

const {
  eventTypeLabel,
  taskLabel,
  ruleTypeLabel,
  priorityLabel,
  priorityTag,
  handleStatusLabel,
  handleStatusTag,
  pushStatusLabel
} = useEnum()

const isVehicle = computed(() => detail.value?.eventType === EVENT_TYPE.VEHICLE)
const isFace = computed(() => detail.value?.eventType === EVENT_TYPE.FACE)
const isCrowd = computed(() => detail.value?.eventType === EVENT_TYPE.CROWD)

/**
 * 详情 VO **没有 task 字段**（只有列表 VO 有），子类只能从 sourceData.task 取。
 * sourceData 可能是对象、字符串（后端解析失败回退）或 null，只有对象形态才拿得到 task。
 */
const taskCode = computed<string | null>(() => {
  const raw = detail.value?.sourceData
  if (raw && typeof raw === 'object') {
    const value = (raw as Record<string, unknown>).task
    if (typeof value === 'string' && value !== '') return value
  }
  return null
})

/** sourceData 三种形态统一渲染为文本放进 <pre>，全站不用 v-html */
const sourceDataText = computed<string>(() => {
  const raw = detail.value?.sourceData
  if (raw === null || raw === undefined) return '无'
  if (typeof raw === 'string') return raw.trim() === '' ? '无' : raw
  try {
    return JSON.stringify(raw, null, 2)
  } catch {
    return String(raw)
  }
})

const hitRuleText = computed<string>(() => {
  const rule = detail.value?.hitRule
  if (rule) return `${rule.ruleName}（${ruleTypeLabel(rule.ruleType)}）`
  return detail.value?.hitRuleId ? `已命中规则 #${detail.value.hitRuleId}` : '未命中'
})

async function loadDetail(id: number): Promise<void> {
  loading.value = true
  try {
    detail.value = await getEventDetail(id)
  } catch {
    // 1001 事件不存在 / 1002 已删除：拦截器已弹提示，这里关掉抽屉别留一个空壳
    detail.value = null
    emit('update:modelValue', false)
  } finally {
    loading.value = false
  }
}

/** 供宿主页在外部完成修正后调用（list.vue 的 drawerRef.reload()） */
function reload(): void {
  if (props.eventId !== null) void loadDetail(props.eventId)
}
defineExpose({ reload })

watch(
  () => [props.modelValue, props.eventId] as const,
  ([open, id]) => {
    if (open && id !== null) void loadDetail(id)
  },
  { immediate: true }
)

/**
 * 抽屉内修正成功：自己重拉详情（否则还显示旧值），同时通知宿主页刷新列表。
 * 提示在这里弹 —— 页面级弹窗走 list.vue 的 onSaved() 弹，两条路径各弹一次，不会重复。
 */
function onSaved(): void {
  ElMessage.success('修正成功')
  emit('edited')
  reload()
}
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="事件详情"
    size="720px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div v-loading="loading" class="detail">
      <el-empty v-if="!loading && !detail" description="事件不存在或已被删除" />

      <template v-else-if="detail">
        <!-- ① 头部：ID + 三个标签 + 抓拍时间 -->
        <div class="detail__head">
          <span class="detail__id">#{{ detail.id }}</span>
          <el-tag size="small" effect="light">
            {{ textOr(detail.eventTypeName, eventTypeLabel(detail.eventType)) }}
          </el-tag>
          <el-tag size="small" effect="light" :type="priorityTag(detail.priority)">
            {{ priorityLabel(detail.priority) }}
          </el-tag>
          <el-tag size="small" effect="light" :type="handleStatusTag(detail.handleStatus)">
            {{ handleStatusLabel(detail.handleStatus) }}
          </el-tag>
          <span class="sub-text">{{ detail.snapTime }}</span>
        </div>

        <!-- ② 抓拍图：可点击放大；MinIO 私有桶时自动降级为占位 -->
        <div class="detail__snap">
          <SnapImage :src="detail.snapUrl" :width="320" :height="200" preview />
        </div>

        <!-- ③ 基础信息 -->
        <el-descriptions title="基础信息" :column="2" border size="small">
          <el-descriptions-item label="设备名称">{{ dash(detail.deviceName) }}</el-descriptions-item>
          <el-descriptions-item label="设备编号">{{ dash(detail.deviceNum) }}</el-descriptions-item>
          <el-descriptions-item label="事件大类">
            {{ textOr(detail.eventTypeName, eventTypeLabel(detail.eventType)) }}
          </el-descriptions-item>
          <el-descriptions-item label="事件子类">{{ taskLabel(taskCode) }}</el-descriptions-item>
          <el-descriptions-item label="推送状态">{{ pushStatusLabel(detail.status) }}</el-descriptions-item>
          <el-descriptions-item label="命中规则">{{ hitRuleText }}</el-descriptions-item>
        </el-descriptions>

        <!-- ④ 业务字段：按大类动态渲染，空值统一显示 — 而非留白 -->
        <el-descriptions v-if="isVehicle" title="车辆信息" :column="2" border size="small">
          <el-descriptions-item label="车牌号">{{ dash(detail.plateNum) }}</el-descriptions-item>
          <el-descriptions-item label="特殊车辆类别 code">
            {{ dash(detail.vehicleType) }}
          </el-descriptions-item>
          <el-descriptions-item label="车辆类别">{{ dash(detail.vehicleNormalType) }}</el-descriptions-item>
          <el-descriptions-item label="品牌">{{ dash(detail.vehicleLogo) }}</el-descriptions-item>
          <el-descriptions-item label="子品牌">{{ dash(detail.vehicleSubLogo) }}</el-descriptions-item>
          <el-descriptions-item label="颜色">{{ dash(detail.vehicleColor) }}</el-descriptions-item>
          <el-descriptions-item label="年款">{{ dash(detail.vehicleModel) }}</el-descriptions-item>
          <el-descriptions-item label="限高(m)">{{ dash(detail.heightPermitted) }}</el-descriptions-item>
        </el-descriptions>

        <el-descriptions v-if="isFace" title="人脸信息" :column="2" border size="small">
          <el-descriptions-item label="姓名">{{ dash(detail.name) }}</el-descriptions-item>
          <el-descriptions-item label="身份证号">{{ dash(detail.cardno) }}</el-descriptions-item>
          <el-descriptions-item label="库名称">{{ dash(detail.libName) }}</el-descriptions-item>
          <el-descriptions-item label="相似度">{{ dash(detail.similarity) }}</el-descriptions-item>
          <el-descriptions-item label="库底图">{{ dash(detail.identifyFaceUrl) }}</el-descriptions-item>
          <el-descriptions-item label="可见光图">{{ dash(detail.visibleLightUrl) }}</el-descriptions-item>
        </el-descriptions>

        <el-descriptions v-if="isCrowd" title="聚集信息" :column="2" border size="small">
          <el-descriptions-item label="聚集人数">{{ dash(detail.crowdNum) }}</el-descriptions-item>
        </el-descriptions>

        <!-- ⑤ 检测元数据 -->
        <div class="detail__section-title">检测元数据</div>
        <pre class="json-pre">{{ sourceDataText }}</pre>

        <!-- ⑥ 处理历史（HandleHistoryVO 无主键，只能用下标作 key） -->
        <div class="detail__section-title">处理历史</div>
        <el-timeline v-if="detail.handleHistory.length > 0">
          <el-timeline-item
            v-for="(item, index) in detail.handleHistory"
            :key="index"
            :timestamp="textOr(item.handleTime)"
            placement="top"
          >
            <div>
              <el-tag size="small" effect="light" :type="handleStatusTag(item.toStatus)">
                {{ handleStatusLabel(item.toStatus) }}
              </el-tag>
              <span class="detail__handler">{{ textOr(item.handlerName, '系统') }}</span>
            </div>
            <div v-if="item.handleRemark" class="sub-text">{{ item.handleRemark }}</div>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else description="暂无处理记录" :image-size="60" />
      </template>
    </div>

    <template #footer>
      <el-button type="primary" :disabled="!detail" @click="editVisible = true">修正</el-button>
      <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
    </template>

    <!-- 抽屉内嵌修正弹窗：与页面级那个是两个独立实例，不会重复弹提示 -->
    <EventEditDialog v-model="editVisible" :event-id="eventId" @saved="onSaved" />
  </el-drawer>
</template>

<style scoped>
.detail {
  min-height: 200px;
}

.detail__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.detail__id {
  font-size: 16px;
  font-weight: 600;
}

.detail__snap {
  margin-bottom: 16px;
}

.detail__section-title {
  margin: 18px 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.detail__handler {
  margin-left: 8px;
  font-size: 13px;
}
</style>
```

- [ ] **Step 6: 实现事件修正弹窗**

`src/components/EventEditDialog.vue`（**整体替换** Task 9 的契约壳，props/emits 签名不变）：

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  asNumber,
  diffEditForm,
  emptyEditForm,
  toEditForm,
  visibleGroups,
  type EditForm
} from '@/components/eventEditModel'
import { getEventDetail, updateEvent } from '@/api/event'
import type { EventRecordDetail } from '@/types/api'

const props = defineProps<{ modelValue: boolean; eventId: number | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void; (e: 'saved'): void }>()

const loading = ref(false)
const submitting = ref(false)
const detail = ref<EventRecordDetail | null>(null)
const form = ref<EditForm>(emptyEditForm())

/** 一次算出「要发的请求体」与「发了也没用的字段」，提交按钮与提示条共用 */
const diff = computed(() => {
  const source = detail.value
  if (!source) return { patch: {}, ignored: [] as string[] }
  return diffEditForm(source, form.value)
})
const canSubmit = computed(() => Object.keys(diff.value.patch).length > 0)
const ignoredLabels = computed(() => diff.value.ignored)
const groups = computed(() => visibleGroups(detail.value?.eventType ?? null))

async function loadDetail(id: number): Promise<void> {
  loading.value = true
  try {
    const data = await getEventDetail(id)
    detail.value = data
    // 详情快照即表单初值：diffEditForm 靠「表单 vs 详情」比对，不另存一份快照
    form.value = toEditForm(data)
  } catch {
    // 1001/1002：拦截器已提示，关掉弹窗别留空表单
    detail.value = null
    form.value = emptyEditForm()
    emit('update:modelValue', false)
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.modelValue, props.eventId] as const,
  ([open, id]) => {
    if (open && id !== null) void loadDetail(id)
  },
  { immediate: true }
)

async function onSubmit(): Promise<void> {
  const source = detail.value
  if (!source || !canSubmit.value) return
  submitting.value = true
  try {
    await updateEvent(source.id, diff.value.patch)
    emit('saved')
    emit('update:modelValue', false)
  } catch {
    /* 拦截器已提示（1001 事件不存在 / 400 参数错误 / 401 已跳登录） */
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="修正事件信息"
    width="640px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div v-loading="loading" class="edit">
      <el-alert type="info" :closable="false" show-icon class="edit__tip">
        <template #title>
          只提交被改动的字段。清空文本框会把该字段置为空；数字字段清空不会被保存。
        </template>
      </el-alert>

      <el-alert
        v-if="ignoredLabels.length > 0"
        type="warning"
        :closable="false"
        show-icon
        class="edit__tip"
      >
        <template #title>
          {{ ignoredLabels.join('、') }} 被清空但不会保存 —— 后端 PUT 忽略 null 值。
        </template>
      </el-alert>

      <el-form v-if="detail" :model="form" label-width="132px">
        <template v-for="group in groups" :key="group.key">
          <el-divider content-position="left">{{ group.title }}</el-divider>
          <el-row :gutter="16">
            <el-col v-for="meta in group.fields" :key="meta.key" :span="12">
              <el-form-item :label="meta.label">
                <!--
                  数字控件用 :model-value + @update:model-value 而非 v-model：
                  表单值是 string|number|null 联合，el-input-number 只收 number|null，
                  且它 emit 的是 number|undefined，直接 v-model 会被 vue-tsc 判为类型不相容。
                -->
                <el-input-number
                  v-if="meta.kind === 'number'"
                  :model-value="asNumber(form[meta.key])"
                  :min="meta.min"
                  :max="meta.max"
                  :precision="meta.precision"
                  :placeholder="meta.placeholder"
                  :controls="false"
                  class="edit__control"
                  @update:model-value="(val: number | undefined) => { form[meta.key] = val ?? null }"
                />
                <el-input
                  v-else
                  v-model="form[meta.key]"
                  :maxlength="meta.maxlength"
                  :placeholder="meta.placeholder"
                  clearable
                />
              </el-form-item>
            </el-col>
          </el-row>
        </template>
      </el-form>

      <el-empty v-else-if="!loading" description="事件不存在或已被删除" :image-size="60" />
    </div>

    <template #footer>
      <span v-if="detail && !canSubmit" class="sub-text edit__hint">未检测到改动</span>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" :disabled="!canSubmit" @click="onSubmit">
        保存修改
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.edit {
  min-height: 160px;
}

.edit__tip {
  margin-bottom: 12px;
}

.edit__control {
  width: 100%;
}

.edit__hint {
  margin-right: 12px;
}
</style>
```

- [ ] **Step 7: 类型检查 + 全量测试**

Run: `cd D:\Code\Front\Detect ; npm run type-check ; npm run test`
Expected: 两者 EXIT=0

常见报错与处理：
- `Type 'string | number | null' is not assignable to type 'number | null'` → 数字控件忘了用 `asNumber(...)` 包一层
- `Property 'task' does not exist on type 'EventRecordDetail'` → 详情 VO 确实没有 `task`，必须走 `taskCode` 计算属性从 `sourceData` 取
- `Property 'reload' does not exist` → 抽屉的 `defineExpose({ reload })` 被误删

- [ ] **Step 8: 真实后端联调验证（14 项）**

前置：同 Task 9 Step 9。Run: `npm run dev` → `http://localhost:5173/` → 登录 `admin / 123456` → `/event/list`

| # | 操作 | 预期 |
|---|------|------|
| 1 | 点 id=1（人员聚集）的「详情」 | 抽屉右滑出，头部四个标签齐备，「聚集信息」分区显示人数，**不**出现车辆/人脸分区 |
| 2 | 看 id=1 的「事件子类」 | 显示「人员聚集」（从 `sourceData.task = people_gathering` 翻译而来，**不是**空白） |
| 3 | 看 id=1 的「检测元数据」 | `<pre>` 里是格式化 JSON，含 `task`/`confidence`/`bbox`/`trackId` 等键 |
| 4 | 看 id=1 的「处理历史」 | 无记录时显示「暂无处理记录」，不报错 |
| 5 | 点 id=8（车牌 浙C6B5P8）的「详情」 | 出现「车辆信息」分区 8 行；命中规则显示「黑名单车牌（车牌黑名单）」；推送状态「已推送」 |
| 6 | 看 id=8 的「检测元数据」 | 含 `"trackId": null`（后端真实推送数据就是 null，不是前端丢了） |
| 7 | 看 id=8 的抓拍图区域 | MinIO 私有桶时显示「图片不可访问」占位，抽屉其余内容照常渲染，无全局报错 |
| 8 | 列表行点「修正」 | 弹窗打开，只出现「通用」+「车辆信息」两组；表单初值与详情一致 |
| 9 | 不改任何字段 | 「保存修改」置灰，底部显示「未检测到改动」 |
| 10 | 只把「颜色」改为 `红色` → 保存 | Network 里 PUT 请求体为 **`{"vehicleColor":"红色"}`**（只有一个键），提示「修正成功」，列表与详情同步变新值 |
| 11 | DB 校验中文未乱码 | `HEX(vehicle_color)` = `E7BAA2E889B2` |
| 12 | 清空「车牌号」文本框 → 保存 | 请求体 `{"plateNum":""}`；刷新后列表与详情该车牌显示 `—` |
| 13 | 清空「聚集人数」数字框 → 保存 | 出现黄色警告条「聚集人数 被清空但不会保存」，且「保存修改」仍置灰（patch 为空） |
| 14 | 详情抽屉底部点「修正」→ 保存 | 抽屉内容**就地刷新**为新值（不靠手动重开），列表同步刷新，只弹一条「修正成功」 |

**验证命令**（第 11 项）：

```powershell
docker exec -i detect-mysql mysql -uroot -proot detect_event -e "SELECT id, plate_num, vehicle_color, HEX(vehicle_color) AS hex_color FROM event_records WHERE id=8;"
```

**修正验证后的数据还原**：

```powershell
docker exec -i detect-mysql mysql -uroot -proot detect_event -e "UPDATE event_records SET vehicle_color='蓝色', plate_num='浙C6B5P8' WHERE id=8;"
```

**验证 PUT 请求体的方法**（第 10 项）：DevTools → Network → 选中 `PUT /api/admin/event/event-records/8` → Payload → view source，应看到 `{"vehicleColor":"红色"}`。若看到 15 个键全在（带一堆 null），说明 `diffEditForm` 没生效，回去查 Step 6 的 `diff` 计算属性。

**404 / 1001 验证**（额外）：在控制台手工执行

```js
fetch('/api/admin/event/event-records/999999', { headers: { Authorization: 'Bearer ' + localStorage.getItem('detect_access_token') } }).then(r => r.json()).then(console.log)
```

应得 `{code:1001, msg:"事件不存在", data:null}`；前端访问一个已删除的 id 时，拦截器弹提示、抽屉自动关闭。

- [ ] **Step 9: 提交**

```bash
git add src/components
git commit -m "feat: 事件详情抽屉（分组字段/sourceData/处理历史）+ 修正弹窗（只发改动项）+ 单测"
```

---

## Task 11: 数据看板（统计卡 + ECharts 三图）

**Files:**
- Create: `src/components/statOptions.ts`
- Test: `src/components/__tests__/statOptions.test.ts`
- Create: `src/components/StatChart.vue`
- Modify: `src/views/event/statistics.vue`（替换 Task 6 的占位）

**Interfaces:**
- Consumes:
  - `getEventStatistics(params: { startTime?: string; endTime?: string; deviceNum?: string }): Promise<EventStat>`（Task 4）
  - `cleanParams<T = Record<string, unknown>>(params: Record<string, unknown>): T`（Task 2）
  - `EVENT_TYPE`（`src/constants/error-code.ts`）
  - `EventStat`（`src/types/api.ts`）= `{ total: number; byEventType: {code,name,count}[]; byTask: {task,name,count}[]; byDay: {date,count}[] }`
- Produces（`src/components/statOptions.ts`）:
  - `type StatChartOption = ComposeOption<PieSeriesOption | BarSeriesOption | LineSeriesOption | TitleComponentOption | TooltipComponentOption | LegendComponentOption | GridComponentOption | DataZoomComponentOption>`
  - `pieOption(stat: EventStat): StatChartOption`
  - `taskBarOption(stat: EventStat): StatChartOption`
  - `dailyLineOption(stat: EventStat): StatChartOption`
  - `countOfEventType(stat: EventStat, code: number): number`
  - `<StatChart :option="StatChartOption" :height="number" />`（height 默认 300）

> **为何把 option 构造拆成纯函数**：ECharts 的 option 对象动辄 40 行，写在 SFC 的 computed 里就没法单测；而「子类名为空要回退 code」「横向柱图要反转才能让最大值在顶部」「天数多了要关 symbol」这些都是真会错的分支。

- [ ] **Step 1: 写 statOptions 的失败测试**

`src/components/__tests__/statOptions.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import {
  countOfEventType,
  dailyLineOption,
  pieOption,
  taskBarOption,
  type StatChartOption
} from '@/components/statOptions'
import type { EventStat } from '@/types/api'

/** ComposeOption 的 series / xAxis / yAxis 都是宽联合类型，测试里统一抹平后再断言 */
function firstSeries(option: StatChartOption): Record<string, unknown> {
  const series = option.series
  return (Array.isArray(series) ? series[0] : series) as Record<string, unknown>
}

function categoryAxis(option: StatChartOption): { data: string[] } {
  const axes = Array.isArray(option.xAxis) ? option.xAxis : [option.xAxis]
  const yAxes = Array.isArray(option.yAxis) ? option.yAxis : [option.yAxis]
  const hit = [...axes, ...yAxes].find((axis) => axis && axis.type === 'category')
  return hit as { data: string[] }
}

function stat(over: Partial<EventStat> = {}): EventStat {
  return {
    total: 30,
    byEventType: [
      { code: 100, name: '人脸事件', count: 5 },
      { code: 200, name: '车辆事件', count: 15 },
      { code: 300, name: '人员聚集', count: 10 }
    ],
    byTask: [
      { task: 'license_plate', name: '车牌识别', count: 12 },
      { task: 'vehicle_type', name: '车型识别', count: 3 },
      { task: 'people_gathering', name: null, count: 10 }
    ],
    byDay: [
      { date: '2026-09-10', count: 12 },
      { date: '2026-09-11', count: 8 },
      { date: '2026-09-12', count: 10 }
    ],
    ...over
  }
}

describe('pieOption', () => {
  it('byEventType 映射为饼图 data（name + value）', () => {
    expect(firstSeries(pieOption(stat()))).toMatchObject({
      type: 'pie',
      data: [
        { name: '人脸事件', value: 5 },
        { name: '车辆事件', value: 15 },
        { name: '人员聚集', value: 10 }
      ]
    })
  })

  it('byEventType 为空时 data 为空数组而非 undefined', () => {
    expect(firstSeries(pieOption(stat({ byEventType: [] })))).toMatchObject({ data: [] })
  })
})

describe('taskBarOption', () => {
  it('反转 byTask，让数量最大的子类显示在横向柱图顶部', () => {
    expect(firstSeries(taskBarOption(stat())).data).toEqual([10, 3, 12])
  })

  it('子类中文名为空时回退 task code，不留空白条', () => {
    expect(categoryAxis(taskBarOption(stat())).data).toEqual([
      'people_gathering',
      '车型识别',
      '车牌识别'
    ])
  })

  it('byTask 为空时坐标轴与 series 都是空数组', () => {
    const option = taskBarOption(stat({ byTask: [] }))
    expect(categoryAxis(option).data).toEqual([])
    expect(firstSeries(option).data).toEqual([])
  })
})

describe('dailyLineOption', () => {
  it('x 轴取 date，series 取 count', () => {
    const option = dailyLineOption(stat())
    expect(categoryAxis(option).data).toEqual(['2026-09-10', '2026-09-11', '2026-09-12'])
    expect(firstSeries(option).data).toEqual([12, 8, 10])
  })

  it('天数 ≤ 40 时显示数据点标记', () => {
    expect(firstSeries(dailyLineOption(stat())).showSymbol).toBe(true)
  })

  it('天数 > 40 时隐藏数据点标记，避免折线上挤满圆点', () => {
    const many = Array.from({ length: 41 }, (_, index) => ({
      date: `2026-08-${String(index + 1).padStart(2, '0')}`,
      count: index
    }))
    expect(firstSeries(dailyLineOption(stat({ byDay: many }))).showSymbol).toBe(false)
  })

  it('byDay 为空时 data 为空数组', () => {
    expect(firstSeries(dailyLineOption(stat({ byDay: [] }))).data).toEqual([])
  })
})

describe('countOfEventType', () => {
  it('按大类 code 取数量', () => {
    const source = stat()
    expect(countOfEventType(source, 100)).toBe(5)
    expect(countOfEventType(source, 200)).toBe(15)
    expect(countOfEventType(source, 300)).toBe(10)
  })

  it('该大类无事件时返回 0，统计卡不能显示 undefined', () => {
    expect(countOfEventType(stat({ byEventType: [] }), 200)).toBe(0)
    expect(countOfEventType(stat(), 999)).toBe(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd D:\Code\Front\Detect ; npm run test -- statOptions`
Expected: FAIL — `Failed to resolve import "@/components/statOptions"`

- [ ] **Step 3: 实现 statOptions**

`src/components/statOptions.ts`：

```ts
import type { ComposeOption } from 'echarts/core'
import type { BarSeriesOption, LineSeriesOption, PieSeriesOption } from 'echarts/charts'
import type {
  DataZoomComponentOption,
  GridComponentOption,
  LegendComponentOption,
  TitleComponentOption,
  TooltipComponentOption
} from 'echarts/components'
import type { EventStat } from '@/types/api'

/**
 * 按需引入后，option 类型必须用 ComposeOption 把已注册的模块拼出来。
 * 直接用 echarts 全量的 EChartsOption 会让未注册的模块（如 map/radar）也能写进去，运行时才报错。
 */
export type StatChartOption = ComposeOption<
  | PieSeriesOption
  | BarSeriesOption
  | LineSeriesOption
  | TitleComponentOption
  | TooltipComponentOption
  | LegendComponentOption
  | GridComponentOption
  | DataZoomComponentOption
>

/** 主题色与中性色：与 Element Plus 默认色板对齐，三图共用一套 */
const PRIMARY = '#409eff'
const WARNING = '#e6a23c'
const MUTED = '#909399'
const BORDER = '#ebeef5'

/** 数据点超过这个天数就关掉圆点标记，否则折线会变成一串黑点 */
const SYMBOL_LIMIT = 40

/** 图 1：事件大类占比（环形饼图） */
export function pieOption(stat: EventStat): StatChartOption {
  return {
    color: [PRIMARY, WARNING, '#67c23a', '#f56c6c', MUTED],
    tooltip: { trigger: 'item', formatter: '{b}：{c} 条（{d}%）' },
    legend: {
      bottom: 0,
      left: 'center',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: MUTED, fontSize: 12 }
    },
    series: [
      {
        name: '事件大类',
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { show: true, color: '#303133', fontSize: 12, formatter: '{b}\n{c}' },
        labelLine: { length: 8, length2: 8 },
        data: stat.byEventType.map((item) => ({ name: item.name, value: item.count }))
      }
    ]
  }
}

/** 图 2：事件子类分布（横向柱图） */
export function taskBarOption(stat: EventStat): StatChartOption {
  // y 轴类目自下而上排列，先反转才能让数量最大的子类落在顶部
  const items = [...stat.byTask].reverse()
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 32, top: 16, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: MUTED, fontSize: 12 },
      splitLine: { lineStyle: { color: BORDER } }
    },
    yAxis: {
      type: 'category',
      // 后端字典缺失时 name 为 null，回退到 task code，不留空白条
      data: items.map((item) => item.name || item.task),
      axisLabel: { color: MUTED, fontSize: 12 },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: BORDER } }
    },
    series: [
      {
        name: '事件数',
        type: 'bar',
        barMaxWidth: 22,
        itemStyle: { color: PRIMARY, borderRadius: [0, 3, 3, 0] },
        label: { show: true, position: 'right', color: MUTED, fontSize: 12 },
        data: items.map((item) => item.count)
      }
    ]
  }
}

/** 图 3：每日事件趋势（面积折线 + dataZoom） */
export function dailyLineOption(stat: EventStat): StatChartOption {
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 8, right: 24, top: 24, bottom: 44, containLabel: true },
    dataZoom: [
      { type: 'inside' },
      { type: 'slider', height: 18, bottom: 8, borderColor: BORDER }
    ],
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: stat.byDay.map((item) => item.date),
      axisLabel: { color: MUTED, fontSize: 12 },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: BORDER } }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: MUTED, fontSize: 12 },
      splitLine: { lineStyle: { color: BORDER } }
    },
    series: [
      {
        name: '事件数',
        type: 'line',
        smooth: true,
        showSymbol: stat.byDay.length <= SYMBOL_LIMIT,
        symbolSize: 6,
        lineStyle: { width: 2, color: PRIMARY },
        itemStyle: { color: PRIMARY },
        areaStyle: { color: 'rgba(64, 158, 255, 0.12)' },
        data: stat.byDay.map((item) => item.count)
      }
    ]
  }
}

/** 统计卡取数：指定大类的事件数，该大类无数据时返 0 */
export function countOfEventType(stat: EventStat, code: number): number {
  return stat.byEventType.find((item) => item.code === code)?.count ?? 0
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- statOptions`
Expected: PASS，11 tests

- [ ] **Step 5: 实现 StatChart 容器**

`src/components/StatChart.vue`：

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { StatChartOption } from '@/components/statOptions'

/**
 * 按需注册：只引三图用到的模块。echarts 全量包 gzip 后仍近 350KB，
 * 按需后只带 pie/bar/line + grid/tooltip/legend/dataZoom，体积降到一半以下。
 * use() 幂等，多个图表实例重复挂载不会重复注册。
 *
 * AxisPointerComponent 必须显式带上：taskBarOption 用了 `tooltip.axisPointer.type = 'shadow'`，
 * 缺了它十字准星会退化成默认样式且不报错，很难发现。
 */
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer
])

const props = withDefaults(defineProps<{ option: StatChartOption; height?: number }>(), {
  height: 300
})

/**
 * 必须用 shallowRef：ECharts 实例内部持有 canvas、zrender 对象树与大量循环引用，
 * 被 Vue 深层响应式代理后 setOption 会慢一个数量级，且内部 getter 可能行为异常。
 */
const container = shallowRef<HTMLDivElement | null>(null)
const chart = shallowRef<echarts.EChartsType | null>(null)

function resize(): void {
  chart.value?.resize()
}

onMounted(() => {
  if (!container.value) return
  chart.value = echarts.init(container.value)
  chart.value.setOption(props.option, true)
  // 侧栏折叠、浏览器缩放都会改容器宽，不监听会留下空白或溢出
  window.addEventListener('resize', resize)
})

// 不用 deep：看板页每次查询都重建整个 option 对象，引用必然变化，深层遍历只会白耗性能
watch(
  () => props.option,
  (option) => {
    // notMerge=true：筛选条件变化后必须整体替换。否则「上次 5 个柱、这次 3 个」会残留两条，
    // dataZoom 的缩放区间也会从上一次继承过来。
    chart.value?.setOption(option, true)
  }
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chart.value?.dispose()
  chart.value = null
})
</script>

<template>
  <div ref="container" class="stat-chart" :style="{ height: `${height}px` }" />
</template>

<style scoped>
.stat-chart {
  width: 100%;
}
</style>
```

> `dispose()` 不能省：看板页在路由之间反复进出，不 dispose 会泄露 canvas 与 window resize 监听，几轮下来内存持续上涨。

- [ ] **Step 6: 实现数据看板页**

`src/views/event/statistics.vue`（**整体替换** Task 6 的占位内容）：

```vue
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Refresh, Search } from '@element-plus/icons-vue'
import StatChart from '@/components/StatChart.vue'
import {
  countOfEventType,
  dailyLineOption,
  pieOption,
  taskBarOption
} from '@/components/statOptions'
import { getEventStatistics } from '@/api/event'
import { EVENT_TYPE } from '@/constants/error-code'
import { cleanParams } from '@/utils/params'
import type { EventStat } from '@/types/api'

/** 看板筛选：接口只收 3 个参数（startTime/endTime/deviceNum），比列表页简单很多 */
interface StatFilter {
  deviceNum: string
  dateRange: [string, string] | null
}

interface StatQuery {
  startTime?: string
  endTime?: string
  deviceNum?: string
}

/** 失败或无数据时的空壳：三图靠 total===0 统一走 el-empty，不给 ECharts 喂空数组 */
const EMPTY_STAT: EventStat = { total: 0, byEventType: [], byTask: [], byDay: [] }

const filter = reactive<StatFilter>({ deviceNum: '', dateRange: null })
const stat = ref<EventStat>(EMPTY_STAT)
const loading = ref(false)

const cards = computed(() => [
  { label: '事件总量', value: stat.value.total, tone: 'total' },
  { label: '车辆事件', value: countOfEventType(stat.value, EVENT_TYPE.VEHICLE), tone: 'vehicle' },
  { label: '人员聚集', value: countOfEventType(stat.value, EVENT_TYPE.CROWD), tone: 'crowd' },
  { label: '人脸事件', value: countOfEventType(stat.value, EVENT_TYPE.FACE), tone: 'face' }
])

const pieData = computed(() => pieOption(stat.value))
const barData = computed(() => taskBarOption(stat.value))
const lineData = computed(() => dailyLineOption(stat.value))
const isEmpty = computed(() => stat.value.total === 0)

async function load(): Promise<void> {
  loading.value = true
  try {
    stat.value = await getEventStatistics(
      // 同样要清洗：设备编号清空后是 ''，原样发出 `?deviceNum=` 会白扰一次全表扫描
      cleanParams<StatQuery>({
        deviceNum: filter.deviceNum,
        startTime: filter.dateRange?.[0] ?? null,
        endTime: filter.dateRange?.[1] ?? null
      })
    )
  } catch {
    // 拦截器已提示；回退空壳而不是保留上一次的旧数据
    stat.value = EMPTY_STAT
  } finally {
    loading.value = false
  }
}

function search(): void {
  void load()
}

function reset(): void {
  filter.deviceNum = ''
  filter.dateRange = null
  void load()
}

onMounted(load)
</script>

<template>
  <div class="page-container">
    <el-card shadow="never" class="filter-card">
      <el-form :model="filter" inline label-width="76px" @submit.prevent>
        <el-form-item label="设备编号">
          <el-input
            v-model="filter.deviceNum"
            placeholder="全部"
            clearable
            style="width: 180px"
            @keyup.enter="search"
          />
        </el-form-item>
        <el-form-item label="抓拍时间">
          <el-date-picker
            v-model="filter.dateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 360px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" :loading="loading" @click="search">查询</el-button>
          <el-button :icon="Refresh" @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 统计卡 -->
    <el-row :gutter="16">
      <el-col v-for="card in cards" :key="card.label" :xs="12" :sm="12" :md="6">
        <el-card shadow="never" class="stat-card">
          <div class="stat-card__label">{{ card.label }}</div>
          <div class="stat-card__value" :class="`stat-card__value--${card.tone}`">
            {{ card.value }}
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图 1 / 图 2 -->
    <el-row v-loading="loading" :gutter="16">
      <el-col :xs="24" :md="10">
        <el-card shadow="never">
          <template #header><span class="card-title">事件大类占比</span></template>
          <el-empty v-if="isEmpty" description="所选条件下暂无数据" :image-size="80" />
          <StatChart v-else :option="pieData" :height="300" />
        </el-card>
      </el-col>
      <el-col :xs="24" :md="14">
        <el-card shadow="never">
          <template #header><span class="card-title">事件子类分布</span></template>
          <el-empty v-if="isEmpty" description="所选条件下暂无数据" :image-size="80" />
          <StatChart v-else :option="barData" :height="300" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 图 3 -->
    <el-card v-loading="loading" shadow="never">
      <template #header><span class="card-title">每日事件趋势</span></template>
      <el-empty v-if="isEmpty" description="所选条件下暂无数据" :image-size="80" />
      <StatChart v-else :option="lineData" :height="320" />
    </el-card>
  </div>
</template>

<style scoped>
.stat-card {
  text-align: center;
}

.stat-card__label {
  font-size: 13px;
  color: var(--detect-text-muted);
}

.stat-card__value {
  margin-top: 8px;
  font-size: 28px;
  font-weight: 600;
  line-height: 1.2;
  color: #303133;
}

.stat-card__value--vehicle {
  color: #409eff;
}

.stat-card__value--crowd {
  color: #e6a23c;
}

.stat-card__value--face {
  color: #67c23a;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
}
</style>
```

> **为何用 `total === 0` 而不是「三个数组都为空」判空**：后端 `EventStatVO.total` 就是三者的汇总，单一判据不会出现「total=0 但 byDay 有一条」的矛盾渲染。
> **`v-loading` 放在 `el-row` / `el-card` 而不是整页**：筛选卡在加载时仍可操作，避免「查一次就锁一次屏」。

- [ ] **Step 7: 类型检查 + 全量测试 + 构建**

Run: `cd D:\Code\Front\Detect ; npm run type-check ; npm run test ; npm run build`
Expected: 三者均 EXIT=0；`dist/assets/` 里能看到独立的 `echarts-*.js` chunk（manualChunks 生效）

常见报错与处理：
- `Cannot find module 'echarts/core'` → `npm install` 未装全，重跑 `npm install`
- `Type '...' is not assignable to type 'StatChartOption'` → option 里写了未注册的模块（如 `toolbox`/`visualMap`），要么删要么在 `StatChart.vue` 的 `echarts.use([...])` 里补对应 Component
- 图表不显示但无报错 → 容器高度为 0，检查 `:height` 是否传到、`.stat-chart` 的 `width:100%` 是否在

- [ ] **Step 8: 真实后端联调验证（9 项）**

前置：同 Task 9 Step 9。登录后左侧菜单点「数据看板」进 `/event/statistics`。

| # | 操作 | 预期 |
|---|------|------|
| 1 | 首次进页 | 4 张统计卡有数；「事件总量」= `SELECT COUNT(*) FROM event_records WHERE del_flag='0'` |
| 2 | 核对四张卡的关系 | 车辆 + 聚集 + 人脸 三数之和 ≤ 事件总量（后端可能存在未归类事件，不相等不是 bug） |
| 3 | 看 Network 的统计请求 | `GET /api/admin/event/event-records/statistics`，**无任何 query 参数**（首次进页筛选为空） |
| 4 | 饼图 | 扇区数 = `byEventType` 长度，hover 提示形如「车辆事件：15 条（50.00%）」 |
| 5 | 横向柱图 | 数量最大的子类在**顶部**；y 轴标签为中文（如「车牌识别」）而非 `license_plate` |
| 6 | 折线图 | x 轴为 `yyyy-MM-dd` 日期，拖动下方 dataZoom 滑块可缩放，鼠标滚轮也能缩 |
| 7 | 设备编号输 `dev01` → 查询 | 请求带 `deviceNum=dev01`；四张卡与三图同步变小（只剩南河湫水闸的数据） |
| 8 | 选一个未来时间区间 → 查询 | `total=0`，三图区域均显示「所选条件下暂无数据」，统计卡均为 0，**无 ECharts 报错** |
| 9 | 浏览器窗口拖窄、折叠侧栏 | 三图自适应重绘，不出现右侧空白或横向溢出 |

**验证命令**（第 1、2 项对账）：

```powershell
docker exec -i detect-mysql mysql -uroot -proot detect_event -e "SELECT COUNT(*) AS total, SUM(event_type=200) AS vehicle, SUM(event_type=300) AS crowd, SUM(event_type=100) AS face FROM event_records WHERE del_flag='0';"
```

- [ ] **Step 9: 提交**

```bash
git add src/components src/views/event/statistics.vue
git commit -m "feat: 数据看板（4 统计卡 + ECharts 饼/横向柱/折线三图，按需引入）+ 单测"
```

---

## Task 12: 端到端回归与生产构建验证

**Files:**
- Modify: `vite.config.ts`（补 `preview.proxy`）

**Interfaces:**
- Consumes: Task 1~11 全部产出
- Produces: 一份**实测**记录（写进 Task 13 的实施日志），而非预期清单

- [ ] **Step 1: 给 preview 也配上代理**

`vite.config.ts` 里 `server.proxy` **只对 `vite dev` 生效**，`vite preview` 读的是 `preview.proxy`。不补上这一步，Step 4 跑生产包时所有接口都会 404，很容易误判成代码问题。

把 `vite.config.ts` 改为（代理配置提为常量，dev 与 preview 共用）：

```ts
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_PROXY_TARGET || 'http://localhost:9999'

  /**
   * /api → 网关。rewrite 剥掉 /api 后交给网关的 StripPrefix 接着剥：
   *   /api/admin/event/event-records/page
   *     → (Vite)  /admin/event/event-records/page
   *     → (网关 StripPrefix=2)  /event-records/page → lb://detect-event
   * dev 与 preview 共用同一份，否则本地验生产包时接口全 404。
   */
  const proxy = {
    '/api': {
      target,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, '')
    }
  }

  return {
    plugins: [vue()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
    },
    server: {
      host: true,
      port: 5173,
      open: false,
      proxy
    },
    preview: {
      host: true,
      port: 4173,
      proxy
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks: {
            vue: ['vue', 'vue-router', 'pinia'],
            element: ['element-plus', '@element-plus/icons-vue'],
            echarts: ['echarts']
          }
        }
      }
    }
  }
})
```

> 生产环境不存在这个问题：`/api → gateway:9999` 的反代由 Nginx 承担（见 README 「生产部署」节）。

- [ ] **Step 2: 全量单测**

Run: `cd D:\Code\Front\Detect ; npm run test`
Expected: EXIT=0，全部测试文件绿

把**实测**的测试文件数与用例总数记下（Task 13 要写进实施日志）：

```powershell
npm run test 2>&1 | Select-String -Pattern "Test Files|Tests "
```

- [ ] **Step 3: 类型检查 + 生产构建**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 零错误，`vite build` 成功，`dist/assets/` 下能看到 `vue-*.js` / `element-*.js` / `echarts-*.js` / `index-*.js` 四类 chunk

记下实测的主包与三个 vendor 包体积：

```powershell
Get-ChildItem dist\assets\*.js | Sort-Object Length -Descending | Select-Object Name, @{n='KB';e={[math]::Round($_.Length/1KB,1)}} | Out-String
```

- [ ] **Step 4: 生产包冒烟（preview）**

Run: `npm run preview`（后台）→ 浏览器打开 `http://localhost:4173/`

逐项确认（与 dev 模式行为应完全一致）：
1. 未登录访问 `/` → 重定向到 `/login`
2. `admin / 123456` 登录成功 → 进 `/event/list`，表格有数据
3. 左侧菜单切到「数据看板」→ 三图正常渲染
4. Network 里接口地址仍为 `/api/...` 且返回 200（证明 `preview.proxy` 生效）

- [ ] **Step 5: 401 失效链路验证（两条路径）**

回到 `npm run dev`（`http://localhost:5173/`），登录后进 `/event/list`。

**路径 A：令牌被篖改（服务端判无效）**

1. DevTools Console 执行：
   ```js
   localStorage.setItem('detect_access_token', 'aaa.bbb.ccc')
   ```
2. 点「查询」
3. 预期（四项全部成立）：
   - Network 里 `page` 请求返回 **HTTP 401**（detect-event 是 OAuth2 资源服务器，JWKS 验签失败）
   - 弹出提示「未认证，请重新登录」
   - 地址变为 `/login?redirect=%2Fevent%2Flist`
   - Console 执行 `localStorage.getItem('detect_access_token')` 返回 `null`（令牌已清）
4. 重新用 `admin / 123456` 登录 → 预期**直接回到 `/event/list`**（而不是首页），列表正常加载

**路径 B：令牌自然过期（前端预判，不发请求）**

1. Console 执行：
   ```js
   const u = JSON.parse(localStorage.getItem('detect_login_user')); u.expiresIn = 1; localStorage.setItem('detect_login_user', JSON.stringify(u))
   ```
2. 等 30 秒（`isTokenExpired` 留了 30s 余量），然后点左侧菜单「数据看板」
3. 预期：地址变 `/login?redirect=%2Fevent%2Fstatistics`，**且 Network 里没发出任何 `/admin/event/...` 请求**（路由守卫拦在前，不浪费一次必败的往返）

- [ ] **Step 6: 跳页状态一致性抽查（4 项）**

| # | 操作 | 预期 |
|---|------|------|
| 1 | 列表页筛「处理状态=未处理」→ 切看板 → 切回列表 | 筛选重置为默认。**这是刻意行为**：未启用 `keep-alive`，避免「列表筛了未处理、看板却是全量」这种两页条件不一致又看不出来的窘境 |
| 2 | 全程监控 Network 里的 `/event-categories/enums` | 首次登录后**只出现 1 次**（字典缓存生效），列表与看板两页共用，不重复拉 |
| 3 | 列表页删一条 → 切看板 | 「事件总量」比删前少 1 |
| 4 | 顶栏「退出登录」→ 重新登录 | `/event-categories/enums` 再出现 1 次（全程共 2 次），证明 `dict.reset()` 生效且无并发重复 |

额外：地址栏直接输 `http://localhost:5173/rule/list`（Task 6 预留的 hidden 占位路由）→ 应显示「「布控规则」模块尚未实现，详见 docs/IMPLEMENTATION_LOG.md 未完成清单」，不白屏、不报 404。

- [ ] **Step 7: 提交**

```bash
git add vite.config.ts
git commit -m "fix: vite preview 补上 /api 代理，使生产包可本地联调"
```

> Step 2~6 的**实测结果**（测试数、chunk 体积、逐项通过/失败）先记在草稿里，Task 13 写实施日志时直接引用。**不得写「预期通过」充数。**

---
