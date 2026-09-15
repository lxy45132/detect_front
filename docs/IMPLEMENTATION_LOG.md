# Detect 事件管理后台前端 — 实施日志

> 分支：`feat/admin-web`（一阶段，已合入 `main`）+ `feat/handle-phase2a`（二阶段 A 组，自 `main@6828abc` 切出）
> 计划：`docs/superpowers/plans/2026-09-12-detect-admin-web.md`（一阶段）、`docs/superpowers/plans/2026-09-15-detect-phase2a.md`（二阶段 A 组）
> 规格：`docs/superpowers/specs/2026-09-12-detect-admin-web-design.md`、`docs/superpowers/specs/2026-09-15-detect-phase2a-design.md`
> 后端契约：`yolo26/docs/superpowers/specs/2026-09-10-event-management-api-design.md`（29 端点，一阶段用 9 个、二阶段 A 组再用 5 个）

---

## ① 实施概览

**起止**：2026-09-12 起，2026-09-13 止（代码与单测全部完成；前后端联调第 1 批已完成，剩余项由使用方最终测试）

### Task 完成状态

| Task | 内容 | 状态 | 提交 | 实测 |
|---|---|---|---|---|
| 1 | Vitest 测试基座 | 完成 | `e658eba` | 1 file / 3 tests |
| 2 | utils 纯函数层 | 完成 | `c946826` | 6 files / 37 tests |
| 3 | axios 请求层 | 完成 | `3784690` | 7 files / 54 tests |
| 4 | API 业务模块（9 端点） | 完成 | `383d49c` + `dbfcbde` | 9 files / 68 tests |
| 5 | Pinia stores + useEnum | 完成 | `ac41f4d` | 12 files / 100 tests |
| 6 | 路由 / 守卫 / BasicLayout | 完成 | `9e34361` | build EXIT=0，浏览器 6 项实测 |
| 7 | 登录页 | 完成 | `93f5cf6` | form 编码契约实测；连点缺陷已修已复验 |
| 8 | SnapImage | 完成 | `a7c3b39` | 13 files / 107 tests |
| 9 | 事件列表页 + useEventQuery | 完成 | `762d1bd` | 15 files / 151 tests |
| 10 | 详情抽屉 + 修正弹窗 | 完成 | `4c24f88` | 18 files / 191 tests |
| 11 | 数据看板 | 完成 | `cfbdfab` | 19 files / 202 tests |
| 12 | 端到端回归 + 生产构建 | 完成（Step 1~3 已实测通过） | `d771ff0` | 配置 / 全量单测 / 覆盖率 / 生产构建均已通过；Step 4~6（preview 冒烟、401 两路径、跳页一致性）待使用方测试 |
| 13 | README + 本日志 | 完成 | 本次提交 | — |
| — | 评审修复（Task 9~12） | 完成 | `0c1499f` | 202 tests / build EXIT=0 |
| — | 最终整分支评审 | 完成 | — | **✅ 可以合并**，0 Critical / 0 Important；10 项延后 Minor 均判定可延后；新提 3 项跨文件 Minor 中 2 项已修（色板 code 走常量、`1001` 收归 `BIZ_CODE`），1 项延后（`statistics.vue` 跳层直连 api） |

### 测试与构建实测值

- **单测**：`npm run test` → **19 files / 202 tests 全绿**
- **覆盖率**（`npm run test:coverage`，v8）：All files 57.71% stmts / 90.53% branch；分层看 **utils 100%、models 100%、composables 100%、stores 100%**、api 92.1%、components 79.04%、views 0%（计划未要求视图层单测，视图行为改由真实后端联调覆盖）
- **类型检查**：`npm run type-check`（`vue-tsc --noEmit`）→ **EXIT=0**
- **生产构建**：`npm run build` → **EXIT=0**，无 `> 500 kB` 警告（`chunkSizeWarningLimit: 1500`）
- **chunk 体积**（`dist/assets`）：element 1063.01 kB、statistics 548.41 kB（含按需 ECharts，路由级懒加载）、vue 108.69 kB、index 64.71 kB、list 23.08 kB；JS 合计 1815.10 kB
- **ECharts 按需引入对照**：移除 `manualChunks.echarts` 前 = echarts 独立 chunk 554.72 kB + statistics 6.10 kB = 560.82 kB；移除后 = statistics 548.41 kB，**净减 12.4 kB**。全仓唯一的 `from 'echarts'` 是 `statOptions.ts` 的 **type-only import**（编译期擦除），无根入口运行时引入
- **测试基座性能**：组件测试改为按需注入 Element Plus（`src/test/element-plus.ts`）后 setup 450 ms；曾在 `setup.ts` 全局注入导致 setup 95.73 s、全量 3.55 s → 13.05 s

### 代码评审记录

| 范围 | 结论 | 修复 |
|---|---|---|
| Task 1~2 | 规格 ✅ / 质量 Approved，3 Minor | 延后（见 ④） |
| Task 3~4 | 规格 ✅ / 质量需修改，3 Important + 10 Minor | `dbfcbde`，再评审 **12 项全部 ADDRESSED** |
| Task 5~8 | 规格 ✅ / 质量需修改，3 Important + 10 Minor | `4a6c209`；再评审发现修复自身引入 1 Important（开放重定向 C0 控制符绕过）+ 5 Minor → `eb286da`，**6 项全部 ADDRESSED** |
| Task 9~12 | 规格 ✅ / 质量需修改，1 Important + 4 Minor | `0c1499f`，再评审 **4 项全部 ADDRESSED、无新问题** |

