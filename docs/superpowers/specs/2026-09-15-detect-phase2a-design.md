# Detect 事件管理后台前端二阶段 A 组（预警处置闭环）— 设计规格

> 版本：v1.0　｜　日期：2026-09-15　｜　状态：已确认
> 后端契约唯一真源：`yolo26/docs/superpowers/specs/2026-09-10-event-management-api-design.md`（§4.3 预警处理 6 端点，后端已全部实现并有单测）
> 前置：一阶段「登录 + 事件管理 + 数据看板」已完成（`docs/IMPLEMENTATION_LOG.md`），本期复用其分层架构、请求层、字典缓存与组件
> **本期约定：所有前后端联调/浏览器实测由使用方执行**，实施方只负责单测 + 类型检查 + 生产构建

## 1. 范围

### 1.1 本期实现（4 个模块）

| 模块 | 路由 | 后端端点 | 说明 |
|------|------|---------|------|
| 预警待办 | `/handle/todo` | `GET /alert-handles/todo` | 固定 `handle_status ∈ {0,1}`，紧急置顶 |
| 状态流转 | 待办页内弹窗 | `POST /alert-handles/process`、`/batch-process` | 单条 + 批量，按 §5.2 矩阵禁用非法目标 |
| 处理记录 | `/handle/records` | `GET /alert-handles/records` | 按 `handle_time DESC` 分页 |
| 处理效率统计 | 并入 `/event/statistics` | `GET /alert-handles/statistics` | 5 指标卡片，复用看板筛选 |

### 1.2 本期不做

- B 组（布控规则管理 + 试跑）、C 组（站内通知）——后续迭代
- `GET /alert-handles/{eventId}/history` 不新调——详情抽屉已复用详情 VO 内嵌的 `handleHistory`（一阶段结论）
- 人脸域增强、船舶舷号、导出异步化——后端/上游未就绪
- 不重构一阶段已交付代码（不抽通用分页底座）

## 2. 架构

沿用一阶段单向分层 `views → components/composables → stores → api → utils → types/constants`，全局约束全部继承（`code===0` 拆包、401 硬跳、`cleanParams` 保留 0、时间后端格式化、禁 `v-html`、strict TS）。

### 2.1 新增文件

```
src/
├─ api/handle.ts                    fetchTodo / processEvent / batchProcess / fetchHandleRecords / fetchHandleStatistics
├─ api/__tests__/handle.test.ts
├─ models/handleStatusMachine.ts    canTransition(from,to) / allowedTargets(from) 纯函数（§5.2 矩阵前端副本）
├─ models/__tests__/handleStatusMachine.test.ts
├─ composables/
│  ├─ useTodoQuery.ts               待办筛选 + 分页 + 勾选 + 流转编排
│  ├─ useHandleRecords.ts           记录筛选 + 分页
│  └─ __tests__/{useTodoQuery,useHandleRecords}.test.ts
├─ components/
│  ├─ HandleProcessDialog.vue       单条/批量通用流转弹窗
│  └─ __tests__/HandleProcessDialog.test.ts
└─ views/handle/{todo.vue, records.vue}
```

### 2.2 修改文件

| 文件 | 改动 |
|------|------|
| `src/types/api.ts` | 补 `TodoQuery` / `HandleRecordQuery` / `HandleProcessRequest` / `BatchHandleRequest` 四个类型（`TodoItem`/`BatchHandleResult`/`HandleRecordItem`/`HandleStat` 已预定义） |
| `src/router/index.ts` | `/handle/todo`、`/handle/records` 去掉 `meta.hidden`，component 换真实视图 |
| `src/views/event/statistics.vue` | 新增效率统计卡区；`load()` 并行驱动两个统计请求 |
| `src/models/statOptions.ts`（如需要） | 不动图表，仅卡片数据在读层组装 |

## 3. 模块设计

### 3.1 预警待办页 `/handle/todo`

