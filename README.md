# Detect 事件管理后台前端

Vue 3 + TypeScript 单页后台，对接 `detect-gateway`（Spring Cloud）。本期交付**三个可用页面**：登录、事件管理（列表 / 详情 / 修正 / 删除 / 导出）、数据看板（统计卡 + 三张 ECharts 图）。

数据来源是 Python 视频分析端（yolo26）经 webhook 推送到 Java 端的 `event_records`；前端**不新增事件**，只做查询、字段修正、逻辑删除与导出。

---

## 1. 环境要求

| 项 | 要求 |
|---|---|
| Node | ≥ 18（实测 v24.15.0 / npm 11.12.1） |
| 包管理 | npm（仓库带 `package-lock.json`，勿混用 yarn/pnpm） |
| 后端网关 | `detect-gateway` **9999** 必须运行，前端所有请求经 `/api` → 9999 |
| 后端服务 | `detect-auth` 8081、`detect-event` 8082（均需注册到 Nacos） |
| 中间件 | Docker 容器 `detect-mysql`（宿主机端口 **3307**，库 `detect_auth` / `detect_event`）、`detect-redis`、`detect-nacos`、`detect-minio` |
| 联调账号 | `admin / 123456`（`detect-auth` 的 `AuthDataInitializer` 启动时幂等播种） |

compose 文件：`D:\Code\Java\Detect\docker\docker-compose.yml`

```powershell
cd D:\Code\Java\Detect\docker ; docker compose up -d
```

---

## 2. 快速开始

```powershell
cd D:\Code\Front\Detect
npm install
npm run dev
```

打开 http://localhost:5173/ ，用 `admin / 123456` 登录。未登录访问任何受保护页会被拦到 `/login?redirect=<原路径>`，登录后自动回到原页面。

常用命令（PowerShell 下多条命令用 `;` 分隔，**不要用 `&&`**）：

```powershell
npm run test            # vitest run —— 19 files / 202 tests
npm run test:watch      # 监听模式
npm run test:coverage   # 覆盖率（v8）
npm run type-check      # vue-tsc --noEmit 全量类型检查
npm run build           # type-check + vite build → dist/
npm run preview         # http://localhost:4173/ 本地验生产包（已配 /api 代理）
```

---

## 3. 环境变量

`.env.development` / `.env.production`：

| 变量 | 作用 | 取值 |
|---|---|---|
| `VITE_APP_TITLE` | 页面标题后缀（`<页面名> · <应用名>`） | `Detect 事件管理后台` |
| `VITE_API_BASE` | axios 的 `baseURL`，也是代理/Nginx 需要剥掉的前缀 | `/api` |
| `VITE_PROXY_TARGET` | **仅开发与预览期**的代理目标 | `http://localhost:9999` |

请求链路（开发期）：

```
浏览器  /api/admin/event/event-records/page
  └─ Vite 代理剥掉 /api → http://localhost:9999/admin/event/event-records/page
       └─ 网关 StripPrefix=2 → detect-event 的 /event-records/page
```

登录走 `/api/auth/oauth/token` → 网关 StripPrefix=1 → `detect-auth` 的 `/oauth/token`。

**只启了 auth + event、没启网关时**（临时联调用）：把 `VITE_PROXY_TARGET` 改成 `http://localhost:8082`，**同时**把 `src/api/base-url.ts` 的 `EVENT_BASE` 临时改为 `''` —— 因为剥掉 `/admin/event` 前缀是网关做的，直连 8082 时没人剥，接口会全部 404；登录地址需另配直连 8081。生产不存在此问题，改完记得回滚。

---

## 4. 目录结构