评审抓到并已修的真实缺陷（挑重要的记）：

1. **登录按钮连点发出多条请求** —— `auth.loading` 只在 `auth.login()` 内置真，而那发生在 `await formRef.validate()` **之后**，同一 tick 的连点全部通过守卫（浏览器实测：4 次点击 = 4 条 `/oauth/token`）。修法：加同步置位的本地 `submitting` 闸。复验：同 tick 4 次点击 = **1 条**
2. **开放重定向绕过** —— `resolveRedirect` 未拦 ASCII tab/LF/CR：`?redirect=/%0A/evil.com` 经 vue-router 解码成字面换行，WHATWG URL 解析会删除这些控制符从而变成 `http://evil.com/`；配合导航失败兜底的 `location.assign` 就成了可用漏洞。修法：拒绝 C0 控制符与 DEL，并补 12 例单测
3. **行级「修正」弹两条「修正成功」** —— 弹窗内部与列表页 `onSaved` 各弹一次（Task 9 时弹窗还是空壳，Task 10 填充后漏了回撤）
4. **字典 store 的 orphan promise 复活 state** —— `reset()` 后在飞请求的 `finally` 会把 `loaded` 置真并写入静态兜底，导致整个会话不再重试真实字典；另 `let task!` 事后赋值在同步抛出时踩 TDZ，会让 `pending` 永久停在 rejected promise 上（所有受保护导航失败到刷新为止）。修法：deferred promise + 身份守卫
5. **`el-image` 的 `<img>` 在 onMounted 后下一个 tick 才进 DOM** —— 组件测试必须 `await nextTick()`（生产代码无问题）
6. **jsdom 25 的 `Blob` 没有 `text()`/`arrayBuffer()`/`stream()`** —— `readErrorFromBlob` 会静默落到兜底文案；修法是在测试 setup 里用 jsdom 确实提供的 `FileReader` 补桩（带特性检测），业务代码保持标准 `blob.text()`
7. **SnapImage 占位文案被裁切** —— 60×40 缩略图内容宽仅 58 px，放不下「图片不可访问」（6 CJK ≈ 72 px），硬切会让两个占位看不出区别，而「有图但取不到」与「本来就没图」必须可区分。修法：紧凑态隐去图标 + 文案换行

---

## ② 逐项验证实测记录

> 记录规则：**通过** = 有实际观察到的证据；**待使用方测试** = 本次未验，说明原因；**无法验证** = 环境或数据不具备条件。全篇只记实测结果，不写未经确认的结论。

### 联调环境

- 后端：`detect-gateway` 9999 / `detect-auth` 8081 / `detect-event` 8082 均运行，网关 `/actuator/health` = `{"status":"UP"}`
- 中间件：Docker `detect-mysql`（3307）、`detect-nacos` healthy，`detect-redis`、`detect-minio` Up
- 数据基线：`event_records` 共 8 行，未删除（`del_flag='0'`）5 行 = id **1 / 5 / 6 / 7 / 8**；id=8 = `testcar-cam01`、车牌 `浙C6B5P8`、`vehicle_color` 原为 NULL、优先级紧急、处理状态未处理
- MinIO 桶 `detect` 仍为私有（未配匿名读）

### Task 7 登录页（计划 Step 2 的 10 项）

| # | 验证项 | 结果 | 备注 |
|---|---|---|---|
| 1 | `admin`/`123456` 登录成功跳 `/event/list` | **通过** | 弹「登录成功」；侧栏仅「事件管理」「数据看板」（4 个 hidden 占位未渲染）；顶栏显示 `admin` |
| 2 | 错误密码弹「用户名或密码错误」 | **通过** | HTTP **400** + `{"error":"invalid_grant","error_description":"用户名或密码错误"}`；页面弹的是 `error_description` 而非机器码 |
| 3 | 空用户名点登录 → 校验拦截不发请求 | **通过** | 2 条红字「请输入用户名」「请输入密码」，Network 无 `/oauth/token`；`admin`/`123` → 「密码至少 6 位」且无请求 |
| 4 | 密码框回车 = 点登录 | **通过** | 回车后 Network 新增 1 条 `POST /api/auth/oauth/token`，Form Data 与点击一致 |
| 5 | 连点登录只发一次请求 | **通过（修后复验）** | 首次实测 4 次点击 = 4 条请求（缺陷）；加同步 `submitting` 闸后：同 tick 4 次点击 = **1 条**，按钮 9 ms 内变「登录中…」+ disabled |
| 6 | 登录后刷新仍是登录态 | **通过** | F5 后仍在 `/event/list`，重新发出 `enums` 与 `page` 请求（`restore()` 生效） |
| 7 | 未登录访问 `/event/list` → 带 redirect 跳登录 | **通过** | 落 `/login?redirect=/event/list`。注：计划原写 `%2Fevent%2Flist`，实测 Vue Router **不编码** query 里的 `/`；访问 `/` 时因 redirect 在守卫前已解析，得到的也是 `/event/list` 而非 `/`（计划文本已据实修正） |
| 8 | 已登录访问 `/login` → 跳 `/event/list` | **通过** | 自动重定向，未停留登录页 |
| 9 | `?redirect=//evil.com` 登录后不外跳 | **通过** | 落 `/event/list`，无外跳；另有 12 例单测覆盖 `\`、C0 控制符、`https://`、数组形态等绕过手法 |
| 10 | 退出登录清凭据、后退不回列表 | **待使用方测试** | 本次联调未点验退出按钮；`logout()` 有 2 条单测（清 state + localStorage + 字典缓存），跳转用 `replace` 不留历史 |
| 附 | 登录请求为 form 编码（关键回归点） | **通过** | `POST /api/auth/oauth/token`、`content-type: application/x-www-form-urlencoded`、Form Data 逐字 `username=admin&password=123456&grant_type=password&scope=server` |
| 附 | 字典一次性加载 | **通过** | `GET /api/admin/event/event-categories/enums` 200 / `code:0`；`eventType` 3 项、`task` 6 项、`handleStatus` 4 项、`priority` 3 项、`ruleType` 4 项；`eventType|handleStatus|priority` 的 code 是 number、`task|ruleType` 是 string，与 `String(code)` 查表策略一致 |
| 附 | 桌面宽度（>768px）双列布局 | **待使用方测试** | 自动化浏览器视口锁在 489 px 且截图失败，`<768px` 媒体查询使品牌区隐藏；已用 DOM 几何间接确认双列成立，缺一张真实桌面截图 |

