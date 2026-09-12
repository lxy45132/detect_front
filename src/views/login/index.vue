<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules, type InputInstance } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { resolveRedirect } from '@/utils/redirect'

interface LoginForm {
  username: string
  password: string
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const formRef = ref<FormInstance>()
const passwordRef = ref<InputInstance>()
const form = reactive<LoginForm>({ username: '', password: '' })

/**
 * 本地提交闸。**必须**存在：`auth.loading` 只在 `auth.login()` 内置真，而那发生在
 * `await formRef.validate()` 之后 —— 同一 tick 内连点按钮时，每次点击看到的 `auth.loading`
 * 都还是 false，守卫全部放行（实测：连点 4 次发出 4 条 /oauth/token 请求）。
 * 这个 ref 在任何 await 之前同步置真，才能真正挡住重复提交。
 */
const submitting = ref(false)

/** 按钮的忙碌态：校验中与请求中都算，避免校验阶段按钮看着可点 */
const busy = computed(() => submitting.value || auth.loading)

const rules: FormRules<LoginForm> = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' }
  ]
}

/**
 * 登录成功后的回跳目标由 `utils/redirect.ts` 的纯函数解析（开放重定向防护已单测覆盖）。
 */
async function handleSubmit(): Promise<void> {
  if (!formRef.value || busy.value) return
  // 同步置闸，早于第一个 await：`auth.loading` 要到 validate 之后才置真，
  // 单靠它挡不住同一 tick 的连点（实测：4 次点击 = 4 条 /oauth/token 请求）
  submitting.value = true
  try {
    const valid = await formRef.value.validate().catch(() => false)
    if (!valid) return

    await auth.login(form.username.trim(), form.password)
    ElMessage.success('登录成功')

    // 导航单独 try：此时令牌已落盘，若目标页的异步 chunk 加载失败（典型场景：
    // 刚发版，用户停在旧登录页），不能让异常落进登录失败的 catch 里弹「登录失败」——
    // 用户其实已登录。改用整页跳转，让浏览器取新的 index.html 与新的 chunk 清单。
    const target = resolveRedirect(route.query.redirect)
    try {
      // 用 replace 而非 push：不留历史记录，避免后退回到登录页
      await router.replace(target)
    } catch {
      window.location.assign(target)
    }
  } catch (error) {
    // 登录走裸 axios（不经业务拦截器），错误提示必须在这里弹，否则用户看不到任何反馈。
    // 文案已由 api/auth.ts 从后端 error_description 提取。
    ElMessage.error((error as Error).message || '登录失败')
    passwordRef.value?.focus()
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login">
    <div class="login__card">
      <div class="login__brand">
        <h1 class="login__brand-title">Detect 事件管理后台</h1>
        <p class="login__brand-sub">视频智能分析事件汇聚 · 布控预警 · 处置留痕</p>
        <ul class="login__brand-list">
          <li>事件检索与导出</li>
          <li>布控规则引擎</li>
          <li>预警处置状态机</li>
          <li>站内通知</li>
        </ul>
      </div>

      <div class="login__form-wrap">
        <h2 class="login__form-title">账号登录</h2>
        <p class="login__form-tip">请使用管理员账号登录系统</p>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          size="large"
          @keyup.enter="handleSubmit"
        >
          <el-form-item prop="username">
            <el-input
              v-model="form.username"
              placeholder="用户名"
              clearable
              :maxlength="64"
            >
              <template #prefix>
                <el-icon><User /></el-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item prop="password">
            <el-input
              ref="passwordRef"
              v-model="form.password"
              type="password"
              placeholder="密码"
              show-password
              :maxlength="64"
            >
              <template #prefix>
                <el-icon><Lock /></el-icon>
              </template>
            </el-input>
          </el-form-item>
        </el-form>

        <el-button
          class="login__submit"
          type="primary"
          size="large"
          :loading="busy"
          :disabled="busy"
          @click="handleSubmit"
        >
          {{ busy ? '登录中…' : '登 录' }}
        </el-button>

        <p class="login__hint">默认账号 admin / 123456（由 detect-auth 启动时幂等播种）</p>
      </div>
    </div>
  </div>
</template>