```
src/
├─ api/
│  ├─ base-url.ts        API_BASE / AUTH_BASE / EVENT_BASE，网关前缀只改这一处
│  ├─ interceptors.ts    请求/响应/异常三个拦截器（纯函数）+ BizError
│  ├─ request.ts         axios 实例 + get/post/put/del/getBlob
│  ├─ auth.ts            login（裸 axios，form 编码）
│  ├─ dict.ts            fetchEventEnums
│  ├─ event.ts           事件域 7 个端点（receive 是 @Inner 内部接口，前端不封装）
│  └─ __tests__/
├─ components/
│  ├─ SnapImage.vue           抓拍图：无图 / 403 双态降级
│  ├─ StatChart.vue           ECharts 容器：按需注册、setOption、resize、dispose
│  ├─ EventDetailDrawer.vue   详情抽屉（含处理历史时间线）
│  ├─ EventEditDialog.vue     修正弹窗（按大类分组动态字段）
│  └─ __tests__/
├─ composables/
│  ├─ useEnum.ts          code → 中文名 / el-tag 配色
│  ├─ useEventQuery.ts    列表筛选 + 分页 + 加载/删除/导出编排
│  └─ __tests__/
├─ constants/
│  ├─ error-code.ts       SUCCESS_CODE、ERROR_MESSAGES、TOKEN_KEY、LOCAL_ERROR_CODE、枚举 code 常量
│  └─ dict.ts             FALLBACK_ENUMS（后端不可达时的静态兜底字典）
├─ layouts/BasicLayout.vue    侧栏 + 顶栏 + 面包屑 + 用户下拉
├─ models/
│  ├─ eventEditModel.ts   15 个可修正字段 + toEditForm/diffEditForm/visibleGroups/asNumber
│  ├─ statOptions.ts      三张图的 ECharts option 构造
│  └─ __tests__/
├─ router/index.ts        路由表 + 登录守卫 + 页面标题
├─ stores/
│  ├─ auth.ts             token/user/loading + login/logout/restore
│  ├─ dict.ts             枚举一次性缓存 + 并发去重
│  └─ __tests__/
├─ styles/{index,layout,login}.css
├─ test/
│  ├─ setup.ts            jsdom 缺失 API 打桩（matchMedia / ResizeObserver / Blob.text）
│  └─ element-plus.ts     组件测试按需注入 Element Plus（纯函数测试不付这份成本）
├─ types/api.ts           后端契约类型（唯一真源，逐字段对齐 VO/DTO）
├─ utils/
│  ├─ token.ts            令牌与用户信息读写、isTokenExpired（30s 余量）
│  ├─ params.ts           cleanParams（剔除空值，保留 0 与 false）
│  ├─ format.ts           DASH / dash / textOr / percent
│  ├─ download.ts         导出文件名 + blob 下载 + JSON 错误体识别
│  ├─ navigate.ts         hardNavigate / redirectToLogin
│  ├─ redirect.ts         resolveRedirect（开放重定向防线）
│  └─ __tests__/
├─ views/
│  ├─ PlaceholderView.vue 后续模块占位页
│  ├─ login/index.vue
│  └─ event/{list,statistics}.vue
├─ App.vue · main.ts · env.d.ts
```

**依赖方向（单向，禁止反向）**：

```
views → components / composables → stores → api → utils → types / constants
```

三条硬禁令（违反即架构缺陷）：

1. `models/` 与 `utils/` 是纯函数层，**不得** import `vue` / `pinia` / `element-plus`（`el` 组件的**类型**除外，`statOptions.ts` 对 echarts 也只允许 type-only import）
2. `api/` **不得** import `stores/`
3. `api/request.ts` **不得** import `stores/` 或 `router/` —— 令牌经 `utils/token.ts` 直读 localStorage，401 走 `window.location.assign` 硬跳转，以此规避循环依赖

---

## 5. 本期已实现

**登录页** `/login`
- form 编码提交 `POST /auth/oauth/token`（后端用 `@RequestParam` 接收，发 JSON 会 400）
- 字段校验（用户名必填、密码 ≥ 6 位）、回车提交、同步提交闸防连点重复请求
- 失败展示后端 `error_description`（如「用户名或密码错误」）
- 开放重定向防护：`redirect` 只接受站内绝对路径，`//evil.com`、`/\evil.com`、含 C0 控制符（`/%0A/evil.com`）一律回落 `/event/list`
- 令牌存 localStorage 并补记 `issuedAt`，刷新页面由 `restore()` 恢复；过期（留 30s 余量）直接判定未登录

**事件管理** `/event/list`
- 8 项筛选：设备编号（精确）、事件大类、事件子类（随大类联动）、处理状态、优先级、车牌（模糊）、关键词（车牌 OR 设备名）、抓拍时间区间
- `handleStatus=0`（未处理）与 `priority=0`（普通）是合法筛选值，参数清洗**不会**把它们剔掉
- 13 列表格（含勾选列与固定操作列）、分页（10/20/50/100，默认 20）、跨页保留勾选
- 详情抽屉：头部标签、抓拍图（可放大）、基础信息、按大类动态的业务字段、`sourceData` 元数据、处理历史时间线
- 修正弹窗：15 个可修正字段按大类分组，**只发改动字段**；文本清空发 `''`（后端 `setIgnoreNullValue(true)` 会静默忽略 null）；数字清空弹确认框明示「不支持清空」；无改动时保存按钮禁用
- 单条删除（气泡确认）、批量删除（对话框重确认，文案带条数）
- 导出 xlsx / csv，带当前筛选条件、不带分页参数；超 5 万条时后端返 JSON 错误体，前端识别后提示而非下载一个假 Excel
- 表头**不提供排序**（后端固定 `snap_time DESC`，前端排序是假的）

