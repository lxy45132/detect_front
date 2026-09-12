import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'

import 'element-plus/dist/index.css'
import '@/styles/index.css'
import '@/styles/layout.css'
import '@/styles/login.css'

const app = createApp(App)
const pinia = createPinia()

// 图标全量注册为全局组件，模板中可直接写 <el-icon><VideoCamera /></el-icon>
for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(name, component)
}

app.use(pinia)
app.use(router)
// 中文语言包：分页「共 x 条」、日期选择器、空态文案等
app.use(ElementPlus, { locale: zhCn })

// pinia 装好后立即恢复会话，路由守卫才能读到 localStorage 里的令牌
useAuthStore().restore()

app.mount('#app')