**筛选表单**（对齐 `TodoQueryDTO`，共 4 项）：优先级（number 字典）/ 事件大类 / 设备编号（精确）/ 抓拍时间区间（`snap_time`）。**无处理状态筛选项**——待办接口语义固定 `{0,1}`。

**表格列**：勾选 / 抓拍图（复用 `SnapImage`）/ ID / 设备（编号+名称）/ 事件类型（大类+子类中文）/ 车牌或人数 / 抓拍时间 / 优先级 tag / 处理状态 tag / 命中规则（`hitRuleName`，空显 `—`）/ 操作。

**行内操作**（前端矩阵驱动显隐，点任一项都开同一个 `HandleProcessDialog` 并预选目标态）：

| 当前状态 | 可见操作 |
|---------|---------|
| 未处理(0) | 开始处理(→1)、误报忽略(→3) |
| 处理中(1) | 标记已解决(→2)、误报忽略(→3) |

**详情入口**：行内「详情」复用一阶段 `EventDetailDrawer`（零改动，`getEventDetail` 按 id 拉取）。

**批量**：勾选 + 工具栏「批量处理」→ 同一弹窗（批量模式）。

**刷新策略**（沿用一阶段「回查而非本地改」）：流转成功后回查当前页——流转到已处理/误报的行从待办消失、total 收缩；流转到处理中的行留在列表、状态列变「处理中」。批量处理后清空勾选。

### 3.2 状态流转弹窗 `HandleProcessDialog`

单条/批量通用。props：`modelValue`、`mode: 'single' | 'batch'`、单条时传 `event: TodoItem`，批量时传 `events: TodoItem[]`。

- **目标状态 radio**（处理中/已处理/误报忽略）：按 §5.2 矩阵禁用非法项。单条按该行 `handleStatus`；批量按勾选集合——目标态对集合内**任意一行合法即可选**
- **批量预检提示**：实时计算并显示「选中 N 条，其中 M 条可流转到该目标」。仅提示、不拦截提交——后端仍是权威，非法行进 `skipped`
- **备注**：选填 textarea，透传 `remark`（上限 500 字，对齐 `alert_handle_record.handle_remark` 列宽）
- **结果展示**：单条成功 → `ElMessage.success('处理成功')` 并关闭弹窗；批量成功 → 弹窗内展示「成功 X 条，跳过 Y 条」+ skipped 明细列表（eventId + 后端原因），用户手动关闭
- **错误**：`1001`/`3001` 等由 axios 拦截器统一弹后端 `msg`，组件不重复弹（一阶段约定）

### 3.3 处理记录页 `/handle/records`

**筛选**：事件 ID（`el-input-number`，精确）+ 处理时间区间（`handle_time`）。**不做 handlerId 筛选**（用户对 ID 无感知；后端亦不支持 handlerName 模糊，待后续有用户选择器再加）。

**表格列**：记录 ID / 事件 ID（可点击，开 `EventDetailDrawer` 查看该事件；事件已被逻辑删时后端返 `1001`，由拦截器统一提示，不特殊处理）/ 流转（`原状态 tag → 新状态 tag`，走 `useEnum` 翻译）/ 处理人 / 处理备注 / 处理时间。

排序由后端固定 `handle_time DESC, id DESC`，表头不设 `sortable`（同一阶段约定）。

### 3.4 处理效率统计卡（并入 `/event/statistics`）

- 现有筛选表单（时间范围 + 设备编号）**同时驱动** `getEventStatistics` 与 `fetchHandleStatistics`，`Promise.all` 并行、互不阻塞；任一失败仅该区块置空态
- 在事件统计 4 卡下方新增一行 5 卡（一行 5 等分）：**待处理数 / 处理中数 / 今日已解决 / 误报率 / 平均处理时长(分钟)**
- 误报率展示为百分比（`percent(falseRate)`，后端给 0~1 两位小数）；平均处理时长保留一位小数（后端口径）
- 「今日已解决」卡片加脚注「按自然日统计，不受时间筛选限制」（后端语义固有，避免误读为区间值）

