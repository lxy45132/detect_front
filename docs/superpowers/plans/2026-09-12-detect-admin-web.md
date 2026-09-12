# Detect 事件管理后台前端 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `D:\Code\Front\Detect` 用 Vue 3 + TS 建成 Detect 事件管理后台前端，本期交付登录、事件管理（列表/详情/修正/删除/导出）与事件统计看板三个可用页面。

**Architecture:** 单向分层 `views → components/composables → stores → api → utils → types/constants`，禁止反向依赖。所有 HTTP 经单一 axios 实例，拦截器统一拆 `R<T>` 包与处理 401；字典一次性缓存进 Pinia；可测逻辑（参数清洗、枚举查表、修正 diff、图表 option）一律下沉为纯函数，Vue 组件只做绑定与编排。

**Tech Stack:** Vite 5 · Vue 3.5 (`<script setup>`) · TypeScript 5.6 strict · Element Plus 2.9（全量引入）· Pinia 2 · Vue Router 4 · Axios 1.7 · ECharts 5.5（按需引入）· Vitest 2 + jsdom + @vue/test-utils

**Spec:** `docs/superpowers/specs/2026-09-12-detect-admin-web-design.md`（计划从规格推导，执行时两份都要读；§7 是后续迭代清单，Task 13 要照抄进实施日志）

> **详细版参考实现**：本计划的每个 Task 曾有一份逐行贴出全部源码与测试代码的详细版，已归档至 `docs/superpowers/plans/archive/2026-09-12-detect-admin-web-detailed.md`。实施中若对某处写法犹豫，可查该文件对应 Task；但**以本计划的「实现要点」为准**，两者冲突时本计划优先。

## Global Constraints

- Node ≥ 18，包管理用 npm（仓库已有 `package-lock.json`）
- 所有请求经 Vite 代理 `/api` → 网关 `http://localhost:9999`；生产由 Nginx 反代，前端代码不含绝对后端地址
- 统一响应 `R<T> = { code, msg, data }`，**成功 `code === 0`**；分页 `PageResult<T> = { records, total, current, size, pages }`
- 网关路由前缀：`/auth/**` StripPrefix=1、`/admin/event/**` StripPrefix=2
- 时间字段后端已格式化为 `yyyy-MM-dd HH:mm:ss`，前端**不得二次转换**，直接展示
- 枚举 `code` 类型不统一（`eventType`/`handleStatus`/`priority` 为 number，`task`/`ruleType` 为 string），查表时统一 `String(code)`
- 全站中文文案；空值统一显示 `—`（`DASH` 常量），不留空白
- 视觉基调：Element Plus 默认主题色 `#409eff`，圆角 4px，侧栏 210px 深色（折叠 64px），顶栏 56px 白底，内容区 `#f5f7fa` + 16px padding；表格 `stripe`，标签 `effect="light"`
- `api/request.ts` **不得 import store 或 router**（避免循环依赖），401 走 `window.location.assign` 硬跳转
- 联调账号 `admin / 123456`；后端库名 `detect_auth` / `detect_event`，MySQL 容器 `detect-mysql` 端口 3307
- 每个 Task 结束必须提交一次 git，提交信息用中文、遵循 `feat:` / `fix:` / `test:` / `docs:` 前缀

---

## 前置产出（已存在于仓库，勿重写）

| 文件 | 内容 |
|---|---|
| `src/types/api.ts`（315 行） | 全部 DTO/VO：`R`、`PageResult`、`TokenResponse`、`EventEnums`、`EventQuery`、`EventRecordItem`、`EventRecordDetail`、`EventRecordUpdate`、`EventStat`、`DeletedResult`，以及后续模块预留的 `TodoItem`/`AlertRuleItem`/`NotificationItem` 等 |
| `src/utils/token.ts` | `TOKEN_KEY`/`USER_KEY` 读写、`getStoredUser`、`isTokenExpired`（30s 余量） |
| `src/constants/error-code.ts` | `SUCCESS_CODE = 0`、`ERROR_MESSAGES` 错误码文案表、`TOKEN_KEY`/`USER_KEY` 转出 |
| `.env.development` / `.env.production` | `VITE_API_BASE`、`VITE_PROXY_TARGET` |
| `package.json`、`tsconfig.json`、`vite.config.ts`、`index.html`、`public/` | 脚手架；`vite.config.ts` 由 Task 12 改写 |

> **仓库尚未 `git init`** —— Task 1 Step 0 负责初始化，否则后续所有提交步骤无法执行。

---

## 后端契约实测要点（实施前必读）

以下六条是逐份读后端源码与 `node_modules` 类型声明核实过的，与直觉相反，**不照做一定会出问题**：

| # | 事实 | 后果与应对 |
|---|---|---|
| 1 | `EventRecordService.update` 用 `BeanUtil.copyProperties(dto, upd, CopyOptions.create().setIgnoreNullValue(true))`，再走 MyBatis-Plus `updateById`（默认 `NOT_NULL` 策略） | **null 字段永远进不了 SET 子句。** 文本字段要清空必须发 `''`（发 null 被静默忽略，用户以为清了其实没清）；数字字段清空只能发 null，注定被忽略 → 前端应**拒发**并在 UI 明示「该字段不支持清空」 |
| 2 | `EventRecordDetailVO` **没有 `task` 字段**（只有 `EventRecordListVO`、`TodoVO` 有） | 详情抽屉的「事件子类」必须从 `sourceData.task` 取，读 `detail.task` 恒为 `undefined` |
| 3 | `EventRecordDetailVO.similarity` 是 `Integer`，`heightPermitted` 是 `BigDecimal` | 数字输入框 precision：`similarity` → **0**，`heightPermitted` → **2** |
| 4 | `el-input-number` 的 `modelValue` 类型是 `number \| null`（**不收 string**），emit 是 `(val: number \| undefined)` | 修正表单是 `Record<field, string \| number \| null>`，**不能 v-model**，必须 `:model-value="asNumber(form[key])"` + `@update:model-value="(v: number \| undefined) => { form[key] = v ?? null }"` |
| 5 | Vite 的 `preview` **不继承** `server.proxy` | 只配 `server.proxy` 时 `npm run preview` 的所有接口 404。proxy 要提为常量，同时挂到 `server` 与 `preview` |
| 6 | `DetectAuthenticationEntryPoint` 返回 **真 HTTP 401** + body `{code:401, msg, data:null}`；detect-event 是 OAuth2 资源服务器（`jwk-set-uri: http://localhost:8081/oauth2/jwks`） | 无效 JWT 会真的返 401，axios 拦截器的 HTTP-401 分支能触发，不需要额外判 body 里的 code |

另外三条 Element Plus 类型是**相容**的，可直接 v-model（已实测 `.d.ts`）：`el-select` 的 `modelValue` 含 `| null`；`el-date-picker` 含 `string[] | null`；`el-input` 是 `string | number | null | undefined`。`el-tag` 的 `type` 取值恰为 `"info" | "primary" | "success" | "warning" | "danger"`，可直接定义 `type TagType` 别名。

---

## File Structure

```
src/
├─ api/
│  ├─ base-url.ts                 后端路径前缀常量（/auth、/admin/event），集中一处便于网关调整
│  ├─ interceptors.ts             请求/响应拦截纯函数 + BizError，不持有 axios 实例
│  ├─ request.ts                  组装 http 实例，导出 get/post/put/del/getBlob
│  ├─ auth.ts                     login
│  ├─ dict.ts                     fetchEventEnums
│  ├─ event.ts                    事件域 9 个端点
│  └─ __tests__/{interceptors,auth,event}.test.ts
├─ components/
│  ├─ SnapImage.vue               抓拍图：null/空白/加载失败三态降级
│  ├─ StatChart.vue               ECharts 容器：注册、setOption、resize、dispose
│  ├─ EventDetailDrawer.vue       详情抽屉（右滑，含处理历史时间线）
│  ├─ EventEditDialog.vue         修正弹窗（按大类分组动态字段）
│  └─ __tests__/{SnapImage,EventDetailDrawer,EventEditDialog}.test.ts
├─ composables/
│  ├─ useEnum.ts                  code → 中文名 / tag 类型
│  ├─ useEventQuery.ts            列表筛选表单 + 分页 + 加载/删除/导出编排
│  └─ __tests__/{useEnum,useEventQuery}.test.ts
├─ constants/
│  ├─ error-code.ts               （已存在）
│  └─ dict.ts                     FALLBACK_ENUMS：后端不可达时的静态兜底字典
├─ layouts/
│  └─ BasicLayout.vue             侧栏 + 顶栏 + 面包屑 + 用户下拉
├─ models/
│  ├─ eventEditModel.ts           可修正字段清单 + toEditForm/diffEditForm/visibleGroups/asNumber（纯函数）
│  ├─ statOptions.ts              三图 ECharts option 构造（纯函数）
│  └─ __tests__/{eventEditModel,statOptions}.test.ts
├─ router/
│  └─ index.ts                    路由表（具名导出 routes 供菜单生成）+ 全局前置守卫
├─ stores/
│  ├─ auth.ts                     token/user/loading + login/logout/restore
│  ├─ dict.ts                     枚举一次性缓存 + 并发去重
│  └─ __tests__/{auth,dict}.test.ts
├─ styles/
│  ├─ index.css                   reset + 全局变量 + 通用工具类
│  ├─ layout.css                  BasicLayout 专属
│  └─ login.css                   登录页专属
├─ types/
│  └─ api.ts                      （已存在）
├─ utils/
│  ├─ token.ts                    （已存在）
│  ├─ params.ts                   cleanParams
│  ├─ format.ts                   DASH/dash/textOr/percent
│  ├─ download.ts                 导出文件名 + blob 下载 + JSON 错误体识别
│  ├─ navigate.ts                 hardNavigate/redirectToLogin
│  └─ __tests__/{params,format,download,token,navigate}.test.ts
├─ views/
│  ├─ PlaceholderView.vue         后续模块占位页（路由不指向不存在的组件）
│  ├─ login/index.vue
│  └─ event/{list.vue,statistics.vue}
├─ test/
│  └─ setup.ts                    jsdom 缺失 API 打桩 + Element Plus 全局插件
├─ App.vue
├─ env.d.ts                       （已存在）
└─ main.ts
```