### Task 9 事件列表页（计划 Step 3 的 8 项筛选 + 附加项）

| # | 验证项 | 结果 | 备注 |
|---|---|---|---|
| 1 | 无条件加载出分页数据、total 正确 | **通过** | `?current=1&size=20`（**无空值键**）；表格 5 行；「共 5 条」与 `SELECT COUNT(*) WHERE del_flag='0'` 一致 |
| 2 | 设备编号精确匹配 | **通过** | `deviceNum=testcar-cam01` → 仅 id=8 |
| 3 | 大类筛选生效且子类下拉联动收窄 | **通过** | 选「车辆」→ 子类只剩 车辆类型/车牌识别/车牌未识别/船舶舷号；选「聚集」→ 只剩 人员聚集 |
| 4 | 处理状态选「未处理」（code=0）能查出数据 | **通过** | `?current=1&size=20&handleStatus=0` —— **0 未被 `cleanParams` 剔掉**；返回 id 8/5，状态标签均「未处理」 |
| 5 | 优先级选「普通」（code=0）同上 | **通过** | `?...&priority=0`；返回 id 6/1 |
| 6 | 车牌模糊匹配 | **通过** | `plateNum=%E6%B5%99C`（浙C）→ id=8（浙C6B5P8） |
| 7 | 关键词命中车牌或设备名 | **通过** | `keyword=%E6%B0%B4%E9%97%B8`（水闸）→ id 7/6/5/1（设备名「南河湫水闸」） |
| 8 | 时间区间两端闭合 | **待使用方测试** | 自动化无法驱动 `el-date-picker` 面板；需人工确认 `startTime`/`endTime` 格式为 `yyyy-MM-dd HH:mm:ss`（URL 中空格编码为 `%20`） |
| 附 | 翻页与改每页条数 | **通过** | 改 10 → `current=1&size=10`；改回 20 → `current=1&size=20`（**页码归 1**） |
| 附 | 13 列与标签配色 | **通过** | 列头逐字核对：勾选/抓拍图/ID/设备/事件类型/车牌/车型/人数/抓拍时间/优先级/处理状态/命中规则/操作；表头无 `sortable` |
| 附 | 子类显示中文名而非 code | **通过** | 「车辆 + 车牌识别」「聚集 + 人员聚集」「车辆 + 车辆类型」 |
| 附 | 抓拍图双态降级 | **通过** | snapUrl 非空的 id=8/1 显示「**图片不可访问**」（MinIO 私有桶 403）；snapUrl 为 NULL 的 id=7/6/5 显示「**无抓拍图**」——两态在真实 UI 确实可区分 |
| 附 | 导出 xlsx | **通过** | `?format=xlsx`（**不含** `current`/`size`）；200；`application/vnd.ms-excel;charset=utf-8`；魔数 `50 4b 03 04`（**PK zip**，真 xlsx）；4255 字节 |
| 附 | 导出 csv | **通过** | `?format=csv`；200；`text/csv;charset=utf-8`；魔数 `ef bb bf`（**UTF-8 BOM**）；表头「事件ID,设备编号,设备名称,…」中文正常 |
| 附 | 带筛选导出 | **通过** | `?format=csv&eventType=300&handleStatus=0` → 表头 + 1 行，与 DB 一致（`handleStatus=0` 在导出路径也没被清洗） |
| 附 | 浏览器下载的文件名 | **待使用方测试** | 自动化无法访问下载管理器；前端命名规则为 `事件记录_yyyyMMdd_HHmmss.xlsx|.csv`（单测已覆盖正则），需人工确认落盘文件名与 Excel 打开效果 |
| 附 | 单条删除 / 批量删除 | **待使用方测试** | 会改动 `del_flag`，留给使用方在自己的数据上验；单测已覆盖「末页删空回退一页」「批量删后清选中回第 1 页」「失败返 false 不重载」 |

