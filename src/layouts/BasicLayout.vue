<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const collapse = ref(false)

/**
 * 侧栏菜单：取当前匹配链里的布局记录（`/`）的子路由，过滤掉 hidden 与无 title 项。
 * 由路由表生成而非另写一份菜单配置 —— 后续模块去掉 `hidden` 即自动上线。
 *
 * 刻意不静态 import `@/router` 的 `routes`：`router/index.ts` 反过来动态 import 本组件，
 * 两边静态互引就是循环依赖（一旦有人为了首屏把它改成静态 import 就立即爆）。
 * `RouteRecordNormalized.children` 带的就是同一份路由表数据。
 */
const menus = computed(() => {
  const layoutRecord = route.matched.find((item) => item.path === '/')
  const children = layoutRecord?.children ?? []
  return children
    .filter((child) => child.meta?.title && !child.meta?.hidden)
    .map((child) => ({
      path: `/${child.path}`,
      title: child.meta?.title ?? '',
      icon: child.meta?.icon ?? 'Document'
    }))
})

/** 面包屑：当前匹配链里有 title 的项（`/` 本身无 title，故只显示页面名） */
const breadcrumb = computed(() =>
  route.matched.filter((item) => item.meta?.title).map((item) => item.meta.title ?? '')
)

/** 顶栏用户名：后端令牌只含 username，无 nickname */
const displayName = computed(() => auth.user?.username ?? '未登录')

/** 折叠按钮图标：展开态显示 Fold（可折叠），折叠态显示 Expand */
const collapseIcon = computed(() =>
  collapse.value ? ElementPlusIconsVue.Expand : ElementPlusIconsVue.Fold
)

/** 菜单 icon 以字符串存于 meta，渲染时查全局注册的图标组件表 */
function iconOf(name: string) {
  const icons = ElementPlusIconsVue as Record<string, unknown>
  return icons[name] ?? ElementPlusIconsVue.Document
}

async function handleCommand(command: string): Promise<void> {
  if (command !== 'logout') return
  auth.logout()
  // 用 replace 而非 push：不留历史记录，后退按钮回不到列表页
  await router.replace('/login')
}
</script>

<template>
  <div class="layout">
    <aside class="layout__sidebar" :class="{ 'layout__sidebar--collapsed': collapse }">
      <div class="layout__logo">
        <img src="/favicon.svg" alt="logo" />
        <span v-show="!collapse">Detect 事件后台</span>
      </div>
      <el-menu
        :default-active="route.path"
        :collapse="collapse"
        :collapse-transition="false"
        router
        background-color="#1f2d3d"
        text-color="#bfcbd9"
        active-text-color="#409eff"
      >
        <el-menu-item v-for="menu in menus" :key="menu.path" :index="menu.path">
          <el-icon><component :is="iconOf(menu.icon)" /></el-icon>
          <template #title>{{ menu.title }}</template>
        </el-menu-item>
      </el-menu>
    </aside>

    <div class="layout__main">
      <header class="layout__header">
        <div class="layout__header-left">
          <el-icon class="layout__collapse-btn" @click="collapse = !collapse">
            <component :is="collapseIcon" />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item v-for="(item, index) in breadcrumb" :key="index">
              {{ item }}
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <el-dropdown @command="handleCommand">
          <span class="layout__user">
            <el-icon><User /></el-icon>
            {{ displayName }}
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>

      <main class="layout__content">
        <router-view />
      </main>
    </div>
  </div>
</template>
