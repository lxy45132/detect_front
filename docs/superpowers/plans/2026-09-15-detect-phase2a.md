# Detect 前端二阶段 A 组（预警处置闭环）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在一阶段「登录 + 事件管理 + 看板」之上，打通「预警待办 → 状态流转（单条/批量）→ 处理记录 → 处理效率统计」处置闭环。

**Architecture:** 完全沿用一阶段单向分层与既有模式：`api/handle.ts` 对应 `api/event.ts`，`useTodoQuery`/`useHandleRecords` 对应 `useEventQuery`，`HandleProcessDialog` 对应 `EventEditDialog`（弹窗自持 API 调用、成功 emit 通知宿主刷新）。状态机 §5.2 矩阵以前端纯函数副本驱动按钮显隐/禁用与批量预检，合法性仍以后端为准。

**Tech Stack:** 同一阶段（Vite 5 · Vue 3.5 `<script setup>` · TS strict · Element Plus 2.9 · Pinia · Vitest 2 + jsdom + @vue/test-utils）

**Spec:** `docs/superpowers/specs/2026-09-15-detect-phase2a-design.md`

## Global Constraints

- 一阶段全部全局约束继续生效（见一阶段计划 Global Constraints，逐条继承）
- 成功 code=0；`cleanParams` 剔除 `''`/null/undefined 但保留 0（priority=0 是合法筛选值）
- 错误提示一律由 axios 拦截器统一弹，业务层只返 boolean/结果，不重复弹
- **联调与浏览器实测全部由使用方执行**，实施方只跑到：`npm run test` 全绿 + `npm run type-check` EXIT=0 + `npm run build` EXIT=0
- 提交信息中文，格式 `feat: xxx` / `test: xxx` / `fix: xxx` / `docs: xxx`
- 视图页不写单测；逻辑层（models/composables/api/components）TDD：先写失败测试再实现

## 关键既有件（实施前先读，照抄其模式）

- 请求薄封装：`src/api/request.ts`（get/post/put/del）；路径前缀：`src/api/base-url.ts` 的 `EVENT_BASE`
- 参照实现：`src/api/event.ts`、`src/composables/useEventQuery.ts`、`src/components/EventEditDialog.vue`、`src/views/event/list.vue`、`src/views/event/statistics.vue`
- 测试模式：`src/api/__tests__/event.test.ts`（mock `@/api/request`）、`src/composables/__tests__/useEventQuery.test.ts`（vi.hoisted + vi.mock）、`src/components/__tests__/EventEditDialog.test.ts`（`import '@/test/element-plus'` + attachTo body + 从 document.body 断言）
- 复用组件：`EventDetailDrawer`（props `{modelValue, eventId}`，emit `edited`）、`SnapImage`、`useEnum`（handleStatusLabel/Tag、priorityLabel/Tag）
- 常量：`HANDLE_STATUS`（0 未处理 / 1 处理中 / 2 已处理 / 3 误报忽略）在 `src/constants/error-code.ts`
- 已预定义类型：`TodoItem`/`BatchHandleResult`/`HandleRecordItem`/`HandleStat`（`src/types/api.ts` §4.3 段）

---

## Task 1: 类型补全 + 状态机矩阵纯函数

**Files:**
- Modify: `src/types/api.ts`（§4.3 段追加 `TodoQuery`/`HandleRecordQuery`/`HandleProcessRequest`/`BatchHandleRequest`，字段照规格 §4；全局段加 `StatQuery`）
- Modify: `src/api/event.ts`（`StatQuery` 改为 `import type { StatQuery } from '@/types/api'` 并 `export type { StatQuery }` 保持兼容——清偿技术债 #14）
- Create: `src/models/handleStatusMachine.ts`
- Test: `src/models/__tests__/handleStatusMachine.test.ts`

**Interfaces（Produces）:**
- `canTransition(from: number | null | undefined, to: number | null | undefined): boolean`
- `allowedTargets(from: number | null | undefined): number[]` —— 0→[1,3]、1→[2,3]、2/3/null/越界→[]
- `allowedTargetsForAny(fromStatuses: number[]): number[]` —— 批量并集去重

**要点：** 矩阵用 `Record<number, number[]>` 表驱动，数据取自 `HANDLE_STATUS` 常量，不写魔法数；与后端 `HandleStatusEnum.canTransition` 逐格一致。