### Task 10 详情抽屉与修正弹窗（计划 Step 5 的 14 项）

| # | 验证项 | 结果 | 备注 |
|---|---|---|---|
| 1 | 抽屉打开显示全部分区 | **通过** | 右滑；标题「事件详情」；头部「事件 #8」+ 车辆/紧急/未处理 + 抓拍时间；七区齐全 |
| 2 | 子类名正确显示（验证 `sourceData.task` 路径） | **通过** | 显示「车牌识别」；`sourceData` 内确有 `"task":"license_plate"`，而详情 VO 无 `task` 字段 |
| 3 | `similarity` 输入框无小数位 | **无法验证** | 库中唯一的人脸事件 id=4 已 `del_flag='1'`，UI 上打不开人脸事件；改由单测锁定 `precision=0`（`EDITABLE_FIELDS` 约束断言） |
| 4 | 改 `vehicleColor` 为「红色」保存 | **通过** | 弹「修正成功」；抽屉与列表同步刷新，抽屉内颜色显示「红色」 |
| 5 | **DB 校验**编码未写坏 | **通过** | `SELECT HEX(vehicle_color) … WHERE id=8` → **`E7BAA2E889B2`**，正是「红色」的 UTF-8 hex |
| 6 | 清空 `plateNum` 保存 → DB 里是空串而非旧值 | **通过** | PUT 体 = **`{"plateNum":""}`**；DB `CHAR_LENGTH(plate_num)=0` 且 `plate_num IS NULL=0` —— 确实是空串（验证发的是 `''` 而非 null） |
| 7 | 清空 `crowdNum` → 弹「不支持清空」确认框，取消后 DB 未变 | **部分通过** | DB 侧已验：id=5 的 `crowd_num` 仍为 **15**（未被改动）；确认框本身**待使用方测试**（自动化未能驱动 `el-input-number` 清空）。该路径有 jsdom 单测覆盖，且已核对 EP 源码：`verifyValue` 中 `value === "" && valueOnClear === null → return null`，与「数字清空进 `ignored`」的设计一致 |
| 8 | 不改任何字段点保存 → 提示且无 PUT | **通过** | 保存按钮**禁用**（diff 驱动），旁边显示「没有需要保存的改动」，Network 无 PUT |
| 9 | 只改一个字段 → PUT body 只含该字段 | **通过** | PUT `/api/admin/event/event-records/8` 体 = **`{"vehicleColor":"红色"}`**，无其它键 |
| 10 | 车辆事件看不到人脸字段组 | **通过** | 详情业务字段只有车辆 8 项；修正弹窗无「人脸信息」分组、无「身份证号」等字段 |
| 11 | 人脸事件看不到车辆字段组 | **无法验证** | 同第 3 项：无人脸事件数据；改由单测锁定 `visibleGroups(100)` → `['common','face']`、组件测试断言人脸事件不出现「车辆信息」 |
| 12 | 处理历史时间线有数据 | **通过** | 显示「2026-09-12 15:12:30 / 系统 → 未处理 / 规则命中：联调-设备布控(testcar)（设备 testcar-cam01 在布控时段内）」；用的是详情 VO 内嵌的 `handleHistory`，**未**另请 `/alert-handles/{eventId}/history` |
| 13 | 抓拍图能放大预览 | **待使用方测试** | 抽屉内 `SnapImage` 已开 `preview`；因 MinIO 私有桶图片本身加载失败（显示「图片不可访问」），放大效果需先配匿名读才好验 |
| 14 | 关闭再打开另一条不闪现上一条 | **通过** | 关 id=8 后开 id=5，直接显示 id=5；聚集事件业务字段只有「聚集人数：15」 |
| 附 | 未改动的数字字段未被误写 0 | **通过** | DB 校验：`crowd_num` 与 `height_permitted` 仍为 **NULL**（若表单把 NULL 显示成 0，diff 会把 0 一起发出去写坏数据 —— 实测没有） |
| 附 | `sourceData` 元数据展示 | **通过** | `<pre>` 内为格式化 JSON（`bbox`/`task`/`trackId`/`confidence`/`plateColor`/`plateNumber` 等），无多余引号转义 |
| 附 | 命中规则展示 | **通过** | 「联调-设备布控(testcar)（设备时段）」—— `hitRule.ruleName` + `ruleType` 中文翻译 |

**测试数据还原**（按**实际原值**还原，计划里假设的「蓝色」并非原值）：

```sql
UPDATE event_records SET vehicle_color = NULL, plate_num = '浙C6B5P8' WHERE id = 8;
-- 校验：vehicle_color IS NULL = 1，HEX(plate_num) = E6B599433642355038（浙C6B5P8）
```

### Task 11 数据看板（计划 Step 4 的 6 项）

