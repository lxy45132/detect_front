# Detect 事件管理后台前端 — 设计规格

> 版本：v1.0　｜　日期：2026-09-12　｜　状态：已确认（本期范围 = 登录 + 事件管理）
> 后端契约来源：`yolo26/docs/superpowers/specs/2026-09-10-event-management-api-design.md`（29 端点）
> 后端实施现状：`Java/Detect/docs/IMPLEMENTATION_LOG.md`（Step 1~7 全部完成，91 单测全绿，真实视频联调贯通）

## 1. 范围

### 1.1 本期实现（3 个页面 + 支撑设施）

| 模块 | 路由 | 后端端点 |
|------|------|---------|
| 登录 | `/login` | `POST /auth/oauth/token` |
| 事件管理 | `/event/list` | `/event-records/page`、`/{id}`、`PUT /{id}`、`DELETE /{id}`、`DELETE /batch`、`/export` |
| 数据看板 | `/event/statistics` | `/event-records/statistics` |
| 字典（支撑） | — | `/event-categories/enums` |

### 1.2 后续迭代（本期不做，见 §7）

预警待办与状态流转、布控规则 CRUD + 试跑、处理记录、站内通知、人脸/船舶域字段编辑。

## 2. 架构

**技术栈**：Vite 5 + Vue 3.5（`<script setup>`）+ TypeScript 5.6（strict）+ Element Plus 2.9（全量引入）+ Pinia 2 + Vue Router 4 + Axios 1.7 + ECharts 5.5 + Vitest 2（逻辑层单测）。

**分层**：
```
types/     后端契约类型（唯一真源，逐字段对齐 VO/DTO）
constants/ 错误码表 + 存储键 + 枚举 code 常量
utils/     token 读写、参数清洗、文件流下载、格式化（纯函数，可单测）
api/       axios 实例 + 按业务域拆的接口函数（只做「拼参数 + 调 http」）
stores/    Pinia：auth（令牌/用户）、dict（枚举缓存）
composables/ 可复用逻辑：useEnum（code→名称/标签色）
router/    路由表 + 登录守卫
layouts/   BasicLayout（侧栏 + 顶栏 + 内容区）
components/ 跨页复用组件：SnapImage、EventDetailDrawer、EventEditDialog
views/     页面：login、event/list、event/statistics
```

**依赖方向**（单向，无环）：`views → components/composables → stores → api → utils → types/constants`。
`api/request.ts` **不** import store 与 router（避免循环依赖），令牌经 `utils/token.ts` 直读 localStorage，401 走 `window.location` 硬跳转。

## 3. 关键技术决策

### 3.1 请求链路

```
浏览器  /api/admin/event/event-records/page
  └─ Vite dev proxy 剥 /api → http://localhost:9999/admin/event/event-records/page
       └─ gateway StripPrefix=2 → lb://detect-event /event-records/page
```
生产由 Nginx 承担同样的 `/api → gateway:9999` 反代职责。网关未启动时把 `.env.development` 的 `VITE_PROXY_TARGET` 改为 `http://localhost:8082` 可直连 event 服务（登录改直连 8081 需另配，见 §7 备注）。

### 3.2 登录必须用 form 编码（踩坑预防）

`OAuth2Controller.token` 用 `@RequestParam` 接收 `username`/`password`/`grant_type`，
**不是** `@RequestBody`。前端若发 JSON 会得到 400 `Required request parameter 'username' is not present`。
故登录用 `URLSearchParams` + `Content-Type: application/x-www-form-urlencoded`，且走**裸 axios**（不经业务拦截器），因为其响应是 OAuth2 扁平结构而非 `R<T>` 包装，失败时是 HTTP 400 + `{error:"invalid_grant", error_description:"用户名或密码错误"}`。

### 3.3 统一响应拆包与错误处理