**边界规则**：`models/` 与 `utils/` 是纯函数层，不得 import vue / pinia / element-plus（`el` 组件类型除外）；`api/` 不得 import `stores/`；`stores/` 不得 import `views/`。违反即为架构缺陷，评审应打回。

---

## Task 1: Vitest 测试基座与 git 初始化

**Files:**
- Modify: `package.json`（补 devDependencies 与 scripts）
- Create: `vitest.config.ts`、`src/test/setup.ts`、`src/utils/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `npm run test` / `test:watch` / `test:coverage` 三条命令；`src/test/setup.ts` 全局 setup（后续 Task 8 会追加 Element Plus 插件注册）

- [ ] **Step 0: `git init` 并提交现有脚手架**（仓库当前不是 git 仓库，跳过则后续所有提交步骤失败）

```bash
git init
git add -A
git commit -m "chore: 前端脚手架与设计规格、实施计划"
```

先确认 `.gitignore` 已忽略 `node_modules/`、`dist/`、`coverage/`；未忽略则补上再提交。

- [ ] **Step 1: 安装测试依赖**

Run: `npm i -D vitest@^2.1.8 jsdom@^25.0.1 @vue/test-utils@^2.4.6 @vitest/coverage-v8@^2.1.8`

- [ ] **Step 2: 补 scripts**

`package.json` 的 `scripts` 增加：`"test": "vitest run"`、`"test:watch": "vitest"`、`"test:coverage": "vitest run --coverage"`。保留已有的 `dev`/`build`/`preview`。

- [ ] **Step 3: 写 vitest.config.ts**

用 `mergeConfig` 复用 `vite.config.ts`（继承 `@` 别名与 `define`），覆盖项：`test.environment = 'jsdom'`、`test.globals = true`、`test.setupFiles = ['./src/test/setup.ts']`、`test.include = ['src/**/*.{test,spec}.ts']`、`test.css = false`。

- [ ] **Step 4: 写 src/test/setup.ts**

打桩 jsdom 缺失且 Element Plus / ECharts 会调用的两个 API：
- `window.matchMedia` → 返回 `{ matches: false, media: query, onchange: null, addListener/removeListener/addEventListener/removeEventListener/dispatchEvent: vi.fn() }`，用 `Object.defineProperty(window, 'matchMedia', { writable: true, value: ... })`
- `window.ResizeObserver` → 一个 `observe/unobserve/disconnect` 皆为空方法的 class

> Element Plus 的全局插件注册（`config.global.plugins = [ElementPlus]`）**留到 Task 8** 再加 —— 本阶段只测纯函数，提前引入会拖慢全部测试。

- [ ] **Step 5: 写冒烟测试**

`src/utils/__tests__/smoke.test.ts`：三条用例 —— ① `1 + 1 === 2`（框架能跑）；② `import { TOKEN_KEY } from '@/constants/error-code'` 后断言其为非空字符串（`@` 别名在测试环境生效）；③ 断言 `typeof window === 'object'`（jsdom 环境生效）。

- [ ] **Step 6: 验收**

Run: `npm run test`
Expected: PASS，1 file / 3 tests。若报 `Cannot find module '@/...'` → `mergeConfig` 没生效，检查是否 `export default mergeConfig(viteConfig, defineConfig({ test: {...} }))`。

- [ ] **Step 7: 提交**

```bash
git add package.json package-lock.json vitest.config.ts src/test src/utils/__tests__
git commit -m "test: 接入 Vitest + jsdom 测试基座"
```

---

## Task 2: utils 纯函数层

**Files:**
- Create: `src/utils/params.ts`、`src/utils/format.ts`、`src/utils/download.ts`、`src/utils/navigate.ts`
- Test: `src/utils/__tests__/{params,format,download,navigate}.test.ts`（`token.test.ts` 一并补上，覆盖已存在的 `token.ts`）

**Interfaces:**
- Consumes: `clearToken`/`clearStoredUser`（`utils/token.ts`）、`ERROR_MESSAGES`（`constants/error-code.ts`）
- Produces:
  - `cleanParams<T = Record<string, unknown>>(params: Record<string, unknown>): T`
  - `DASH: string`（`'—'`）· `dash(v: unknown): string` · `textOr(v: string | null | undefined, fallback?: string): string` · `percent(rate: number, digits?: number): string`
  - `buildExportFilename(prefix: string, format: 'xlsx' | 'csv'): string` · `isJsonBlob(blob: Blob): boolean` · `readErrorFromBlob(blob: Blob): Promise<string>` · `downloadBlob(blob: Blob, filename: string): void`
  - `hardNavigate(url: string): void` · `redirectToLogin(navigate: (url: string) => void = hardNavigate): void`

- [ ] **Step 1: 按 TDD 逐文件推进**

每个文件走「写失败测试 → 跑确认失败 → 实现 → 跑确认通过」四轮，顺序：`params` → `format` → `download` → `navigate` → `token`。测试用例清单：

| 文件 | 必测用例 |
|---|---|
| `params` | 剔除 `''`/`null`/`undefined`；**保留数字 `0` 与 `false`**（`handleStatus=0` 未处理、`priority=0` 普通是合法筛选值）；剔除纯空白串 `'   '`；入参 `undefined` 返回 `{}` |
| `format` | `dash(null/undefined/'  ')` → `—`，`dash(0)` → `'0'`；`textOr` 自定义 fallback；`percent(0.1234)` → `'12.34%'`、`percent(NaN)` → `'0.00%'`、`percent(0.5, 0)` → `'50%'` |
| `download` | 文件名匹配 `/^事件记录_\d{8}_\d{6}\.xlsx$/`；csv 后缀；`isJsonBlob` 认 `application/json;charset=UTF-8`、不认 xlsx MIME；`readErrorFromBlob` 三级兜底（取 `msg` → 查 `ERROR_MESSAGES[code]` → `'导出失败'`）；`downloadBlob` 创建 `<a download>`、click 一次、`revokeObjectURL` 被调 |
| `navigate` | `hardNavigate` 透传 `window.location.assign`；`redirectToLogin` 清 `TOKEN_KEY`+`USER_KEY` 且跳 `/login?redirect=%2Fevent%2Flist`；带 query 时一并编码；**已在 `/login` 时 redirect 归为 `%2F`**（否则登录后跳回登录页）；不传 `navigate` 时默认走 `hardNavigate` |
| `token` | 读写往返；`isTokenExpired(null)` → true；刚签发 → false；**剩余不足 30s 余量 → true**；超期 → true |

- [ ] **Step 2: 实现要点**

- `cleanParams` 的泛型 `T` 只是把「删过键的同构对象」标成调用方期望的 DTO 类型 —— 清洗不改值只删键，出入结构一致，避免每个调用点写 `as unknown as XxxQuery`（`Record<string, unknown>` 到 interface 的 `as` 会被 TS 拒，interface 无隐式索引签名）
- `redirectToLogin` 用**注入式**签名（`navigate` 参数默认 `hardNavigate`），测试直接传 spy。**不要**用 `vi.mock` / `vi.doMock` 打模块级 mock —— ESM mock 的提升顺序会让用例互相污染
- 测试里覆盖 `window.location` 用 `Object.defineProperty(window, 'location', { value: { pathname, search, assign }, writable: true, configurable: true })`，jsdom 不允许直接赋值
- 用硬跳转而非 `router.push` 清 401：一是规避 `request.ts ↔ router` 循环依赖，二是整页重载能把 Pinia 内存态（含字典缓存）一并清空
- `buildExportFilename` **刻意不解析** `Content-Disposition`：后端用 `URLEncoder`（空格变 `+`），解析有编码歧义；前端已知 `format`，自行拼时间戳名更可靠
- `downloadBlob` 必须 `document.body.removeChild(link)` + `URL.revokeObjectURL(url)`，否则重复导出会累积 DOM 节点与内存

- [ ] **Step 3: 验收**

Run: `npm run test`
Expected: PASS，6 files（smoke + params + format + download + navigate + token）全绿。

- [ ] **Step 4: 提交**

```bash
git add src/utils
git commit -m "feat: utils 纯函数层（参数清洗/格式化/文件流下载/401 跳转）+ 单测"
```

---

## Task 3: axios 请求层（拦截器 + R 拆包 + 401）

**Files:**
- Create: `src/api/interceptors.ts`、`src/api/request.ts`
- Test: `src/api/__tests__/interceptors.test.ts`

**Interfaces:**
- Consumes: `cleanParams`、`getToken`、`redirectToLogin`、`ERROR_MESSAGES`、`SUCCESS_CODE`、`readErrorFromBlob`
- Produces:
  - `class BizError extends Error { code: number; msg: string }`
  - `onRequestFulfilled(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig`
  - `onResponseFulfilled(response: AxiosResponse): unknown`
  - `onResponseRejected(error: unknown): Promise<never>`
  - `http: AxiosInstance`（`baseURL` 取 `import.meta.env.VITE_API_BASE`）
  - `get<T>(url: string, params?: Record<string, unknown>): Promise<T>` · `post<T>(url, data?): Promise<T>` · `put<T>(url, data?): Promise<T>` · `del<T>(url, data?): Promise<T>` · `getBlob(url, params?): Promise<AxiosResponse<Blob>>`

- [ ] **Step 1: 写拦截器失败测试**

12 条用例，覆盖：注入 `Authorization: Bearer <token>`；无 token 时不加该头；`config.params` 被 `cleanParams` 清洗；`code === 0` 时返回 `data` 而非整个 `R`；`code !== 0` 抛 `BizError` 且 `error.msg` 为后端 msg、同时 `ElMessage.error` 被调一次；`responseType === 'blob'` 时**原样透传整个 response**（调用方要看 headers 判断 JSON 错误体）；HTTP 401 调 `redirectToLogin` 且不弹 ElMessage（跳页前弹消息没意义）；网络错误（无 response）弹兜底文案；后端返回的 msg 优先于 `ERROR_MESSAGES` 静态表。

`ElMessage` 用 `vi.mock('element-plus', ...)` 打桩；`redirectToLogin` 同样 mock，断言被调而非真跳转。

- [ ] **Step 2: 实现要点**

- 拦截器写成**三个独立导出的纯函数**，不写在 `axios.create({ interceptors: {...} })` 的内联回调里 —— 内联回调无法单测，只能靠 mock adapter 间接测，成本高且脆
- `onResponseRejected` 判 401 用 `axios.isAxiosError(error) && error.response?.status === 401`；返回 `Promise.reject(...)` 让调用方的 catch 能拿到 `BizError`
- `request.ts` 只做三件事：`axios.create`、挂拦截器、导出五个动词函数。**不得 import `stores/` 或 `router/`**（Global Constraints）
- `getBlob` 返回 `AxiosResponse<Blob>` 而非 `Blob`，因为 Task 4 的 `exportEvents` 要用 `isJsonBlob(response.data)` 区分「文件流」与「超限 JSON 错误体」

- [ ] **Step 3: 验收**

Run: `npm run test -- interceptors`
Expected: PASS，12 tests。再 `npm run test` 确认无回归。

- [ ] **Step 4: 提交**

```bash
git add src/api
git commit -m "feat: axios 请求层（拦截器纯函数化 + R 拆包 + 401 硬跳转）"
```

---

## Task 4: API 业务模块（auth / dict / event）

**Files:**
- Create: `src/api/base-url.ts`、`src/api/auth.ts`、`src/api/dict.ts`、`src/api/event.ts`
- Test: `src/api/__tests__/{auth,event}.test.ts`

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

> `GET /event-records/{eventId}/history` 本期**不封装** —— `EventRecordDetailVO` 已内嵌 `handleHistory: HandleHistoryItem[]`，详情抽屉直接用。该独立端点属设计规格 §7 第 3 项「处理记录」，做那个模块时再加。

- [ ] **Step 1: 写失败测试**

`auth.test.ts`：登录请求体是 `URLSearchParams` 实例；`Content-Type` 为 `application/x-www-form-urlencoded`；成功返回 `access_token` 等下划线字段原样透传；HTTP 400 时抛错且 message 取 `error_description`（不是 `error`，后者是 `invalid_grant` 这种机器码）。

`event.test.ts`：`pageEvents` 走 GET 且 params 透传；`updateEvent` 走 PUT 且 URL 含 id；`batchDeleteEvents` 走 DELETE 且 body 为 `{ ids }`；`exportEvents` 拿到 xlsx blob 时调 `downloadBlob`、拿到 JSON blob 时调 `readErrorFromBlob` 并抛错、**两种情况都不弹成功提示**。

mock 方式：`vi.mock('@/api/request', ...)` 打桩五个动词函数，断言 URL / method / payload。

- [ ] **Step 2: 实现要点**

- **`login` 必须用 form 编码**：`POST /auth/oauth/token` 后端用 `@RequestParam` 接收，发 JSON 会 400。用 `new URLSearchParams({ username, password, grant_type: 'password', scope: 'server' })`，并显式设 `Content-Type: application/x-www-form-urlencoded`
- `base-url.ts` 集中 `AUTH_BASE = '/auth'`、`EVENT_BASE = '/admin/event'`，各 api 文件从这里拼路径，网关前缀若调整只改一处
- `exportEvents` 的流程：`getBlob` → `isJsonBlob(res.data)` 为真则 `readErrorFromBlob` 后抛 `BizError` → 否则 `downloadBlob(res.data, buildExportFilename('事件记录', format))`
- `deleteEvent` / `batchDeleteEvents` 的 HTTP method 与 body 形状要对照后端 controller 确认（DELETE 带 body，axios 需写 `{ data: { ids } }` 而非第二参）

- [ ] **Step 3: 验收**

Run: `npm run test -- api`
Expected: PASS，auth + event 全部用例绿。

- [ ] **Step 4: 提交**

```bash
git add src/api
git commit -m "feat: API 业务模块（auth/dict/event 共 9 个端点）+ 单测"
```

---

## Task 5: Pinia stores 与字典 composable

**Files:**
- Create: `src/constants/dict.ts`、`src/stores/auth.ts`、`src/stores/dict.ts`、`src/composables/useEnum.ts`
- Test: `src/stores/__tests__/{dict,auth}.test.ts`、`src/composables/__tests__/useEnum.test.ts`

**Interfaces:**
- Consumes: `login`（Task 4）、`fetchEventEnums`（Task 4）、`utils/token.ts`、`types/api.ts`
- Produces:
  - `useAuthStore()` — state `{ token, user, loading }`；getter `isLoggedIn`；actions `login(username: string, password: string): Promise<void>`、`logout(): void`、`restore(): void`
  - `useDictStore()` — state `{ enums: EventEnums | null, loaded: boolean, pending: Promise<void> | null }`；actions `load(force?: boolean): Promise<void>`、`labelOf(kind: keyof EventEnums, code: number | string, fallback?: string): string`、`tasksOfEventType(eventType?: number | null): TaskItem[]`、`reset(): void`
  - `useEnum()` → `{ priorityLabel, priorityTag, handleStatusLabel, handleStatusTag, pushStatusLabel }`，均为 `(code) => string` 形式；`priorityTag`/`handleStatusTag` 返回 `TagType`
    - **不提供 `taskLabel`**：子类名直接走 `dict.labelOf('task', code)`，再包一层只是重复
    - **`pushStatusLabel` 必须前端硬编码**（0 未推送 / 1 已推送）：`EventEnums` 只有 `eventType`/`task`/`handleStatus`/`priority`/`ruleType` 五项，**没有推送状态**，查不到字典
  - `type TagType = 'info' | 'primary' | 'success' | 'warning' | 'danger'`
  - `FALLBACK_ENUMS: EventEnums`（后端不可达时的静态兜底，取自接口文档 §3.1）

- [ ] **Step 1: 写失败测试**

21 条用例：
- `dict`：首次 `load()` 调 `fetchEventEnums` 一次；**并发两次 `load()` 只发一次请求**（第二次拿到同一个 in-flight promise）；`loaded` 为 true 后再 `load()` 不重发；`load(true)` 强制重发；请求失败时回落到 `FALLBACK_ENUMS` 且 `loaded` 仍为 true（不阻塞页面）；`labelOf('eventType', 200)` 与 `labelOf('task', 'license_plate')` **数字与字符串 code 混用都能查到**；未知 code 返回 fallback；`tasksOfEventType(200)` 只返车辆子类、传 null 返全量；`reset()` 后 `enums`/`loaded`/`pending` **三者全部归零**
- `auth`：`login` 成功后写入 token 与 user 到 localStorage；`restore()` 从 localStorage 恢复；`isLoggedIn` 在 token 存在且未过期时为 true；`logout()` 清 state 与 localStorage
- `useEnum`：priority 0/1/2 → 普通/重要/紧急，tag 分别 info/warning/danger；handleStatus 0/1/2/3 → 未处理/处理中/已处理/误报忽略；pushStatus 0/1 → 未推送/已推送；**两者未知 code 均兜底为「未知」+ `info`**

- [ ] **Step 2: 实现要点**

- **`pending` 放进 `state()`，不要用 `declare module 'pinia'` 扩类型** —— 后者在 `storeToRefs` 与测试里的类型推导会出偏差，且多一处全局声明污染
- `pending` 存 in-flight promise 做并发去重。Vue 的 `reactive` 对 Promise 判定为非可代理类型（`targetType = INVALID`），原样返回不加 Proxy，所以存进 state 是安全的
- `load()` 首行：`const inflight = this.pending; if (inflight && !force) return inflight`
- `labelOf` 查表统一 `String(item.code) === String(code)`（Global Constraints 的枚举 code 类型不统一）
- `auth.restore()` 要判 `isTokenExpired` —— 过期则不恢复并清掉本地凭据，避免守卫放行后第一个请求就 401
- store 里**不做 UI 提示**（不 import `ElMessage`），错误提示由拦截器统一负责，store 只负责状态

- [ ] **Step 3: 验收**

Run: `npm run test`
Expected: PASS，全部 store 与 composable 用例绿，无回归。

- [ ] **Step 4: 提交**

```bash
git add src/stores src/composables src/constants
git commit -m "feat: Pinia auth/dict store 与 useEnum（字典一次性缓存 + 并发去重）"
```

---

## Task 6: 路由、登录守卫与基础布局

**Files:**
- Create: `src/router/index.ts`、`src/layouts/BasicLayout.vue`、`src/main.ts`、`src/App.vue`、`src/styles/index.css`、`src/styles/layout.css`、`src/styles/login.css`（占位空文件，Task 7 填）、`src/views/PlaceholderView.vue`
- Create（最小占位，Task 7/9/11 替换内容）: `src/views/login/index.vue`、`src/views/event/list.vue`、`src/views/event/statistics.vue`

**Interfaces:**
- Consumes: `useAuthStore`、`useDictStore`（Task 5）
- Produces:
  - `router: Router`（默认导出）；具名导出 `routes: RouteRecordRaw[]`（供 `BasicLayout` 生成菜单）
  - 路由 meta 类型：`{ title: string; icon?: string; hidden?: boolean; public?: boolean }`
  - 路由表：`/login`（`meta.public = true`）· `/`（`BasicLayout`，`redirect: '/event/list'`，子路由 `event/list` name=`EventList`、`event/statistics` name=`EventStatistics`，另加 4 个 `hidden: true` 占位指向 `PlaceholderView`）· `/:pathMatch(.*)*` 重定向到 `/event/list`

- [ ] **Step 1: 写路由表与守卫**

守卫三条规则，顺序不可换：
1. `to.meta.public` 为真 → 直接放行
2. 未登录（`!auth.isLoggedIn`）→ `next({ path: '/login', query: { redirect: to.fullPath } })`
3. 已登录且 `to.path === '/login'` → `next('/event/list')`；否则若 `!dict.loaded` 则 `await dict.load()` 再放行（字典加载失败不阻塞，store 内部已回落 `FALLBACK_ENUMS`）

`auth.restore()` 在 `main.ts` 里 pinia 装好后调一次，守卫才能读到 localStorage 里的令牌。

4 个 `hidden` 占位路由对应设计规格 §7 的后续模块：`/handle/todo`（预警待办）、`/handle/records`（处理记录）、`/rule/list`（布控规则）、`/notification`（站内通知）。先注册但 `hidden: true`，实现完成后去掉 `hidden` 即上线。

> **刻意不启用 `keep-alive`**：跳页后列表筛选条件重置。这是决策不是缺陷 —— 缓存列表会让「看板与列表筛选条件不一致但看不出来」，排查成本高于重填一次表单。

- [ ] **Step 2: 写 BasicLayout 与样式**

- 菜单由 `routes` 中 `/` 的子路由过滤 `meta.hidden !== true` 生成，`el-menu` 的 `router` 属性开启，`index` 用完整路径
- 折叠按钮切 `collapse` ref，侧栏宽度 `210px ↔ 64px` 过渡
- 顶栏：折叠按钮 + 面包屑（`route.matched` 过滤出有 `meta.title` 的项）+ 右侧用户名下拉（唯一菜单项「退出登录」→ `auth.logout()` 后 `router.replace('/login')`）
- `styles/index.css` 放 reset、CSS 变量（`--dp-primary: #409eff`、`--dp-bg: #f5f7fa` 等）与通用工具类；`layout.css` 只放 BasicLayout 专属；`login.css` 只放登录页专属。**组件样式不写进全局 css**

- [ ] **Step 3: 验收**

Run: `npm run dev` → 浏览器开 `http://localhost:5173/`
Expected: 未登录自动跳 `/login?redirect=%2F`；登录页占位可见；`npm run build` 零类型错误；`npm run test` 无回归。

- [ ] **Step 4: 提交**

```bash
git add src/router src/layouts src/styles src/views src/main.ts src/App.vue
git commit -m "feat: 路由表、登录守卫与 BasicLayout 基础布局"
```

---

## Task 7: 登录页

**Files:**
- Modify: `src/views/login/index.vue`（替换 Task 6 的占位）、`src/styles/login.css`

**Interfaces:**
- Consumes: `useAuthStore().login`（Task 5）、`useRoute`/`useRouter`
- Produces: 可用的 `/login` 页面；`resolveRedirect(raw: unknown): string` 页面内工具函数（校验开放重定向）

- [ ] **Step 1: 实现要点**

- 字段：用户名（必填）、密码（必填，`type="password"` 且带 `show-password`，≥ 6 位）；`el-form` + `rules`，`@keyup.enter` 触发提交，`formRef.validate()` 通过才调 store
- **页面下方灰字提示默认账号 `admin / 123456`**（后端 `AuthDataInitializer` 幂等播种，方便首次登录）
- `loading` 绑定 store 的 `loading`，登录中按钮 loading + 禁用防重复提交
- 登录成功后 `router.replace(resolveRedirect(route.query.redirect))`，用 `replace` 而非 `push`（不留历史记录，避免后退回到登录页）
- **`resolveRedirect` 必须防开放重定向**：只接受以单个 `/` 开头的字符串（`typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')`），否则回落 `/event/list`。不校验的话 `?redirect=https://evil.com` 会变成钓鱼跳板
- 登录失败：store 抛错后页面 `catch` 里**不再弹提示**（拦截器已弹出后端 `error_description`），只把 `loading` 复位并选中密码框
- 视觉：居中卡片，左侧品牌区（渐变底 + 产品名）右侧表单，`login.css` 控制；移动端（`<768px`）隐藏品牌区

- [ ] **Step 2: 真实联调清单（10 项，逐项记录实际结果）**

前置：`docker compose up -d` 起 MySQL/Redis/Nacos/MinIO，启 gateway(9999)、auth(8081)、event(8082)，`npm run dev`。

1. `admin` / `123456` 登录成功，跳 `/event/list`，侧栏与用户名可见
2. 错误密码 → 弹出「用户名或密码错误」（后端 `error_description`），停留登录页
3. 空用户名点登录 → 表单校验拦截，不发请求（Network 面板无 `/oauth/token`）
4. 密码框回车 → 等价于点登录
5. 连点登录按钮 → 只发一次请求
6. 登录后刷新页面 → 仍是登录态（`restore()` 生效）
7. 未登录直接访问 `/event/list` → 跳 `/login?redirect=%2Fevent%2Flist`，登录后回到列表页
8. 已登录访问 `/login` → 自动跳 `/event/list`
9. 手改 URL 为 `/login?redirect=//evil.com` 登录后 → 落到 `/event/list`，**不外跳**
10. 退出登录 → 回登录页，`localStorage` 的 `detect_access_token` 与 `detect_login_user` 均已清除，后退按钮回不到列表页

> 若只启了 auth + event 没启网关：把 `VITE_PROXY_TARGET` 指向 8082，登录地址临时改直连 8081（生产不存在此问题）。

- [ ] **Step 3: 验收**

Run: `npm run build`
Expected: 零错误。上述 10 项联调**逐项记录实际通过/失败**，失败项当场修，不得记「预期通过」。

- [ ] **Step 4: 提交**

```bash
git add src/views/login src/styles/login.css
git commit -m "feat: 登录页（form 编码提交 + 开放重定向防护）"
```

---

## Task 8: SnapImage 抓拍图组件

**Files:**
- Create: `src/components/SnapImage.vue`
- Modify: `src/test/setup.ts`（追加 `config.global.plugins = [ElementPlus]`）
- Test: `src/components/__tests__/SnapImage.test.ts`

**Interfaces:**
- Consumes: Element Plus 全局组件（`el-image`、`el-icon`）
- Produces: `<SnapImage :src="string | null" :width="number" :height="number" :preview="boolean" />`
  - props 默认值：`src = null`、`width = 60`、`height = 40`、`preview = false`
  - `src` 为 `null`/空白 → 渲染「无抓拍图」占位，**不渲染 `img`**
  - 加载失败（MinIO 私有桶返 403）→ 图片图标 + 「图片不可访问」占位，**不抛全局错误**
  - `preview = true` → `el-image` 的 `preview-src-list` 支持点击放大

- [ ] **Step 1: 给单测环境注入 Element Plus**

在 `src/test/setup.ts` 末尾追加 `config.global.plugins = [ElementPlus]`（`config` 来自 `@vue/test-utils`）。**不引入 Element Plus 的 CSS** —— jsdom 不做视觉渲染，引入只会拖慢全部测试。

- [ ] **Step 2: 写失败测试（6 条）**

① `src = null` 时渲染「无抓拍图」且 DOM 中无 `img`；② `src = '   '` 同样走占位；③ 正常 `src` 时渲染 `el-image` 且 `src` 属性透传；④ `preview = true` 时 `preview-src-list` 含该 src；⑤ `width`/`height` 反映到样式；⑥ 触发 `error` 事件后显示「图片不可访问」而非「无抓拍图」（两个占位语义不同，前者是「有图但取不到」，后者是「本来就没图」）。

- [ ] **Step 3: 实现要点**

- 用 `el-image` 的 `#error` 与 `#placeholder` 具名插槽做降级，不要自己写 `@error` + `img` —— `el-image` 已处理懒加载与预览
- 两个占位分支**文案必须区分**：MinIO 私有桶未配匿名读策略时全列表都是 403，若统一显示「无抓拍图」，运维会误判成「后端没存图」而查错方向
- 占位容器固定 `width × height`，避免图片缺失时表格行高跳动

- [ ] **Step 4: 验收**

Run: `npm run test -- SnapImage`
Expected: PASS，6 tests。再 `npm run test` 确认注入 Element Plus 后**已有纯函数测试没有变慢或失败**。

- [ ] **Step 5: 提交**

```bash
git add src/components src/test
git commit -m "feat: SnapImage 抓拍图组件（无图/403 双态降级）+ 单测"
```

---

## Task 9: 事件列表页（筛选 / 分页 / 批量删 / 导出）

**Files:**
- Create: `src/composables/useEventQuery.ts`、`src/components/EventDetailDrawer.vue`（**空壳**，Task 10 填内部）、`src/components/EventEditDialog.vue`（**空壳**，Task 10 填内部）
- Modify: `src/views/event/list.vue`（替换占位）
- Test: `src/composables/__tests__/useEventQuery.test.ts`

**Interfaces:**
- Consumes: `pageEvents`/`deleteEvent`/`batchDeleteEvents`/`exportEvents`（Task 4）、`useDictStore`/`useEnum`（Task 5）、`cleanParams`（Task 2）、`SnapImage`（Task 8）
- Produces:
  ```ts
  interface EventFilterForm {
    deviceNum: string; eventType: number | null; task: string | null
    handleStatus: number | null; priority: number | null
    plateNum: string; keyword: string; dateRange: [string, string] | null
  }
  const DEFAULT_PAGE_SIZE = 20
  function useEventQuery(): {
    form: Ref<EventFilterForm>; page: Ref<number>; size: Ref<number>; total: Ref<number>
    rows: Ref<EventRecordItem[]>; selection: Ref<EventRecordItem[]>
    loading: Ref<boolean>; exporting: Ref<boolean>; taskOptions: ComputedRef<TaskItem[]>
    toQuery(withPaging?: boolean): EventQuery
    load(): Promise<void>; search(): void; resetForm(): void; onEventTypeChange(): void
    onPageChange(n: number): void; onSizeChange(n: number): void
    onSelectionChange(rows: EventRecordItem[]): void
    removeOne(id: number): Promise<boolean>; removeMany(ids: number[]): Promise<boolean>
    exportAs(format: 'xlsx' | 'csv'): Promise<boolean>
  }
  ```
- 两个契约壳（**Task 10 只换内部实现，签名不得变**）：
  - `EventDetailDrawer`：props `{ modelValue: boolean; eventId: number | null }`，emits `update:modelValue` / `edited`，`defineExpose({ reload })`
  - `EventEditDialog`：props `{ modelValue: boolean; eventId: number | null }`，emits `update:modelValue` / `saved`

- [ ] **Step 1: 写 useEventQuery 失败测试（16 条）**

覆盖：`toQuery()` 用 `cleanParams<EventQuery>` 后**保留 `handleStatus = 0` 与 `priority = 0`**、剔除空串；`toQuery(false)` 不含 `current`/`size`；`dateRange` 拆成 `startTime`/`endTime`，为 null 时两键都不出现；`search()` 把 `page` 归 1 再 `load()`；`onEventTypeChange()` **清空 `task`**（大类换了，旧子类必然无效）；`taskOptions` 随 `eventType` 联动过滤；`load()` 成功后写入 `rows`/`total`；`load()` 失败后 **`rows` 清空**且不重复弹提示（拦截器已弹）；`onPageChange`/`onSizeChange` 更新后触发 `load()`，`onSizeChange` 额外把 `page` 归 1；`removeOne()` 成功返 true 并重载；**删掉非首页的最后一条时 `page -= 1` 再 load**（否则会停在空白页）；`removeMany()` 传选中 id 数组、成功后清 `selection`；`exportAs()` 用 `toQuery(false)` 且期间 `exporting` 为 true、结束复位；`resetForm()` 恢复全部默认值并重载。

> 测试里 mock `@/api/event` 用 `vi.hoisted()` 拿到桩引用 —— 直接 `vi.mock` 后再 `import` 的写法会踩 ESM 的 TDZ（暂时性死区）。

- [ ] **Step 2: 写列表页**

- 筛选区 `el-form inline` 两行，右侧「查询 / 重置」：设备编号（input）、事件大类（select）、事件子类（select，选项由 `taskOptions` 联动）、处理状态（select）、优先级（select）、车牌号（input，模糊）、关键词（input，车牌 OR 设备名）、抓拍时间（`el-date-picker type="datetimerange"`，`value-format="YYYY-MM-DD HH:mm:ss"`）
- **所有下拉 `clearable` 且 `placeholder="全部"`**（清空后值为 `''` 或 `null`，由 `cleanParams` 剔除，不会发出 `?eventType=` 让后端 Integer 绑定 400）
- 工具栏：导出（`el-dropdown`：导出 Excel / 导出 CSV，**带当前筛选条件**）、批量删除（选中 0 条时禁用）
- 表格 12 列（`el-table`，多选列 + 固定操作列，`stripe`，`v-loading="loading"`）：

| 列 | 字段 | 呈现 |
|---|---|---|
| 勾选 | — | `type="selection"` |
| 抓拍图 | `snapUrl` | `SnapImage` 60×40，`preview` 点击放大 |
| ID | `id` | 文本 |
| 设备 | `deviceName` / `deviceNum` | **两行**：名称 + 灰色小字编号；名称为空只显示编号 |
| 事件类型 | `eventTypeName` / `task` | **两行**：大类 + 子类中文名（`dict.labelOf('task', ...)` 翻译，字典缺失时显 code） |
| 车牌 | `plateNum` | 空显 `—`（`textOr`） |
| 车型 | `vehicleNormalType` | 空显 `—` |
| 人数 | `crowdNum` | 空显 `—` |
| 抓拍时间 | `snapTime` | 后端已格式化，直出 |
| 优先级 | `priority` | `el-tag` 按 `priorityTag`（0 info 普通 / 1 warning 重要 / 2 danger 紧急），`effect="light"` |
| 处理状态 | `handleStatus` | `el-tag` 按 `handleStatusTag`（0 info 未处理 / 1 primary 处理中 / 2 success 已处理 / 3 误报忽略） |
| 命中规则 | `hitRuleId` | 有值显「已命中 #id」小标签，无值显 `—` |
| 操作 | — | 详情 / 修正 / 删除（**`el-popconfirm` 二次确认**，固定右侧） |

- **表头不设 `sortable`**：后端固定 `snap_time DESC`，前端排序是假的，设了会误导用户
- 批量删除用 `ElMessageBox.confirm`（跨行操作要重确认，文案带条数）；**单行删除用 `el-popconfirm`**（就地轻确认，不打断视线）
- 分页 `el-pagination`：`layout="total, sizes, prev, pager, next, jumper"`，`page-sizes=[10,20,50,100]`，默认 size 取 **`DEFAULT_PAGE_SIZE`**（不要写裸 20）
- `el-table` 的 `@selection-change` 绑 **`onSelectionChange`**，`@row-click` 开详情抽屉；抽屉 emit `edited` 后重新 `load()`（修正可能改了列表可见字段）；空态用 `el-table` 默认「暂无数据」
- `el-select` 的 `modelValue` 含 `| null`，`number | null` **可直接 v-model**（已实测类型，不需 `as` 或包装 ref）

- [ ] **Step 3: 真实联调清单（8 项筛选逐个验）**

用库里真实数据（如 `id=1`、`id=8`）逐项确认：① 无条件加载出分页数据、`total` 正确；② 设备编号精确匹配；③ 大类筛选生效且子类下拉联动收窄；④ 处理状态选「未处理」（`code=0`）**能查出数据**（验证 `cleanParams` 没把 0 剔掉）；⑤ 优先级选「普通」（`code=0`）同上；⑥ 车牌模糊匹配；⑦ 关键词命中车牌或设备名；⑧ 时间区间两端闭合。再验：单条删除、批量删除、导出 xlsx 与 csv 落盘可用 Excel 打开、翻页与改每页条数。

> 筛选生效的判据不能只看「表格变了」—— 要开 Network 面板确认 query string 里**该带的参数带上了、该省的空参数没带**。`handleStatus=0` 这一项尤其要看，它是 `cleanParams` 最容易写错的地方。

- [ ] **Step 4: 验收**

Run: `npm run test -- useEventQuery` → PASS 16 tests；`npm run build` → 零错误；联调 8 项逐项记录实际结果。

- [ ] **Step 5: 提交**

```bash
git add src/composables src/views/event src/components
git commit -m "feat: 事件列表页（8 项筛选 + 分页 + 批量删除 + 导出）"
```

---

## Task 10: 详情抽屉与修正弹窗

**Files:**
- Create: `src/models/eventEditModel.ts`
- Modify: `src/components/EventDetailDrawer.vue`、`src/components/EventEditDialog.vue`（替换 Task 9 的空壳，**props/emits 签名不变**）
- Test: `src/models/__tests__/eventEditModel.test.ts`、`src/components/__tests__/{EventDetailDrawer,EventEditDialog}.test.ts`

**Interfaces:**
- Consumes: `getEventDetail`/`updateEvent`（Task 4）、`useEnum`（Task 5，用 `pushStatusLabel`）、`dict.labelOf`（Task 5，子类名与处理历史的状态名）、`SnapImage`（Task 8）、`textOr`/`dash`（Task 2）
- Produces:
  ```ts
  type EditableField = keyof EventRecordUpdate
  /**
   * 用 Record 而非 Required<EventRecordUpdate>：后者每键类型不同（string|null vs number|null），
   * 以联合键写入时 TS 要求值属于所有属性类型的交集（= null），模板里根本赋不进去。
   */
  type EditForm = Record<EditableField, string | number | null>
  interface FieldMeta {
    key: EditableField; label: string; kind: 'input' | 'number'
    min?: number; max?: number; precision?: number; maxlength?: number; placeholder?: string
  }
  interface FieldGroup { key: 'common' | 'vehicle' | 'face'; title: string; eventTypes: number[] | null; fields: FieldMeta[] }
  const EDIT_GROUPS: FieldGroup[]            // common(1) + vehicle(8) + face(6) = 15 个可修正字段
  const EDITABLE_FIELDS: FieldMeta[]         // EDIT_GROUPS.flatMap(g => g.fields)
  function visibleGroups(eventType: number | null | undefined): FieldGroup[]
  function toEditForm(detail: EventRecordDetail): EditForm
  function emptyEditForm(): EditForm
  interface EditDiff { patch: EventRecordUpdate; ignored: string[] }
  function diffEditForm(source: EventRecordDetail, form: EditForm): EditDiff
  function asNumber(value: string | number | null | undefined): number | null
  ```

- [ ] **Step 1: 写 eventEditModel 失败测试（14 条）**

覆盖：`EDITABLE_FIELDS` 长度 15 且 key 无重复；`visibleGroups(200)` 返 common + vehicle、`visibleGroups(100)` 返 common + face、`visibleGroups(300)` 只返 common、`visibleGroups(null)` 只返 common；`toEditForm` 把 detail 的 15 个字段搬进 form、缺失键补 null；`emptyEditForm` 全 null；`diffEditForm` **未改动的字段不进 patch**；改了的进 patch；**文本字段清空 → patch 里是 `''` 而非 null**；**数字字段清空 → 不进 patch，且字段 label 进 `ignored`**；前后都是空白（`'  '` vs `''`）视为未改；数字 `5` 与 `'5'` 视为相同（`normalize` 后比较）；`asNumber` 对 `''`/`null`/`undefined`/`NaN` 返 null、对 `'12'` 返 `12`。

- [ ] **Step 2: 实现 diffEditForm（对应后端 `setIgnoreNullValue(true)`）**

```ts
for (const meta of EDITABLE_FIELDS) {
  const next = normalize(form[meta.key], meta.kind)
  const prev = normalize(source[meta.key], meta.kind)
  if (next === prev) continue
  if (meta.kind === 'number' && next === null) { ignored.push(meta.label); continue }
  bag[meta.key] = next
}
```

`normalize` 按 `kind` 分派：`input` → `typeof v === 'string' ? v.trim() : (v == null ? '' : String(v))`；`number` → `asNumber(v)`。

- [ ] **Step 3: 写详情抽屉**

- `el-drawer` **`size="720px"`**，右侧滑出；打开时按 `eventId` 调 `getEventDetail`，`v-loading` 覆盖；**返回 `1001`（事件不存在，可能已被他人删除）时提示并关闭抽屉**，不留一个空白抽屉在那
- 内容分七区（`el-descriptions` 2 列，所有可能为 null 的字段过 `textOr()`，**不留空白行**）：
  1. **头部**：事件 ID + 大类标签 + 优先级标签 + 处理状态标签 + 抓拍时间
  2. **抓拍图**：`SnapImage` 大图（`preview` 支持点击放大）
  3. **基础信息**：设备名称、设备编号、事件大类、**事件子类**（见下）、推送状态（**`pushStatusLabel(status)`**）、命中规则（`hitRule.ruleName` + `ruleType`，`hitRule` 为 null 时显「未命中」）
  4. **业务字段**（按 `eventType` 动态渲染）：200 车辆 → 车牌号、特殊车辆类别 code、车辆类别、品牌、子品牌、颜色、年款、限高；100 人脸 → 姓名、身份证号、库名称、相似度、库底图、可见光图；300 聚集 → 聚集人数
  5. **检测元数据**：`sourceData` 用 `<pre>` 展示 `JSON.stringify(v, null, 2)`；**后端解析失败回退为字符串时原样展示**（不要对字符串调 `JSON.stringify`，会多一层引号与转义）
  6. **处理历史**（`el-timeline`）：直接用详情 VO 内嵌的 `handleHistory[]`（**不另请 history 端点**），每项显示 `handleTime` + `handlerName` + `toStatus` 中文名（`dict.labelOf('handleStatus', toStatus)`）+ `handleRemark`；空数组显示「暂无处理记录」
  7. **底部操作**：修正（打开 `EventEditDialog`）、关闭
- **`taskCode` 必须从 `sourceData.task` 取**（后端事实 #2）：
  ```ts
  const taskCode = computed<string | null>(() => {
    const raw = detail.value?.sourceData
    if (raw && typeof raw === 'object') {
      const value = (raw as Record<string, unknown>).task
      if (typeof value === 'string' && value !== '') return value
    }
    return null
  })
  ```
  再用 `dict.labelOf('task', taskCode)` 转中文名
- `defineExpose({ reload })` 供列表页在保存后刷新
- `watch(() => props.eventId)` 变化时重新拉取；`modelValue` 关到 false 时清空 `detail`（避免下次打开闪现上一条）

- [ ] **Step 4: 写修正弹窗**

- `el-dialog` **`width="640px"`**，`el-form` 2 列布局（`label-width="110px"`），标题带事件 id；打开时 `toEditForm(detail)` 填充快照
- 按 `visibleGroups(detail.eventType)` 分组渲染 `el-divider` + 字段；`FieldMeta` 的约束值照 spec §4.4 写死：`crowdNum` `min=0`；`plateNum` `maxlength=32`；`vehicleType` 数字无小数；`heightPermitted` `precision=2`（后端 `BigDecimal`）；`similarity` `min=0` `max=100` **`precision=0`**（后端 `Integer`，事实 #3）；`identifyFaceUrl`/`visibleLightUrl` 为文本 URL 输入
- **数字控件不能用 v-model**（后端事实 #4）：
  ```vue
  <el-input-number
    v-if="meta.kind === 'number'"
    :model-value="asNumber(form[meta.key])"
    :min="meta.min" :max="meta.max" :precision="meta.precision"
    :controls="false" class="edit__control"
    @update:model-value="(val: number | undefined) => { form[meta.key] = val ?? null }"
  />
  <el-input v-else v-model="form[meta.key]" :maxlength="meta.maxlength" clearable />
  ```
  `el-input-number` 的 `modelValue` 不收 `string`，emit 是 `number | undefined`，所以必须走 `:model-value` + `@update:model-value` 而非 v-model；其余数字/文本控件的 `min`/`max`/`precision`/`maxlength` 一律从 `FieldMeta` 读，不在模板里写死
- **保存按钮在 `patch` 为空时 `disabled`**（用 `computed` 实时算 `diffEditForm` 的结果驱动），这是首要交互；`ElMessage.info` 只是兜底
- 保存流程：`diffEditForm(detail, form)` → `patch` 为空则**不发请求**（按钮已禁用，程序化调用时补 `ElMessage.info('没有需要保存的改动')`）→ `ignored` 非空则 `ElMessageBox.confirm` 列出「以下数字字段不支持清空，将被忽略：xxx」让用户确认或取消 → 确认后 `updateEvent(id, patch)` → 成功 `ElMessage.success('修正成功')` + emit `saved` + 关闭 + 刷新列表；返回 **`1001` 提示「事件不存在」**并关闭弹窗
- `handleStatus` **不在可修正字段里**（`EventRecordUpdate` DTO 没有它，状态流转是 §7 第 2 项的独立端点）

- [ ] **Step 5: 真实联调清单（14 项，含 DB 校验）**

修正一条真实记录（如 `id=8`），逐项确认：① 抽屉打开显示全部分区；② 子类名正确显示（验证 `sourceData.task` 路径）；③ `similarity` 输入框无小数位；④ 改 `vehicleColor` 为「红色」保存 → 提示成功、抽屉与列表同步刷新；⑤ **DB 校验**：`docker exec -it detect-mysql mysql -uroot -proot detect_event -e "SELECT HEX(vehicle_color) FROM event_records WHERE id=8;"` 应得 `E7BAA2E889B2`（「红色」的 UTF-8 hex，验证没写坏编码）；⑥ 把 `plateNum` 清空保存 → DB 里确实是空串而非旧值（验证发的是 `''`）；⑦ 把 `crowdNum` 清空保存 → 弹出「不支持清空」确认框，取消后 DB 值未变；⑧ 不改任何字段点保存 → 提示「没有需要保存的改动」且无 PUT 请求；⑨ 只改一个字段 → Network 里 PUT body **只含该字段**；⑩ 车辆事件看不到人脸字段组；⑪ 人脸事件看不到车辆字段组；⑫ 处理历史时间线有数据；⑬ 抓拍图能放大预览；⑭ 关闭再打开另一条记录 → 不闪现上一条内容。

还原测试数据：
```sql
UPDATE event_records SET vehicle_color='蓝色', plate_num='浙C6B5P8' WHERE id=8;
```

- [ ] **Step 6: 验收**

Run: `npm run test -- eventEditModel` → PASS 14 tests；`npm run test` 全绿；`npm run build` 零错误；联调 14 项逐项记录实际结果（**⑤⑥⑦⑨ 四项必须贴出实际观察到的 DB 值或请求体**）。

- [ ] **Step 7: 提交**

```bash
git add src/models src/components
git commit -m "feat: 事件详情抽屉与修正弹窗（diff 只发改动项 + 数字字段清空拦截）"
```

---

## Task 11: 数据看板（统计卡 + ECharts 三图）

**Files:**
- Create: `src/models/statOptions.ts`、`src/components/StatChart.vue`
- Modify: `src/views/event/statistics.vue`（替换占位）
- Test: `src/models/__tests__/statOptions.test.ts`

**Interfaces:**
- Consumes: `getEventStatistics`（Task 4）、`percent`（Task 2）、`EventStat` 类型
- Produces:
  ```ts
  type StatChartOption = ComposeOption<
    PieSeriesOption | BarSeriesOption | LineSeriesOption |
    TitleComponentOption | TooltipComponentOption | LegendComponentOption |
    GridComponentOption | DataZoomComponentOption>
  function pieOption(stat: EventStat): StatChartOption
  function taskBarOption(stat: EventStat): StatChartOption
  function dailyLineOption(stat: EventStat): StatChartOption
  function countOfEventType(stat: EventStat, code: number): number
  ```
  `<StatChart :option="StatChartOption" :height="string" />`

- [ ] **Step 1: 写 statOptions 失败测试（11 条）**

`ComposeOption` 是宽联合类型，测试里用两个 helper 抹平后再断言：`firstSeries(option): Record<string, unknown>` 取 `option.series[0]`，`categoryAxis(option): { data: string[] }` 取 `option.xAxis`/`yAxis` 中 `type === 'category'` 的那个。

覆盖：`pieOption` 的 series 是 `type: 'pie'` 且 `radius` 为 `['42%','68%']`（环形）、data 由 `byEventType` 映射为 `{ name, value }`；`byEventType` 为空时 data 为空数组而非报错；`taskBarOption` 的 **category 轴 data 是 `[...byTask].reverse()` 后的名字**（横向柱状图 y 轴自下而上，反转才能让最大值在顶部）、name 取 `item.name || item.task`（后端 `name` 可能为 null）；`dailyLineOption` 的 `smooth: true`、有 `areaStyle`、`dataZoom` 含 `inside` 与 `slider` 两项、**`showSymbol` 在 `byDay.length <= 40` 时为 true、超过时为 false**（点太密会糊成一片）；`countOfEventType` 命中返 count、未命中返 0。

- [ ] **Step 2: 写 StatChart.vue**

- **按需引入并模块级注册**（幂等，多次 import 只注册一次）：
  ```ts
  import * as echarts from 'echarts/core'
  import { BarChart, LineChart, PieChart } from 'echarts/charts'
  import {
    AxisPointerComponent, DataZoomComponent, GridComponent,
    LegendComponent, TitleComponent, TooltipComponent
  } from 'echarts/components'
  import { CanvasRenderer } from 'echarts/renderers'
  echarts.use([BarChart, LineChart, PieChart, AxisPointerComponent, DataZoomComponent,
               GridComponent, LegendComponent, TitleComponent, TooltipComponent, CanvasRenderer])
  ```
  **`AxisPointerComponent` 必须显式注册** —— 缺了它 `tooltip.axisPointer.type = 'shadow'` 会静默退化成无阴影指示器，不报错，只是效果不对，很难查
- 实例存 `shallowRef`：深层 reactive 代理会让每次 `setOption` 慢一个数量级（ECharts 实例内部有大量循环引用结构）
- `watch(() => props.option, (opt) => chart.value?.setOption(opt, true))`，**不用 `deep: true`**（option 每次都是新对象，浅比较足够；deep 会遍历整个 option 树）
- `setOption(option, true)` 第二参 `notMerge = true`：数据从 12 天变成 5 天时，不 notMerge 会残留旧点
- 容器 `resize`：`window.addEventListener('resize', handler)`，`onBeforeUnmount` 里移除监听并 `chart.dispose()`（否则路由切走后实例泄漏，反复进出看板会累积）
- **`total === 0` 时三图区域统一显示 `el-empty` 描述「所选条件下暂无数据」**，而不是渲染三个空坐标轴（StatChart 内部也各自兜底一次，防单图为空）

- [ ] **Step 3: 写看板页**

- 顶部筛选：时间范围（`el-date-picker type="daterange"`，`value-format="YYYY-MM-DD HH:mm:ss"`，起止补 `00:00:00` / `23:59:59`）+ 设备编号 + 查询/重置
- 四张统计卡（`el-card` 栅格一行 4 列），**顺序照 spec §4.5**：事件总量 `total`、车辆事件数（`countOfEventType(stat, 200)`）、聚集事件数（`300`）、人脸事件数（`100`）；后三张从 `byEventType` 按 code 取，**缺失为 0**；卡片下方小字显示占比（`percent(count / total)`，`total` 为 0 时显示 `—` 而不是 `NaN%`）
- 三张图（各占一个 `el-card`）：事件大类占比（饼，`height="320px"`）、事件子类分布（横向柱，`height="360px"`）、每日趋势（折线，`height="320px"`）
- `loading` 覆盖整个看板；请求失败时卡片与图表显示空态，不白屏

- [ ] **Step 4: 真实联调清单（6 项）**

① 无条件加载 → 三图都有数据、四卡数字与 `total` 自洽（三个子类数之和 ≤ total）；② 选近 7 天 → 折线图只有 7 个点；③ 选一个无数据的区间 → 三图显示空态、卡片显示 0 与 `—`（不是 `NaN%`）；④ 横向柱状图**最大值在顶部**；⑤ 折线图 `dataZoom` 滑块可拖动且图随之缩放；⑥ 切到列表页再切回来 → 图表正常重绘、控制台无 ECharts 警告（验证 `dispose` 生效）。

- [ ] **Step 5: 验收**

Run: `npm run test -- statOptions` → PASS 11 tests；`npm run build` 零错误；**检查 chunk 体积**：ECharts 按需引入后 `dist/assets` 里 echarts 相关 chunk 应显著小于全量引入（全量约 1MB+）。若超过 500KB，检查是否误从 `'echarts'` 根入口 import 了。

- [ ] **Step 6: 提交**

```bash
git add src/models src/components src/views/event
git commit -m "feat: 数据看板（统计卡 + ECharts 饼/横向柱/折线三图，按需引入）"
```

---

## Task 12: 端到端回归与生产构建验证

**Files:**
- Modify: `vite.config.ts`（proxy 提为常量，同时挂 `server` 与 `preview`）

**Interfaces:**
- Consumes: 前 11 个 Task 的全部产出
- Produces: 可本地验证的生产包；一份实测数据（测试总数、chunk 体积、逐项通过情况）供 Task 13 引用

- [ ] **Step 1: 修 vite.config.ts**

把 proxy 对象提为顶层常量，`server.proxy` 与 `preview.proxy` 都指向它，并补 `preview: { host: true, port: 4173 }`（后端事实 #5）。代理规则：`'/api'` → `{ target: env.VITE_PROXY_TARGET, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') }`。

- [ ] **Step 2: 全量单测**

Run: `npm run test:coverage`
Expected: 全绿，**记下实际测试文件数与用例总数**（Task 13 要写进日志）。覆盖率不作硬性门槛，但 `utils/`、`models/`、`api/interceptors.ts` 三个纯函数层应接近 100%。

- [ ] **Step 3: 生产构建**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 零类型错误、Vite 构建成功。**记下最大 chunk 的体积**与是否有 `> 500 kB` 警告。

- [ ] **Step 4: preview 冒烟**

Run: `npm run preview` → 开 `http://localhost:4173/`
逐项确认：① 登录成功（**验证 preview 的 proxy 生效**，这一步失败就是 Step 1 没做对）；② 列表加载出数据；③ 详情抽屉能打开；④ 看板三图能渲染。

- [ ] **Step 5: 401 两条路径**

- **路径 A（令牌被篡改）**：登录后在 Console 执行 `localStorage.setItem('detect_access_token', 'aaa.bbb.ccc')`，刷新页面 → 守卫读到的令牌未过期会放行，首个接口返 401 → 应清凭据并跳 `/login?redirect=<当前路径>`，且**不弹多余错误提示**
- **路径 B（令牌自然过期）**：Console 执行
  ```js
  const u = JSON.parse(localStorage.getItem('detect_login_user'))
  u.expiresIn = 1
  localStorage.setItem('detect_login_user', JSON.stringify(u))
  ```
  等 2 秒后刷新 → `isTokenExpired` 的 30s 余量判定生效，守卫直接拦到登录页，**不发任何接口请求**（Network 面板确认）

两条路径都必须验证「跳登录后重新登录能回到原页面」。

- [ ] **Step 6: 跳页一致性（4 项）**

| # | 操作 | 期望 |
|---|---|---|
| 1 | 列表页设好筛选 → 跳看板 → 跳回列表 | 筛选**已重置**为默认（无 keep-alive，Task 6 的刻意决策），第一页数据正常 |
| 2 | 列表页翻到第 3 页 → 打开详情抽屉 → 关闭 | 仍在第 3 页，不跳回第 1 页 |
| 3 | 勾选 3 条 → 打开详情 → 关闭 | 勾选状态保留 |
| 4 | 修正一条记录并保存 | 列表该行数据已更新，**且分页位置未变** |

- [ ] **Step 7: 提交**

```bash
git add vite.config.ts
git commit -m "fix: vite preview 补上 /api 代理，使生产包可本地联调"
```

> Step 2~6 的**实测结果**（测试数、chunk 体积、逐项通过/失败）先记在草稿里，Task 13 写实施日志时直接引用。**不得写「预期通过」充数。**

---

## Task 13: 文档收尾（README + 实施日志）

**Files:**
- Create: `README.md`、`docs/IMPLEMENTATION_LOG.md`

**Interfaces:**
- Consumes: Task 7/9/10/11/12 的实测记录、设计规格 §7 的未完成模块清单
- Produces: 两份可交接的文档

- [ ] **Step 1: 写 README.md（8 小节）**

1. **项目简介** —— 一句话说明是什么、本期覆盖哪些页面
2. **环境要求** —— Node ≥ 18、后端网关 9999 需运行、依赖的中间件（MySQL 3307 / Redis / Nacos / MinIO）与容器名
3. **快速开始** —— `npm install` → 配 `.env.development` → `npm run dev` → `admin/123456` 登录；测试 `npm run test`；构建 `npm run build`；本地验生产包 `npm run preview`
4. **环境变量** —— `VITE_API_BASE`、`VITE_PROXY_TARGET` 各自的作用与取值，以及「只启了 auth+event 没启网关」时的临时改法
5. **目录结构** —— 照抄本计划的 File Structure 树 + 单向分层规则与三条边界禁令
6. **本期已实现** —— 三个页面的功能点清单，逐条对应实际做完的
7. **未完成模块** —— 与 `IMPLEMENTATION_LOG.md` 的清单一致，此处放简表 + 指向日志的链接
8. **生产部署** —— Nginx 反代配置样例（`location /api/ { proxy_pass http://<gateway>:9999/; }`，注意结尾斜杠决定前缀是否被吃掉）、`dist/` 静态托管、history 路由需配 `try_files $uri $uri/ /index.html`

- [ ] **Step 2: 写 docs/IMPLEMENTATION_LOG.md**

四个部分：

**① 实施概览** —— 起止日期、13 个 Task 的完成状态表、最终测试文件数与用例总数（Task 12 Step 2 实测值）、`npm run build` 结果与最大 chunk 体积（Task 12 Step 3 实测值）。

**② 逐项验证实测记录** —— 把 Task 7 的 10 项、Task 9 的 8 项、Task 10 的 14 项、Task 11 的 6 项、Task 12 的 401 两路径与跳页一致性 4 项，**逐条填实际结果**（通过 / 失败并说明如何修的）。表格列：`# | 验证项 | 结果 | 备注`。

> 硬性要求：**任何一行都不得写「预期通过」「应该没问题」**。当时没验的写「未验证 + 原因」。这份日志的价值全在「实测」二字，编造的验证记录比没有记录更糟。

**③ 未完成模块清单** —— 照抄设计规格 §7 的 10 项，**补一列「本期未做的原因」**：

| # | 模块 | 路由 | 依赖端点 | 备注 | 本期未做的原因 |
|---|---|---|---|---|---|
| 1 | 预警待办 | `/handle/todo` | `GET /alert-handles/todo` | 紧急置顶，含 `hitRuleName` | 用户选定本期范围为「登录 + 事件管理」 |
| 2 | 状态流转 | 待办页内弹窗 | `POST /alert-handles/process`、`/batch-process` | 须按 §5.2 矩阵禁用非法目标状态（0→{1,3}、1→{2,3}、2/3 终态）；`3001` 提示后端 msg；批量结果展示 `{processed, skipped[]}` | 同上；且状态机矩阵需独立设计评审 |
| 3 | 处理记录 | `/handle/records` | `GET /alert-handles/records`、`/{eventId}/history` | 按 `handle_time DESC` | 同上（详情的历史时间线已复用 `/{eventId}/history`） |
| 4 | 处理效率统计 | 并入看板 | `GET /alert-handles/statistics` | 5 指标：待处理/处理中/今日已解决/误报率/平均处理分钟 | 同上；看板已预留卡片位 |
| 5 | 布控规则管理 | `/rule/list` | `/alert-rules` 全 7 端点 | 需按 `ruleType` 动态渲染 `matchConfig` 表单（车牌数组 / 车型数组 / `crowdNum` 表达式 `>10` / 设备数组）+ `deviceScope` 多选 + `timeScope` 起止时刻（支持跨零点）；`2001` 提示配置非法 | 同上；动态表单是独立子项目，需单独出规格 |
| 6 | 规则试跑 | 规则页内抽屉 | `POST /alert-rules/match-test` | 样本事件表单 → 展示 `{matched, reason}`，不落库 | 依赖第 5 项 |
| 7 | 站内通知 | 顶栏铃铛 + `/notification` | `/notifications` 全 5 端点 | 未读红点轮询 `unread-count`（建议 30s）；`type`/`readFlag` 过滤；越权返 404 | 同 1；顶栏已预留铃铛位 |
| 8 | 人脸域增强 | 详情页 | `identifyFaceUrl`/`visibleLightUrl` | 依赖人脸库比对，后端已预留字段 | 详情抽屉**已渲染**这两个字段，缺的是人脸库比对功能本身（后端未实现） |
| 9 | 船舶舷号 | 事件子类 | `ship_plate` | 预留：当前不在 Python 推送任务列表，字典已有 code | 上游 Python 推送任务未接入，无数据可展示 |
| 10 | 导出异步化 | — | — | 后端本期同步导出上限 5 万条（`4001`），数据量增长后需改异步任务 + 下载中心 | 需后端先提供异步任务端点 |

（第 8、9 两项的「原因」与其他项不同，据实写，不要统一套「用户选定范围」。第 8 项要说明前端侧其实已经做了字段渲染。）

**④ 已知问题与技术债** —— 据实列出实施中发现但未修的：无 `keep-alive` 导致跳页筛选重置（刻意决策，附理由）；数字字段无法清空（后端 `setIgnoreNullValue(true)` 限制，前端只能拦截提示，彻底解决要后端改 DTO 语义）；`el-input-number` 绑定样板代码重复（可抽 `NumberField.vue`，本期未做）；抓拍图依赖 MinIO 匿名读策略，未配则全列表 403（已在 `SnapImage` 降级，但根因在部署配置）；以及实施中真实踩到的其他问题。

- [ ] **Step 3: 文档自检**

- README 里每条命令**实际跑一遍**，确认能复制粘贴执行（PowerShell 下不要用 `&&`，用 `;`）
- Nginx 配置的 `proxy_pass` 结尾斜杠要与 `VITE_API_BASE` 的实际取值对齐，写清对应关系
- 未完成模块表的 10 行与设计规格 §7 逐行核对，**行数与模块名必须一致**，不得漏项或改名
- 两份文档的功能清单交叉一致（README 第 6/7 小节 ↔ 日志 ①③）
- 全文搜 `预期通过`、`TODO`、`TBD`，命中即修

- [ ] **Step 4: 提交**

```bash
git add README.md docs/IMPLEMENTATION_LOG.md
git commit -m "docs: README 与实施日志（含 10 项未完成模块及原因）"
```

---

## 整体验收标准

全部满足才算完成：

1. **单测全绿** —— `npm run test` 零失败，覆盖 `utils/`（params/format/download/navigate/token）、`api/`（interceptors/auth/event）、`stores/`（auth/dict）、`composables/`（useEnum/useEventQuery）、`models/`（eventEditModel/statOptions）、`components/`（SnapImage）
2. **构建零错误** —— `npm run build`（含 `vue-tsc --noEmit` 全量类型检查）通过，无 `any` 逃逸导致的隐式类型放行
3. **生产包可本地联调** —— `npm run preview` 下登录、列表、详情、看板四条主流程全部可用（验证 preview proxy）
4. **登录闭环** —— `admin/123456` 可登录；未登录访问受保护页跳登录并带 redirect；登录后回原页；退出清凭据；开放重定向被拦截
5. **事件管理闭环** —— 8 项筛选逐个生效（**`handleStatus=0` 与 `priority=0` 必须能查出数据**）；分页与改每页条数正常；详情抽屉字段完整（子类名来自 `sourceData.task`）；修正后 DB 实际变更（HEX 校验）且只发改动字段；单条与批量删除生效；导出 xlsx/csv 落盘可打开
6. **看板可用** —— 三图有数据、四卡数字自洽、空区间显示空态与 `—`（非 `NaN%`）、横向柱最大值在顶部、`dataZoom` 可拖、切页往返无 ECharts 警告
7. **401 与文档** —— 篡改令牌与自然过期两条路径都正确跳登录；`README.md` 与 `docs/IMPLEMENTATION_LOG.md` 存在，日志含**逐项实测结果**与**10 项未完成模块及原因**，无「预期通过」字样

---

## 执行说明

- 按 Task 1 → 13 顺序执行，**不得跳序**（后面的 Task 依赖前面的 Interfaces）
- 每个 Task 内部走 TDD：先写失败测试 → 跑确认失败 → 实现 → 跑确认通过 → 提交
- 每个 Task 结束时把实测结果（测试数、联调逐项通过情况）记进草稿，Task 13 汇总
- 遇到与本计划冲突的后端行为，**以后端实际行为为准**，修正计划并在实施日志「已知问题」里记一笔
- 联调需要后端运行：`docker compose up -d`（`D:\Code\Java\Detect\docker\docker-compose.yml`）+ gateway(9999) / auth(8081) / event(8082)