| # | 验证项 | 结果 | 备注 |
|---|---|---|---|
| 1 | 无条件加载 → 三图有数据、四卡与 total 自洽 | **待使用方测试** | 看板页未在浏览器点验；`statistics` 端点本身已由 API 直连验证可用（返回 `total` + `byEventType`/`byTask`/`byDay`） |
| 2 | 选近 7 天 → 折线只有 7 个点 | **待使用方测试** | 同上 |
| 3 | 空区间 → 三图空态、卡片 0 与 `—`（非 `NaN%`） | **待使用方测试** | `percent(NaN)`→`'0.00%'`、`total=0`→`—` 均有单测；页面级空态待人工确认 |
| 4 | 横向柱最大值在顶部 | **待使用方测试** | `taskBarOption` 的 `[...byTask].reverse()` 有单测锁定类目顺序 |
| 5 | `dataZoom` 滑块可拖动 | **待使用方测试** | option 含 `inside` + `slider` 两项（单测已断言），交互待人工确认 |
| 6 | 切页往返图表正常重绘、无 ECharts 警告 | **待使用方测试** | `onBeforeUnmount` 已移除 resize 监听并 `dispose()`；实际往返待人工确认 |

> 说明：看板 6 项全部留待使用方测试，是因为联调第 2 批（看板 / 删除 / 401 / 跳页一致性 / preview 冒烟）在使用方要求下改由其本人最终执行。相关逻辑均有单测覆盖，页面级视觉与交互未做人工确认。

### Task 12 端到端回归

| # | 验证项 | 结果 | 备注 |
|---|---|---|---|
| 1 | 全量单测 | **通过** | `npm run test:coverage` → **19 files / 202 tests 全绿**；纯函数层（utils/models/composables/stores）覆盖率 **100%** |
| 2 | 生产构建 | **通过** | `npm run build` → **EXIT=0**（`vue-tsc --noEmit` + Vite）；最大 chunk = element 1063.01 kB（gzip 341.39 kB），无 `>500 kB` 警告（阈值配为 1500） |
| 3 | `vite.config.ts` proxy 提为常量并同时挂 `server`/`preview` | **通过** | 已改；保持函数式导出（`vitest.config.ts` 依赖它解析 `@` 别名） |
| 4 | preview 冒烟（登录 / 列表 / 详情 / 看板） | **待使用方测试** | `npm run preview` 已确认可启动并监听 4173，但四条主流程未在 4173 上人工跑过 |
| 5 | 401 路径 A（令牌被篡改） | **待使用方测试** | 需人工在 Console 改 `detect_access_token` 后刷新；单测已覆盖拦截器 401 分支（只跳一次、不弹提示）与 `redirectToLogin`（清两个键 + 编码 redirect） |
| 6 | 401 路径 B（令牌自然过期） | **待使用方测试** | 需人工改 `detect_login_user.expiresIn=1`；`isTokenExpired` 的 30s 余量判定有 5 条单测，守卫拦截逻辑有浏览器实测（未登录跳转）佐证 |
| 7 | 跳页一致性 4 项 | **待使用方测试** | 筛选重置（无 `keep-alive`，刻意决策）、翻页后开关抽屉页码不变、勾选保留（`reserve-selection` + `row-key`）、修正后分页位置不变 |

---

## ③ 未完成模块清单（照规格 §7 的 10 项，补「本期未做的原因」）

| # | 模块 | 路由 | 依赖端点 | 备注 | 本期未做的原因 |
|---|---|---|---|---|---|
| 1 | 预警待办 | `/handle/todo` | `GET /alert-handles/todo` | 紧急置顶，含 `hitRuleName` | 使用方选定本期范围为「登录 + 事件管理 + 看板」 |
| 2 | 状态流转 | 待办页内弹窗 | `POST /alert-handles/process`、`/batch-process` | 须按 §5.2 矩阵禁用非法目标状态（0→{1,3}、1→{2,3}、2/3 终态）；`3001` 提示后端 msg；批量结果展示 `{processed, skipped[]}` | 同上；且状态机矩阵需独立设计评审 |
| 3 | 处理记录 | `/handle/records` | `GET /alert-handles/records`、`/{eventId}/history` | 按 `handle_time DESC` | 同上（详情的历史时间线已复用 VO 内嵌的 `handleHistory`，未另请端点） |
| 4 | 处理效率统计 | 并入看板 | `GET /alert-handles/statistics` | 5 指标：待处理/处理中/今日已解决/误报率/平均处理分钟 | 同上；看板已预留卡片位 |
| 5 | 布控规则管理 | `/rule/list` | `/alert-rules` 全 7 端点 | 需按 `ruleType` 动态渲染 `matchConfig` 表单（车牌数组 / 车型数组 / `crowdNum` 表达式 `>10` / 设备数组）+ `deviceScope` 多选 + `timeScope` 起止时刻（支持跨零点）；`2001` 提示配置非法 | 同上；动态表单是独立子项目，需单独出规格 |
| 6 | 规则试跑 | 规则页内抽屉 | `POST /alert-rules/match-test` | 样本事件表单 → 展示 `{matched, reason}`，不落库 | 依赖第 5 项 |
| 7 | 站内通知 | 顶栏铃铛 + `/notification` | `/notifications` 全 5 端点 | 未读红点轮询 `unread-count`（建议 30 s）；`type`/`readFlag` 过滤；越权返 404 | 同 1；顶栏已预留铃铛位 |
| 8 | 人脸域增强 | 详情页 | `identifyFaceUrl`/`visibleLightUrl` | 依赖人脸库比对，后端已预留字段 | 详情抽屉与修正弹窗**已渲染/可编辑**这两个字段，缺的是人脸库比对功能本身（后端未实现）；本期库中唯一的人脸事件已被逻辑删除，无法在 UI 上验收 |
| 9 | 船舶舷号 | 事件子类 | `ship_plate` | 预留：当前不在 Python 推送任务列表，字典已有 code | 上游 Python 推送任务未接入，无数据可展示（字典与下拉已含该项，实测选「车辆」大类时可见「船舶舷号」） |
| 10 | 导出异步化 | — | — | 后端本期同步导出上限 5 万条（`4001`），数据量增长后需改异步任务 + 下载中心 | 需后端先提供异步任务端点；前端已实现「HTTP 200 + JSON 错误体」的识别与提示分支 |