**数据看板** `/event/statistics`
- 时间区间（起补 `00:00:00`、止补 `23:59:59`）+ 设备编号筛选
- 四张统计卡：事件总量、车辆、聚集、人脸，附占比（总量为 0 时显示 `—` 而非 `NaN%`）
- 三张图：大类占比环形饼图、子类分布横向柱图（最大值在顶部）、每日趋势折线（平滑 + 面积 + dataZoom）
- ECharts **按需引入**（`echarts/core` + 具体图表/组件），随看板路由懒加载

**支撑设施**
- 统一响应拆包：`code === 0` 返回 `data`，非 0 弹后端 `msg` 并抛 `BizError`
- 401 统一出口：清凭据 + 硬跳登录（整页重载顺带清空 Pinia 内存态与字典缓存）
- 字典一次性缓存 + in-flight 并发去重；后端不可达时回落静态字典，不阻塞页面
- 抓拍图降级：MinIO 桶私有时显示「图片不可访问」，无图显示「无抓拍图」（两态刻意区分，避免运维误判）
- 全站中文文案，空值统一显示 `—`；时间字段后端已格式化，前端不二次转换

---

## 6. 未完成模块（后续迭代）

路由已注册但 `meta.hidden = true`，实现后去掉 `hidden` 即上线：

| # | 模块 | 路由 | 依赖端点 |
|---|---|---|---|
| 1 | 预警待办 | `/handle/todo` | `GET /alert-handles/todo` |
| 2 | 状态流转 | 待办页内弹窗 | `POST /alert-handles/process`、`/batch-process` |
| 3 | 处理记录 | `/handle/records` | `GET /alert-handles/records` |
| 4 | 处理效率统计 | 并入看板 | `GET /alert-handles/statistics` |
| 5 | 布控规则管理 | `/rule/list` | `/alert-rules` 全 7 端点 |
| 6 | 规则试跑 | 规则页内抽屉 | `POST /alert-rules/match-test` |
| 7 | 站内通知 | 顶栏铃铛 + `/notification` | `/notifications` 全 5 端点 |
| 8 | 人脸域增强 | 详情页 | 人脸库比对（后端未实现） |
| 9 | 船舶舷号 | 事件子类 | `ship_plate`（Python 端未推送） |
| 10 | 导出异步化 | — | 需后端提供异步任务端点 |

每项「本期未做的原因」见 [docs/IMPLEMENTATION_LOG.md](docs/IMPLEMENTATION_LOG.md) 第 ③ 节。

---

## 7. 生产部署

```powershell
npm run build
```

产物在 `dist/`，任意静态服务器托管即可。Nginx 参考配置：

```nginx
server {
    listen 80;
    server_name detect-admin.example.com;

    root /var/www/detect-admin;   # 放 dist/ 的内容
    index index.html;

    # history 路由：未命中静态文件的路径一律回 index.html，否则刷新 /event/list 会 404
    location / {
        try_files $uri $uri/ /index.html;
    }

    # /api → 网关。proxy_pass 结尾的斜杠决定 /api 前缀是否被吃掉：
    #   带斜杠  http://127.0.0.1:9999/  → 网关收到 /admin/event/...（正确，等价于开发期 Vite 的 rewrite）
    #   不带斜杠 http://127.0.0.1:9999   → 网关收到 /api/admin/event/...（404）
    location /api/ {
        proxy_pass http://127.0.0.1:9999/;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 导出大文件：放宽超时并关闭缓冲，避免流式响应被攒在 Nginx 里
        proxy_read_timeout 120s;
        proxy_buffering off;
    }
}
```

对应关系：`VITE_API_BASE=/api`（构建时注入，前端代码不含任何绝对后端地址）+ `proxy_pass` **结尾带斜杠** ⇒ 网关收到 `/admin/event/...`，与开发期 Vite 的 `rewrite: ^/api → ''` 完全等价。生产环境 `.env.production` 不需要 `VITE_PROXY_TARGET`。

**抓拍图显示**：MinIO 桶 `detect` 默认私有，浏览器直连 `snapUrl` 会 403（前端已降级为「图片不可访问」占位，不影响其它功能）。要正常显示图片，运维侧执行一次即可，无需改代码：

```powershell
mc anonymous set download myminio/detect
```

---

## 8. 更多文档

- 实施过程、逐项验证实测记录、已知问题与技术债：[docs/IMPLEMENTATION_LOG.md](docs/IMPLEMENTATION_LOG.md)
- 设计规格：`docs/superpowers/specs/2026-09-12-detect-admin-web-design.md`
- 实施计划：`docs/superpowers/plans/2026-09-12-detect-admin-web.md`
- 后端接口契约：`yolo26/docs/superpowers/specs/2026-09-10-event-management-api-design.md`