业务实例响应拦截器：
- `responseType === 'blob'` → 原样透传（导出文件流）
- `body.code === 0` → **返回 `body.data`**（调用方直接拿业务数据，不再层层 `.data`）
- `body.code !== 0` → `ElMessage.error(msg)` 并 `reject(new BizError(code, msg))`
- HTTP 401 → 清令牌 + 提示 + `window.location.href = '/login?redirect=<当前路径>'`
- HTTP 403/404/500/网络错误 → 按 `ERROR_MESSAGES` 表兜底文案提示

**GET 参数清洗**：请求拦截器剔除 `params` 中 `undefined`/`null`/`''` 的键。
原因：Element Plus 的 `clearable` 选择器清空后值为 `''`，若原样发出 `?eventType=` 会触发后端类型转换异常（400）。

### 3.4 令牌存储与过期

`localStorage`：`detect_access_token`（JWT 串）+ `detect_login_user`（`{userId, username, authorities, issuedAt, expiresIn}`）。
后端 `/oauth/token` 返回 `expires_in`（秒）但**不含签发时刻**，故前端在存储时补 `issuedAt = Date.now()`，据此预判过期（留 30s 余量）。路由守卫在令牌已过期时直接判定未登录。

> 取舍：localStorage 而非 Cookie —— 后端为无状态 JWT、无 refresh token 端点，Cookie 方案需要额外的 CSRF 防护且与网关 CORS（`allowCredentials=true` + `allowedOriginPattern=*`）组合更易出错。XSS 风险由「后台系统 + 不渲染任何用户提交的 HTML」控制（全站不使用 `v-html`）。

### 3.5 字典一次性缓存

登录后由 `dict` store 调 `GET /event-categories/enums` 一次，缓存 5 类枚举于内存（Pinia）。
所有下拉选项与 `code → 中文名` 翻译共用该缓存，避免各页重复请求。
`eventType`/`handleStatus`/`priority` 的 `code` 是 JSON number，`ruleType` 的 `code` 是 JSON string —— `EnumItem.code` 声明为 `number | string`，查表时统一用 `String(code)` 作键规避类型不一致。

后端列表 VO 已自带 `eventTypeName`，翻译优先用后端字段，字典仅作兜底与下拉数据源。

### 3.6 抓拍图降级（已知后端约束）

MinIO 桶 `detect` 创建时未设公读策略（`OssTemplate.ensureBucket` 仅 `makeBucket`），实施日志 Step 7-3 已确证匿名 `GET snap_url` 返 **403**。因此浏览器直连 `snapUrl` 无法显示图片。

前端策略：`SnapImage.vue` 用 `el-image` + `error` 插槽，加载失败时显示相机占位图标与「图片不可访问」提示，**不弹全局错误、不影响表格渲染**；`snapUrl` 为 `null` 时显示「无抓拍图」。
运维侧一行命令即可恢复正常显示（不需改后端代码）：`mc anonymous set download myminio/detect`。

### 3.7 导出文件流

`GET /event-records/export?format=xlsx|csv` 返回二进制流，`Content-Disposition` 中文件名经 `URLEncoder` 编码（`+` 代表空格）。
前端用 `responseType: 'blob'` 拿流，自行按 `format` 生成文件名（`事件记录_yyyyMMdd_HHmmss.xlsx`）后触发 `<a download>`，**不解析** `Content-Disposition`（避免编码歧义）。
`csv` 后端以 GBK 输出（Excel 中文友好），前端按原字节下载，不做转码。
超限时后端返 HTTP 200 + `{code:4001}` JSON —— blob 分支需检测 `blob.type === 'application/json'`，读回文本解析出 `msg` 提示用户。

## 4. 页面规格

### 4.1 登录页 `/login`

- 居中卡片，左侧品牌区（系统名 + 一句话简介），右侧表单
- 字段：用户名（必填）、密码（必填，`type=password` 带 show-password）
- 回车提交；提交中按钮 loading + 禁用；失败展示后端 `error_description`
- 已登录（令牌未过期）访问 `/login` → 重定向 `/event/list`
- 页面下方灰字提示默认账号 `admin / 123456`（后端 `AuthDataInitializer` 幂等播种）