> 第 8、9 两项的原因与其他项不同：不是「范围裁剪」，而是前端侧其实已经做了字段渲染，缺的是后端能力或上游数据。

---

## ④ 已知问题与技术债

### 文档与实际不符（已订正或需订正，代码无需改）

1. **csv 导出编码**：设计规格 §3.7 与计划写「后端以 GBK 输出（Excel 中文友好）」，**实测为 UTF-8 with BOM**（魔数 `ef bb bf`，表头按 UTF-8 正确解码；按 GBK 解码得「锘夸簨浠禝D」乱码，反证其为 UTF-8）。前端「按原字节下载、不转码」对两种编码都成立，Excel 打开不乱码，故**代码无需改**，规格文本需订正
2. **redirect 参数编码**：计划 Task 6/7 预期 `/login?redirect=%2F…`，实测为 `/login?redirect=/event/list` —— `/` 的 `redirect` 在守卫执行前已被解析，且 Vue Router 不编码 query 里的 `/`。计划文本已据实修正
3. **`manualChunks.echarts` 的量化预期偏大**：预检判断它会把「全量 echarts（1 MB+）」打进 chunk，实测 Rollup 仍做了 tree-shake，只多 12.4 kB。移除后总量更小且确认无根入口运行时引入，方向正确，但代价是丢了 echarts 独立 chunk 的缓存粒度（页面代码变更会导致 echarts 一起重新下载）

### 环境类（不影响浏览器使用）

4. **带 `Expect: 100-continue` 的请求经 Vite 代理 → Netty 网关会 500**（Node llhttp `Parse Error: Data after "Connection: close"`）。判别实验：无 Expect → 200 + token；带 Expect → 500；`Connection: keep-alive` → 200。**浏览器不发 Expect，前端不受影响**；用 curl / PowerShell 写联调脚本时需去掉该头（`Invoke-WebRequest` 默认会带）或改用 Node
5. **jsdom 25 的 `Blob` 无 `text()`/`arrayBuffer()`/`stream()`** → `src/test/setup.ts` 用 `FileReader` 补 `Blob.prototype.text`（带特性检测守卫），业务代码保持标准写法
6. **`el-image` 的 `<img>` 在 onMounted 后下一个 tick 才进 DOM** → 组件测试必须 `await nextTick()`
7. **抓拍图依赖 MinIO 匿名读策略**：桶 `detect` 未配公读时全列表 403（已在 `SnapImage` 降级为「图片不可访问」，根因在部署配置：`mc anonymous set download myminio/detect`）

### 后端契约造成的前端限制

8. **数字字段无法置空**：后端 `BeanUtil.copyProperties(..., setIgnoreNullValue(true))` + MyBatis-Plus `updateById`（NOT_NULL 策略）使 null 永远进不了 SET 子句。前端只能拦截提示（弹确认框告知「以下数字字段不支持清空，将被忽略」），彻底解决要后端改 DTO 语义
9. **详情 VO 没有 `task` 字段**：子类名必须从 `sourceData.task` 取，读 `detail.task` 恒为 `undefined`。若后端将来在详情 VO 补 `task`，前端这处 computed 可以简化
10. **列表不支持排序**：后端固定 `ORDER BY snap_time DESC`，故表头刻意不设 `sortable`（设了是假排序，会误导用户）

### 交互决策（不是缺陷，但需知晓）

11. **无 `keep-alive`**：跳页后列表筛选条件重置。刻意决策 —— 缓存列表会让「看板与列表筛选条件不一致但看不出来」，排查成本高于重填一次表单
12. **退出登录不加二次确认**：计划只要求「logout → `router.replace('/login')`」，误点即退出（无数据丢失风险）
13. **`removeOne` 成功后回查当前页**而非本地摘行：每次单删多一个分页请求，换来 `total` 与服务端不漂移（并发删除、他人新增都能立刻反映）

### 评审延后未修的技术债（4 项 Minor）

14. `StatQuery` 定义在 `api/event.ts`，按「`types/api.ts` 承载全部 DTO」的约定应移过去
15. `isLoggedIn` 是 Pinia getter（= computed），`Date.now()` 非响应式 → 页面长时间挂着（令牌 12 h 有效期）后不会自动失效，要等首个请求 401 由拦截器兜底。严格修法需引入每分钟 tick 的时钟 ref
16. 登录页 `router.replace` 失败 → `hardNavigate` 的兜底分支没有 SFC 级测试（计划 Task 7 的 Files 不含测试文件；该分支已委托给有 5 例单测的 `hardNavigate`）
17. `dict.load(true)` 的并发去重缺失：两次 force 会发两条请求（orphan 守卫已保证先完成的那个不会污染后一个的 `pending`）。当前无 `force` 调用点，将来加「刷新字典」按钮时需一并处理
18. `el-input-number` 的绑定样板代码在修正弹窗里重复（`:model-value="asNumber(...)"` + `@update:model-value`），可抽 `NumberField.vue`，本期未做

