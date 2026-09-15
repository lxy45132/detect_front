import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDictStore } from '@/stores/dict'

/** 路由 meta 契约：title 供菜单/面包屑/页面标题，hidden 为后续模块占位开关，public 免鉴权 */
declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    icon?: string
    hidden?: boolean
    public?: boolean
  }
}

const BasicLayout = () => import('@/layouts/BasicLayout.vue')

/**
 * 路由表（具名导出供 `createRouter` 与单测使用）。
 *
 * **菜单不由这里导出驱动**：`BasicLayout` 从 `route.matched` 的布局记录取 children 生成菜单，
 * 勿反向静态 import 本文件的 `routes`（本文件动态 import BasicLayout，两边静态互引就是循环依赖）。
 *
 * `meta.hidden = true` 的项先注册但不渲染进菜单 —— 对应设计规格 §7 的后续模块，
 * 实现完成后去掉 hidden 即上线，避免路由指向不存在的组件。
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
      /* ===== 后续迭代模块（设计规格 §7），实现后逐个取消 hidden ===== */
      {
        path: 'handle/todo',
        name: 'HandleTodo',
        component: () => import('@/views/handle/todo.vue'),
        meta: { title: '预警待办', icon: 'Bell' }
      },
      {
        path: 'handle/records',
        name: 'HandleRecords',
        component: () => import('@/views/handle/records.vue'),
        meta: { title: '处理记录', icon: 'Tickets' }
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

/**
 * 登录守卫。三条规则顺序不可换：
 * 1. 公开页免鉴权直接放行
 * 2. 未登录访问受保护页 → /login?redirect=<目标 fullPath>
 * 3. 已登录访问登录页 → /event/list；其余已登录导航在字典未加载时先 await 加载再放行
 *    （加载失败 store 内部已回落静态字典，不阻塞）
 *
 * 规则 3 的判据用 `to.name === 'Login'` 而非 `to.meta.public`：将来新增其他公开页
 * （注册页 / 找回密码 / 对外分享页）时，不应把已登录用户从那些页面踢回首页。
 *
 * 刷新页面后 Pinia 是空的，故先幂等 restore（main.ts 也调一次，此处兜住极端时序）。
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.token) auth.restore()

  if (to.meta.public) {
    if (auth.isLoggedIn && to.name === 'Login') return { path: '/event/list' }
    return true
  }

  if (!auth.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  await useDictStore().load()
  return true
})

/** 页面标题：`<页面名> · <应用名>` */
router.afterEach((to) => {
  const base = import.meta.env.VITE_APP_TITLE || 'Detect 事件管理后台'
  document.title = to.meta.title ? `${to.meta.title} · ${base}` : base
})

export default router