### 4.2 事件管理 `/event/list`

**筛选区**（`el-form` inline，两行，右侧「查询 / 重置」）：

| 控件 | 参数 | 数据源 |
|------|------|--------|
| 输入框 设备编号 | `deviceNum` | 手输 |
| 下拉 事件大类 | `eventType` | 字典 `eventType` |
| 下拉 事件子类 | `task` | 字典 `task`，**随大类联动过滤**，大类变更时清空 |
| 下拉 处理状态 | `handleStatus` | 字典 `handleStatus` |
| 下拉 优先级 | `priority` | 字典 `priority` |
| 输入框 车牌号 | `plateNum` | 手输（模糊） |
| 输入框 关键词 | `keyword` | 手输（车牌 OR 设备名） |
| 日期时间区间 | `startTime`/`endTime` | `el-date-picker` type=datetimerange，`value-format="YYYY-MM-DD HH:mm:ss"` |

所有下拉 `clearable`，`placeholder="全部"`。

**工具栏**：导出（`el-dropdown`：导出 Excel / 导出 CSV，带当前筛选条件）、批量删除（选中 0 条时禁用）。

**表格**（`el-table`，多选列 + 固定操作列，`v-loading`）：

| 列 | 字段 | 呈现 |
|----|------|------|
| 抓拍图 | `snapUrl` | `SnapImage` 60×40 缩略，点击放大预览 |
| ID | `id` | 文本 |
| 设备 | `deviceName` / `deviceNum` | 两行：名称 + 灰色编号，名称为空只显示编号 |
| 事件类型 | `eventTypeName` / `task` | 两行：大类 + 子类中文名（字典翻译，缺失显 code） |
| 车牌 | `plateNum` | 空显 `—` |
| 车型 | `vehicleNormalType` | 空显 `—` |
| 人数 | `crowdNum` | 空显 `—` |
| 抓拍时间 | `snapTime` | 后端已格式化，直出 |
| 优先级 | `priority` | `el-tag`：0 info「普通」/ 1 warning「重要」/ 2 danger「紧急」 |
| 处理状态 | `handleStatus` | `el-tag`：0 info「未处理」/ 1 primary「处理中」/ 2 success「已处理」/ 3 「误报忽略」 |
| 命中规则 | `hitRuleId` | 有值显「已命中 #id」小标签，无值显 `—` |
| 操作 | — | 详情 / 修正 / 删除（`el-popconfirm` 二次确认） |

**分页**：`el-pagination`，`page-sizes=[10,20,50,100]`，`layout="total, sizes, prev, pager, next, jumper"`，默认 size=20。

**排序**：不提供前端排序（后端固定 `snap_time DESC`），表头不设 `sortable` 以免误导。

### 4.3 事件详情抽屉 `EventDetailDrawer`

`el-drawer` size=720px，右侧滑出，内容分区：

1. **头部**：事件 ID + 大类标签 + 优先级标签 + 处理状态标签 + 抓拍时间
2. **抓拍图**：`SnapImage` 大图（`preview-src-list` 支持点击放大）
3. **基础信息**（`el-descriptions` 2 列）：设备名称、设备编号、事件大类、事件子类、推送状态（0 未推送 / 1 已推送）、命中规则（`hitRule.ruleName` + `ruleType`，无则「未命中」）
4. **业务字段**：按 `eventType` 动态渲染
   - 200 车辆：车牌号、特殊车辆类别 code、车辆类别、品牌、子品牌、颜色、年款、限高
   - 100 人脸：姓名、身份证号、库名称、相似度、库底图、可见光图
   - 300 聚集：聚集人数
   - 其余字段值为 `null` 时统一显示 `—`（不留空白行，用同一 `descriptions` 组件渲染）