- [ ] **Step 1: 写失败测试**——16 格矩阵用 `it.each` 全量锁定 + null/undefined/越界 code + allowedTargets 四态 + allowedTargetsForAny（混合 [0,1]→[1,2,3]、空集→[]）
- [ ] **Step 2: 跑测试确认失败**（`npm run test -- handleStatusMachine`，模块不存在）
- [ ] **Step 3: 实现 `handleStatusMachine.ts` + 类型补全 + `event.ts` 的 StatQuery 迁移**
- [ ] **Step 4: 跑测试确认通过 + `npm run type-check`**（顺带验证 StatQuery 迁移未破坏既有类型）
- [ ] **Step 5: 提交** `feat: 状态机矩阵纯函数 + 处理域类型补全（StatQuery 收归 types）`

---

## Task 2: API 层 `api/handle.ts`

**Files:**
- Create: `src/api/handle.ts`
- Test: `src/api/__tests__/handle.test.ts`

**Interfaces（Produces，路径均挂 `${EVENT_BASE}/alert-handles`）：**

```ts
fetchTodo(query: TodoQuery): Promise<PageResult<TodoItem>>                    // GET /todo
processEvent(req: HandleProcessRequest): Promise<void>                        // POST /process
batchProcess(req: BatchHandleRequest): Promise<BatchHandleResult>             // POST /batch-process
fetchHandleRecords(query: HandleRecordQuery): Promise<PageResult<HandleRecordItem>> // GET /records
fetchHandleStatistics(query: StatQuery): Promise<HandleStat>                  // GET /statistics
```

- [ ] **Step 1: 写失败测试**——5 个用例：各函数的 HTTP 方法、URL、参数透传（mock `@/api/request`，断言模式照抄 `event.test.ts`）
- [ ] **Step 2: 跑测试确认失败**（`Cannot find module '@/api/handle'`）
- [ ] **Step 3: 实现 `api/handle.ts`**（纯透传，无业务逻辑）
- [ ] **Step 4: 跑测试确认通过**
- [ ] **Step 5: 提交** `feat: 处理域 API 层（待办/流转/批量/记录/效率统计 5 端点）+ 单测`

---

## Task 3: `useTodoQuery` composable

**Files:**
- Create: `src/composables/useTodoQuery.ts`
- Test: `src/composables/__tests__/useTodoQuery.test.ts`

**Interfaces:**
- Consumes: `fetchTodo`（Task 2）、`cleanParams`、`DEFAULT_PAGE_SIZE`（从 `useEventQuery` re-export 处 import，不重复定义）
- Produces: `form`（TodoFilterForm：`priority`/`eventType`/`deviceNum`/`dateRange` 四项）、`page`/`size`/`total`/`rows: Ref<TodoItem[]>`/`selection`/`loading`、`toQuery()`、`load()`、`search()`、`resetForm()`、`onPageChange/onSizeChange/onSelectionChange`、`reloadCurrent()`（回查当前页）、`reloadAfterBatch()`（清空勾选 + 回第 1 页 + 回查）

**要点：** 整体结构与 `useEventQuery` 同构；**无 handleStatus 筛选**（待办接口固定 {0,1}）；无导出、无子类联动；流转后的刷新语义拆成 `reloadCurrent`/`reloadAfterBatch` 两个具名方法（单条保持页码，批量回第 1 页——同 removeMany 的理由：跨页流转后原页码无意义）。

- [ ] **Step 1: 写失败测试**——toQuery（保留 priority=0、剔除空 deviceNum、dateRange 双值映射 startTime/endTime）、load 成功/失败清空、search 归 1 页、resetForm、分页两回调、reloadCurrent 保页码、reloadAfterBatch 清勾选归 1
- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现**
- [ ] **Step 4: 跑测试确认通过**
- [ ] **Step 5: 提交** `feat: useTodoQuery 待办筛选/分页/流转刷新编排 + 单测`

---

## Task 4: `HandleProcessDialog` 流转弹窗

**Files:**
- Create: `src/components/HandleProcessDialog.vue`
- Test: `src/components/__tests__/HandleProcessDialog.test.ts`

**Interfaces:**
- Consumes: `processEvent`/`batchProcess`（Task 2）、`canTransition`/`allowedTargets`/`allowedTargetsForAny`（Task 1）、`useEnum().handleStatusLabel`
- Produces（契约，页面按此接线）：
  - props `{ modelValue: boolean; events: TodoItem[]; presetTarget?: number | null }`（**单条=events 长度 1，不单设 mode**——比规格 §3.2 的 mode prop 更简，规格允许此简化）
  - emits `update:modelValue`、`processed`（单条成功即发；批量在用户关闭结果视图时发）