## 4. 数据契约与类型

新增类型（`src/types/api.ts`）：

```ts
/** 待办列表查询（TodoQueryDTO §4.3.1） */
export interface TodoQuery {
  current?: number
  size?: number
  priority?: number | null
  eventType?: number | null
  deviceNum?: string | null
  startTime?: string | null
  endTime?: string | null
}

/** 处理记录查询（HandleRecordQueryDTO §4.3.4） */
export interface HandleRecordQuery {
  current?: number
  size?: number
  eventId?: number | null
  startTime?: string | null
  endTime?: string | null
}

/** 单条/批量处理请求体（HandleProcessDTO / BatchHandleDTO §4.3.2/§4.3.3） */
export interface HandleProcessRequest {
  eventId: number
  toStatus: number
  remark?: string | null
}
export interface BatchHandleRequest {
  eventIds: number[]
  toStatus: number
  remark?: string | null
}
```

已预定义可直接用：`TodoItem`、`BatchHandleResult`、`HandleRecordItem`、`HandleStat`。

API 函数签名（`src/api/handle.ts`，路径均挂 `EVENT_BASE + '/alert-handles'`）：

```ts
fetchTodo(query: TodoQuery): Promise<PageResult<TodoItem>>
processEvent(req: HandleProcessRequest): Promise<void>
batchProcess(req: BatchHandleRequest): Promise<BatchHandleResult>
fetchHandleRecords(query: HandleRecordQuery): Promise<PageResult<HandleRecordItem>>
fetchHandleStatistics(params: { startTime?: string; endTime?: string; deviceNum?: string }): Promise<HandleStat>
```

## 5. 状态机矩阵（前端副本）

`src/models/handleStatusMachine.ts`：

```
from\to   0    1    2    3
  0       —    ✓    ✗    ✓
  1       ✗    —    ✓    ✓
  2       ✗    ✗    —    ✗    （终态）
  3       ✗    ✗    ✗    —    （终态）
```

- `canTransition(from, to)`：null/越界/同状态/终态出边 一律 false
- `allowedTargets(from)`：返回合法目标 code 数组（0→[1,3]、1→[2,3]、2/3→[]）
- 与后端 `HandleStatusEnum.canTransition` 逐格一致；前端矩阵只用于按钮显隐/禁用与批量预检提示，**流转合法性以后端为准**（前端绕过也只会在后端撞 `3001`）
- 16 格 + 边界（null、越界 code）单测锁定

## 6. 测试策略

- **TDD**：状态机矩阵、`api/handle.ts`（mock 请求层）、`useTodoQuery` / `useHandleRecords`、`HandleProcessDialog`（禁用逻辑 / 批量预检计数 / 结果展示分支）均先测后码
- **视图页不写单测**（一阶段约定，视图行为由联调覆盖）
- **联调与浏览器实测全部由使用方执行**，实施日志中对应项标「待使用方测试」；建议验证点：
  1. 单条流转后待办列表变化（→处理中 留在列表；→已处理/误报 消失且 total 收缩）
  2. 批量混合状态的部分成功提示与 skipped 明细
  3. 非法流转（如直接对已处理事件发请求）弹后端 `3001` msg
  4. 看板筛选同时驱动两组统计、效率 5 卡与 DB 口径一致
  5. 误报流转后处理记录页出现对应留痕（原状态→新状态正确）
- 验收门槛：`npm run test` 全绿、`npm run type-check` EXIT=0、`npm run build` EXIT=0

## 7. 路由与菜单

`/handle/todo`（预警待办，Bell）、`/handle/records`（处理记录，Tickets）已在路由表占位注册，本期去掉 `meta.hidden` 并替换 `PlaceholderView` 为真实视图；侧栏菜单自动出现（菜单按 `!hidden` 渲染）。