5. **检测元数据**：`sourceData` 以 `<pre>` 展示 `JSON.stringify(v, null, 2)`；后端解析失败回退字符串时原样展示
6. **处理历史**（`el-timeline`）：`handleHistory[]`，每项显示 `handleTime` + `handlerName` + `toStatus` 中文名 + `handleRemark`；空数组显示「暂无处理记录」
7. **底部操作**：修正（打开 `EventEditDialog`）、关闭

打开时 `GET /event-records/{id}`，`v-loading` 覆盖；`1001` 时提示并关闭抽屉。

### 4.4 事件修正弹窗 `EventEditDialog`

`el-dialog` width=640px，`el-form` 2 列布局。**只含业务字段，不含 `handleStatus`**（状态流转属处理域，接口 `PUT /event-records/{id}` 亦不接受）。

按当前事件 `eventType` 分组显示对应字段，全部为可选填（后端 `BeanUtil.copyProperties` 忽略 null，只更新传入字段）：

- 通用：`crowdNum`（数字输入，`min=0`）
- 车辆：`plateNum`（文本，`maxlength=32`）、`vehicleType`（数字）、`vehicleNormalType`（文本）、`vehicleLogo`、`vehicleSubLogo`、`vehicleColor`、`vehicleModel`、`heightPermitted`（数字，`precision=2`）
- 人脸：`name`、`cardno`、`libName`、`similarity`（数字 0~100）、`identifyFaceUrl`、`visibleLightUrl`

提交策略：**只发送被用户改动过的字段**（对比打开时的快照），减少无效写入；全部未改动时禁用提交按钮。
成功后 `ElMessage.success('修正成功')` + 关闭弹窗 + 刷新列表；`1001` 提示「事件不存在」。

### 4.5 数据看板 `/event/statistics`

顶部筛选：日期时间区间 + 设备编号 + 查询/重置。

- **统计卡**（4 个 `el-card`，栅格一行）：事件总量 `total`、车辆事件数、聚集事件数、人脸事件数（后三者从 `byEventType` 按 code 取，缺失为 0）
- **图表 1**：事件大类占比 —— ECharts 饼图（`byEventType`，`name` + `count`）
- **图表 2**：事件子类分布 —— ECharts 横向柱图（`byTask`，`name` 为空时回退 `task` code）
- **图表 3**：每日趋势 —— ECharts 折线图（`byDay`，x=`date`，y=`count`，`smooth`，带 `dataZoom`）

图表统一封装为 `components/StatChart.vue`（props: `option`），内部 `onMounted` 初始化、`watch(option)` 调 `setOption`、`onBeforeUnmount` 调 `dispose`、监听 `window.resize` 调 `resize`。**按需引入** ECharts 模块（`echarts/core` + 具体图表/组件）以控制包体。
`total === 0` 时三图区域显示 `el-empty`「所选条件下暂无数据」。

## 5. 布局与视觉

- `BasicLayout`：左侧固定宽 210px 深色侧栏（可折叠至 64px），顶栏高 56px 白底（折叠按钮 + 面包屑 + 右侧用户名下拉「退出登录」），内容区浅灰底 `#f5f7fa` + 16px padding
- 菜单：数据看板、事件管理（本期两项）；后续模块的菜单项在路由表中以 `meta.hidden` 预留占位，不渲染
- 视觉基调：Element Plus 默认主题色 `#409eff`，圆角 4px，卡片留白充足，无多余装饰；表格 `stripe` + `size=default`，标签用 `effect="light"`
- 全站中文文案，时间统一 `yyyy-MM-dd HH:mm:ss`（后端已格式化，前端不再二次处理）
- 响应式：`<1200px` 时筛选表单自动换行（`el-form` inline 天然支持），表格容器横向滚动

## 6. 测试策略

**Vitest 单测**（纯逻辑单元，目标：契约与边界）：