**行为要点：**
- 目标态 radio 三项（处理中/已处理/误报忽略，中文名走字典）：disabled 由 `allowed` 计算（单条按该行状态，批量按并集）
- 打开时（watch modelValue）：`target = presetTarget ?? null`、清空 remark 与 result——防「再打开闪现上次值」
- 批量预检提示：「选中 N 条，其中 M 条可流转到该目标」（`eligibleCount` = events 中 canTransition 计数），**仅提示不拦截**
- remark：textarea，maxlength 500，空串提交时发 `undefined`（不传键）
- 提交中 `submitting` 闸防连点（一阶段登录页连点缺陷的教训）
- 单条成功 → `ElMessage.success('处理成功')` + emit('processed') + 关闭；批量成功 → 弹窗切结果视图（成功 X 条 / 跳过 Y 条 + skipped 明细 `#id 原因`），用户点「关闭」时 emit('processed') + 关闭
- 失败（1001/3001/网络）：catch 住不抛出、不弹提示（拦截器已弹）、不关弹窗

- [ ] **Step 1: 写失败测试**（`import '@/test/element-plus'`，mount attachTo body，断言从 document.body 读）：
  1. 单条未处理事件 → 「已处理」radio 禁用、其余可选
  2. `presetTarget` 预选生效
  3. 单条提交 → `processEvent` body 为 `{eventId, toStatus}`（remark 空不发键），成功 emit processed + 关闭
  4. 批量混合状态 → 三目标都可选（并集），预检计数正确（如选「已处理」时只有处理中行计入 M）
  5. 批量提交成功 → 结果视图显示成功/跳过数与明细，**提交瞬间不 emit processed**，点关闭才 emit
  6. 提交失败 → 不关窗、不 emit、不重复弹提示
  7. 关闭再打开 → target/remark/result 重置
- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现组件**
- [ ] **Step 4: 跑测试确认通过 + type-check**
- [ ] **Step 5: 提交** `feat: 状态流转弹窗（单条/批量 + 矩阵禁用 + 批量预检与结果展示）+ 组件测试`

---

## Task 5: 预警待办页 `/handle/todo`

**Files:**
- Create: `src/views/handle/todo.vue`
- Modify: `src/router/index.ts`（HandleTodo 路由去 hidden、component 换真实视图）

**Interfaces:** Consumes Task 1/2/3/4 全部 + `EventDetailDrawer`/`SnapImage`/`useEnum`/`useDictStore`。

**要点（模板结构照 `views/event/list.vue`）：**
- 筛选区 4 项：优先级 select（`dict.priorityOptions`）/ 事件大类 select（`dict.eventTypeOptions`）/ 设备编号 input / 抓拍时间 datetimerange（`value-format="YYYY-MM-DD HH:mm:ss"`）
- 表格列：勾选（`reserve-selection` + `row-key="id"`）/ 抓拍图 SnapImage / ID / 设备 / 事件类型（大类+子类）/ 车牌 / 人数 / 抓拍时间 / 优先级 tag / 处理状态 tag / 命中规则（`textOr(row.hitRuleName)`——todo VO 直接给名字，不像列表页用 id tag）/ 操作
- 操作列：`详情` + `v-for="t in allowedTargets(row.handleStatus)"` 动态渲染流转按钮（文案映射：1→开始处理、2→标记已解决、3→误报忽略，映射表放视图内常量），点击 `openProcess(row, t)`；行点击同 list.vue 的 `onRowClick`（勾选列除外开详情）
- 工具栏：「批量处理」按钮（selection 空禁用）→ `openBatch()`（events=selection、presetTarget=null）
- 弹窗接线：`processIsBatch` ref 在 open 时记录模式；`@processed` → 批量走 `reloadAfterBatch()`、单条走 `reloadCurrent()`
- `onMounted`: `await dict.load()` 后 `load()`（字典先于列表，同 list.vue）
- 无删除、无导出

- [ ] **Step 1: 实现页面 + 路由替换**
- [ ] **Step 2: `npm run type-check ; npm run build:only` 零错误**
- [ ] **Step 3: 浏览器联调（使用方执行）**：待办列表渲染 / 筛选 4 项 / 单条流转三种路径 / 批量部分成功 skipped 展示 / 详情抽屉打开 / 流转后列表回查
- [ ] **Step 4: 提交** `feat: 预警待办页（筛选/矩阵分流操作/批量处理/详情入口）`

---

## Task 6: 处理记录页 `/handle/records`