### 需人工确认的运行时行为（评审提出、diff 层面无法判断）

19. `el-table` 的 `reserve-selection` 在批量删除后，EP 内部保留的 `row-key` 集合是否会自动剔除已删除行、`@selection-change` 会不会把陈旧 row 回吐（`removeMany` 只清了本地 `selection` ref，未调 `tableRef.clearSelection()`）
20. 详情抽屉内嵌的 `EventEditDialog` 与列表页外层那个同时挂载时，两层 Teleport 到 body 的弹层 z-index 与焦点回收表现（代码逻辑无冲突，未做真机确认）

---

## ⑤ 二阶段 A 组（预警处置闭环）

**起止**：2026-09-15 起、2026-09-15 止（代码与单测全部完成；前后端联调与浏览器实测按约定由**使用方**执行）

**分支**：`feat/handle-phase2a`（自 `main@6828abc` 切出）

**范围**：4 个模块（预警待办 / 状态流转弹窗 / 处理记录 / 处理效率统计），后端 5 个新端点（`/alert-handles/{todo, process, batch-process, records, statistics}`）

### Task 完成状态

| Task | 内容 | 状态 | 提交 | 实测 |
|---|---|---|---|---|
| 1 | 类型补全 + 状态机矩阵纯函数（StatQuery 收归 types） | 完成 | `057d6d7` | 31 tests（矩阵 16 格 + 边界 4 + allowedTargets 5 + allowedTargetsForAny 6） |
| 2 | API 层 `api/handle.ts`（5 端点薄透传） | 完成 | `33f3af8` | 6 tests |
| 3 | `useTodoQuery` composable | 完成 | `b096899` | 16 tests（fix round 后 18） |
| 4 | `HandleProcessDialog` 弹窗 | 完成 | `8e35736` | 23 tests（fix round 后 27） |
| — | Task 1-4 层评审修复 | 完成 | `155c8a5` | 284 tests 全绿 |
| 5 | 预警待办页 `/handle/todo` + 路由替换 | 完成 | `1bdb20e` | build EXIT=0（视图页不写单测，同一阶段约定） |
| 6 | 处理记录页 `/handle/records` + `useHandleRecords` + 路由替换 | 完成 | `808c209` | 18 tests + build EXIT=0 |
| 7 | 看板并入处理效率 5 卡（双统计并行独立容错） | 完成 | `5b87d83` | build EXIT=0 |
| 8 | 回归 + 文档收尾 | 完成 | 本次提交 | 302 tests / coverage 55.71% / build EXIT=0 |

### 测试与构建实测值

- **单测**：`npm run test` → **24 files / 302 tests 全绿**（一阶段基线 19/202 + 二阶段 A 组 5 files / 100 tests）
- **覆盖率**（`npm run test:coverage`，v8）：All files **55.71% stmts / 90.95% branch / 84.96% funcs**；分层看：
  - `models/handleStatusMachine.ts` **100% / 100% / 100% / 100%**
  - `composables/useTodoQuery.ts` **100% / 90.47% / 100% / 100%**（未覆盖分支为 `?? []` 兜底）
  - `composables/useHandleRecords.ts` **100% / 88.88% / 100% / 100%**（同上）
  - `api/handle.ts` 5 端点均有专用用例锁定路径/方法/参数透传
  - `views/*` **0%**（计划明写「视图页不写单测」，视图行为改由使用方浏览器联调覆盖）
- **类型检查**：`npm run type-check`（`vue-tsc --noEmit`）→ **EXIT=0**
- **生产构建**：`npm run build` → **EXIT=0**，14.49s，无 `> 500 kB` 警告（`chunkSizeWarningLimit: 1500`）
- **chunk 体积变化**（对比一阶段末 `d771ff0`）：
  - `statistics` chunk 560.75 → **562.09 kB**（+1.34 kB，5 卡与 `Promise.allSettled` 双统计）
  - `handle` chunk（0.29 → **0.34 kB**）+5 端点薄封装
  - 新增 `todo` chunk **11.97 kB**（gzip 4.69）、`records` chunk **4.56 kB**（gzip 2.16）—— 路由级懒加载
  - JS 合计（不含 element/vue 两个大 chunk）**约 +18 kB**

### 代码评审记录

| 范围 | 结论 | 修复 |
|---|---|---|
| Task 1-4 逻辑层 | 规格 ✅ / 质量需修改，**0 Critical / 1 Important / 4 Minor** | `155c8a5`；再评审 **5 项全部 ADDRESSED**、fix diff 无新增 Critical/Important/Minor，仅 2 项 deferred minor |
| Task 5-8 视图层 + 收尾 | 待层评审 | — |
| 整分支 | 待末尾评审 | — |

### 评审抓到并已修的真实缺陷