| 测试文件 | 覆盖 |
|---------|------|
| `utils/__tests__/params.test.ts` | 参数清洗：剔除 `''`/`null`/`undefined`，保留 `0` 与 `false` |
| `utils/__tests__/token.test.ts` | 令牌读写、`isTokenExpired` 边界（未过期 / 30s 余量内 / 已过期 / user 为 null） |
| `utils/__tests__/download.test.ts` | 文件名生成、`Content-Disposition` 无关性、JSON blob 错误识别 |
| `api/__tests__/request.test.ts` | code=0 拆包、code≠0 抛 `BizError` 且带 msg、401 触发跳转、blob 透传 |
| `api/__tests__/auth.test.ts` | 登录请求体为 `URLSearchParams`、`Content-Type` 为 form-urlencoded、失败抛 `error_description` |
| `stores/__tests__/dict.test.ts` | 枚举缓存只请求一次、`labelOf`/`taskOf` 查表（数字与字符串 code 混用）、大类联动过滤 |
| `composables/__tests__/useEnum.test.ts` | 优先级/状态 → 中文名与 tag 类型映射，未知 code 兜底 |

**运行时验证**（真实后端，admin/123456）：登录 → 列表加载 → 8 项筛选逐个生效 → 详情抽屉（用已有真实数据 id=1 / id=8）→ 修正一条车牌 → 单条删除 + 批量删除 → 导出 xlsx/csv 落盘可打开 → 看板三图有数据 → 手工使令牌失效验证 401 跳登录。

**构建验证**：`npm run build`（含 `vue-tsc --noEmit` 全量类型检查）零错误。

## 7. 未完成模块（后续迭代清单）

| # | 模块 | 路由 | 依赖端点 | 备注 |
|---|------|------|---------|------|
| 1 | 预警待办 | `/handle/todo` | `GET /alert-handles/todo` | 紧急置顶，含 `hitRuleName` |
| 2 | 状态流转 | 待办页内弹窗 | `POST /alert-handles/process`、`/batch-process` | 须按 §5.2 矩阵禁用非法目标状态（0→{1,3}、1→{2,3}、2/3 终态）；`3001` 提示后端 msg；批量结果展示 `{processed, skipped[]}` |
| 3 | 处理记录 | `/handle/records` | `GET /alert-handles/records`、`/{eventId}/history` | 按 `handle_time DESC` |
| 4 | 处理效率统计 | 并入看板 | `GET /alert-handles/statistics` | 5 指标：待处理/处理中/今日已解决/误报率/平均处理分钟 |
| 5 | 布控规则管理 | `/rule/list` | `/alert-rules` 全 7 端点 | 需按 `ruleType` 动态渲染 `matchConfig` 表单（车牌数组 / 车型数组 / `crowdNum` 表达式 `>10` / 设备数组）+ `deviceScope` 多选 + `timeScope` 起止时刻（支持跨零点）；`2001` 提示配置非法 |
| 6 | 规则试跑 | 规则页内抽屉 | `POST /alert-rules/match-test` | 样本事件表单 → 展示 `{matched, reason}`，不落库 |
| 7 | 站内通知 | 顶栏铃铛 + `/notification` | `/notifications` 全 5 端点 | 未读红点轮询 `unread-count`（建议 30s）；`type`/`readFlag` 过滤；越权返 404 |
| 8 | 人脸域增强 | 详情页 | `identifyFaceUrl`/`visibleLightUrl` | 依赖人脸库比对，后端已预留字段 |
| 9 | 船舶舷号 | 事件子类 | `ship_plate` | 预留：当前不在 Python 推送任务列表，字典已有 code |
| 10 | 导出异步化 | — | — | 后端本期同步导出上限 5 万条（`4001`），数据量增长后需改异步任务 + 下载中心 |

**已知环境依赖**：网关 9999 需处于运行状态；若只启了 auth(8081) + event(8082)，需将 `VITE_PROXY_TARGET` 指向 8082 并临时把登录地址改为直连 8081（生产不存在此问题）。