**Files:**
- Create: `src/composables/useHandleRecords.ts`
- Test: `src/composables/__tests__/useHandleRecords.test.ts`
- Create: `src/views/handle/records.vue`
- Modify: `src/router/index.ts`（HandleRecords 路由去 hidden、换真实视图）

**Interfaces:**
- Produces（composable）：`form`（`eventIdText: string` + `dateRange`）、分页/rows/loading/load/search/resetForm 等（同构）；`toQuery()` 内 `eventIdText` 仅当匹配 `/^\d+$/` 时转 number 发出，否则剔除
- 页面复用 `EventDetailDrawer`：事件 ID 列渲染为 link 按钮，点击开抽屉（事件已被逻辑删时后端 1001 由拦截器提示，不特殊处理）

**要点：**
- 筛选 2 项：事件 ID（el-input 文本框 + 数字校验在 toQuery，绕开 el-input-number 的 v-model 类型坑）+ 处理时间 datetimerange
- 列：记录 ID / 事件 ID（可点）/ 流转（`fromStatus tag → toStatus tag`，fromStatus 为 null 显 `—`）/ 处理人 / 处理备注 / 处理时间；表头不设 sortable（后端固定 `handle_time DESC`）
- composable 测试：toQuery 的 eventId 文本校验（合法数字发出 / 非数字剔除 / 空剔除）、load 成败、分页回调

- [ ] **Step 1: 写 composable 失败测试 → Step 2: 确认失败 → Step 3: 实现 → Step 4: 确认通过**
- [ ] **Step 5: 实现页面 + 路由替换，type-check + build 零错误**
- [ ] **Step 6: 浏览器联调（使用方执行）**：记录列表 / 筛选 / 点事件 ID 开抽屉 / 流转留痕与待办页操作对得上
- [ ] **Step 7: 提交** `feat: 处理记录页（eventId+时间筛选 / 流转状态对 / 事件详情入口）+ 单测`

---

## Task 7: 看板并入处理效率统计卡

**Files:**
- Modify: `src/views/event/statistics.vue`

**要点：**
- `load()` 改 `Promise.allSettled([getEventStatistics(params), fetchHandleStatistics(params)])`：任一失败仅该区块置空态，互不影响；两个 `failed` 标志分开
- 事件统计 4 卡下方新增一行 5 卡（flex 5 等分，el-row 的 24 栅格除不尽 5，用 `display:flex; gap:16px` + `flex:1`）：待处理数 / 处理中数 / 今日已解决 / 误报率（`percent(falseRate)`）/ 平均处理时长（标签注明单位分钟，值直接显示后端一位小数）
- 「今日已解决」卡加 `sub-text` 脚注「按自然日统计，不受筛选限制」
- 空态/失败态文案与现有看板同风格

- [ ] **Step 1: 实现**
- [ ] **Step 2: `npm run type-check ; npm run build:only` 零错误**
- **Step 3: 浏览器联调（使用方执行）**：筛选同时驱动两组统计 / 5 卡数值与 DB 口径一致 / 效率统计失败时事件统计不受影响
- [ ] **Step 4: 提交** `feat: 看板并入处理效率统计 5 卡（双统计并行独立容错）`

---

## Task 8: 回归 + 文档收尾

- [ ] **Step 1: 全量单测** `npm run test` → 全绿；`npm run test:coverage` 记录实测文件数/用例数
- [ ] **Step 2: 类型检查 + 生产构建** `npm run build` → EXIT=0，记录 chunk 体积变化
- [ ] **Step 3: 更新 `docs/IMPLEMENTATION_LOG.md`**：追加二阶段 A 组章节（Task 完成状态表 + 实测值 + 联调项标「待使用方测试」，验证点照规格 §6 五条）；`README.md` §6 未完成清单划掉已完成的 4 项
- [ ] **Step 4: 提交** `docs: 二阶段 A 组实施日志与清单更新`

---

## 自检记录（写计划时已过一遍）

- 规格 §3.1~§3.4 四模块 → Task 5/4/6/7 一一对应；§4 类型 → Task 1；§5 矩阵 → Task 1；§6 测试策略 → 各 Task 的 TDD 步骤 + Task 8；§7 路由 → Task 5/6
- 与规格的唯一偏差：弹窗不单设 `mode` prop（由 `events.length` 推导），已在 Task 4 注明
- 类型名全篇一致：`fetchTodo/processEvent/batchProcess/fetchHandleRecords/fetchHandleStatistics`、`reloadCurrent/reloadAfterBatch`、`allowedTargets/allowedTargetsForAny/canTransition`