1. **批量成功后经 X/ESC 关结果视图 → `processed` 永不发出** —— EP dialog 默认 `showClose=true` 与 `closeOnPressEscape=true`，用户可绕开 footer「关闭」按钮关窗；原实现只在 footer 按钮 emit `processed`，X/ESC 路径丢通知 → 后端已流转但前端列表不刷新，用户再点旧行就撞 `3001`。修法：新增 `batchDone` ref + `notifyIfBatchDone()` 幂等闸，覆盖 closeResult / X / ESC / 取消 / 外部关窗 / in-flight 关窗**五路径**；模板追加 `:show-close="!submitting"` + `:close-on-press-escape="!submitting"` + 取消按钮 `:disabled="submitting"` **三重防护**
2. **`useTodoQuery.reloadCurrent` 缺末页收敛** —— 单条流转到终态（2/3）会让该行从待办消失，若本页只剩这 1 行则回查后停在越界空页。修法：加载后若 `rows.length === 0 && page > 1`，clamp 到 `Math.max(1, Math.ceil(total/size))` 并重拉，与一阶段 `removeOne` 语义对齐
3. **`HandleProcessDialog` 的 watch 监听面过宽** —— 原 `watch([modelValue, events, presetTarget], ..., { deep: true })` 在宿主写 `:events="[row]"` 或传不稳定 computed 时，父级任何一次重渲染都会让 events 换引用 → 弹窗还开着但用户已选目标态与已输入 remark 被清空。修法：收窄为仅监听 `modelValue` 跳变（false→true 重置、true→false 兵底），另加 `watch(allowed)` 只在 events 变化时失效非法 target、不动 remark
4. **测试盲区**：结果视图 X/ESC 关闭路径、`events: []` 空态、submitting 期间 X 隐藏、末页收敛、首页拉空不重拉 —— 全部补上（+6 用例）
5. **结果视图断言用裸数字**（`toContain('2') + toContain('1')`）无法捕捉「成功数/跳过数写反」—— 改用归一化空白后的完整文案 `toContain('成功2条，跳过1条')`

### 逐项验证实测记录（规格 §6 五条）

> 记录规则：**通过** = 有实际观察到的证据；**待使用方测试** = 本次未验，说明原因。本期联调按约定全部由使用方执行，故五项均标「待使用方测试」，并列出前端已实现的可验证部分。

| # | 验证项（规格 §6） | 结果 | 备注 |
|---|---|---|---|
| 1 | 单条流转后待办列表变化（→处理中 留在列表；→已处理/误报 消失且 total 收缩） | **待使用方测试** | 需真实后端 + DB；`reloadCurrent` 末页收敛分支已由单测覆盖（`useTodoQuery.test.ts` 新增 2 例） |
| 2 | 批量混合状态的部分成功提示与 skipped 明细 | **待使用方测试** | 需后端产生 skipped；组件测试已锁定「成功 X 条，跳过 Y 条」完整文案与 `#id 原因` 明细渲染 |
| 3 | 非法流转（如直接对已处理事件发请求）弹后端 `3001` msg | **待使用方测试** | 拦截器统一提示已由一阶段验证；矩阵驱动的按钮禁用已在待办页消除主要非法路径（终态行只剩「详情」按钮） |
| 4 | 看板筛选同时驱动两组统计、效率 5 卡与 DB 口径一致 | **待使用方测试** | 双请求并行 + 独立容错由 `Promise.allSettled` 保证；`percent(falseRate)`、`avgHandleMinutes.toFixed(1)` 已按后端口径实现；「今日已解决」卡加脚注「按自然日统计，不受筛选限制」 |
| 5 | 误报流转后处理记录页出现对应留痕（原状态→新状态正确） | **待使用方测试** | 需真实后端；`fromStatus tag → toStatus tag` 与 `fromStatus=null 显破折号` 分支已在 records.vue 实现 |

### 本期新增已知问题与技术债（接一阶段编号）

21. **`useTodoQuery`/`useHandleRecords` 无并发去重（AbortController）** —— 与一阶段 `useEventQuery.load` 同构（全仓无 AbortController），非本期引入；快速连点查询按钮时前一个请求的响应仍会覆盖后一个，但拦截器的 `ERR_CANCELED` 静默分支需配合 signal 才能触发。属既定架构取舍，未来统一处理
22. **`HandleProcessDialog` 的 `watch(allowed)` 在宿主传字面量引用时每次父级重渲染都 fire** —— callback 内有 `!list.includes(target.value)` 短路，无副作用，仅极小 GC 压力；宿主接线（todo.vue）已用 `processEvents` ref 传稳定引用，实际不触发
23. **`reloadCurrent` 末页收敛二次 load 仍空时无进一步兜底** —— 与 `removeOne` 语义一致，属既定设计取舍；生产环境末页删空的罕见场景才触发
24. **`HandleProcessDialog` 契约与规格 §3.2 的偏离**（Ruling）—— 不设 `mode: 'single'|'batch'` prop，由 `events.length` 推导。规格允许此简化；调用方少一个 prop，语义等价。日志与计划均注明
25. **清偿一阶段延后 Minor #14**：`StatQuery` 已从 `api/event.ts` 迁至 `types/api.ts`（跨事件/处理两域共用）；`api/event.ts` 保留 `export type { StatQuery }` 兼容 re-export。实测：全仓无任何文件从 `@/api/event` 导入 StatQuery（一阶段内部自用），兼容 re-export 为零消费者的无害冗余，为未来消费点保留
