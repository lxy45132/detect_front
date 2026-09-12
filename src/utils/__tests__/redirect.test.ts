import { describe, expect, it } from 'vitest'
import { resolveRedirect } from '@/utils/redirect'

describe('resolveRedirect 站内路径', () => {
  it('合法站内路径原样返回', () => {
    expect(resolveRedirect('/event/list')).toBe('/event/list')
    expect(resolveRedirect('/event/statistics')).toBe('/event/statistics')
    expect(resolveRedirect('/handle/todo')).toBe('/handle/todo')
  })

  it('带 query 与 hash 的站内路径原样返回', () => {
    expect(resolveRedirect('/event/list?eventType=200')).toBe('/event/list?eventType=200')
    expect(resolveRedirect('/rule/list#top')).toBe('/rule/list#top')
  })

  it('数组形态（vue-router 对重复 query 给数组）取第一项', () => {
    expect(resolveRedirect(['/event/list', '/event/statistics'])).toBe('/event/list')
    expect(resolveRedirect(['//evil.com'])).toBe('/event/list')
    expect(resolveRedirect([])).toBe('/event/list')
  })
})

describe('resolveRedirect 开放重定向防护', () => {
  it('拒绝协议相对地址 //evil.com', () => {
    expect(resolveRedirect('//evil.com')).toBe('/event/list')
    expect(resolveRedirect('///evil.com')).toBe('/event/list')
  })

  it('拒绝反斜杠形态 /\\evil.com（location.assign 会解析成 http://evil.com/）', () => {
    expect(resolveRedirect('/\\evil.com')).toBe('/event/list')
    expect(resolveRedirect('/\\\\evil.com')).toBe('/event/list')
    expect(resolveRedirect('/event\\list')).toBe('/event/list')
  })

  it('拒绝绝对外站地址', () => {
    expect(resolveRedirect('https://evil.com')).toBe('/event/list')
    expect(resolveRedirect('http://evil.com/x')).toBe('/event/list')
    expect(resolveRedirect('javascript:alert(1)')).toBe('/event/list')
  })

  it('编码形态不会被误放行', () => {
    // %2F 不会被解码成 authority，但仍以 / 开头且不含 //，落到站内路径；
    // 关键是它不会把用户送出站
    expect(resolveRedirect('/%2F%2Fevil.com')).toBe('/%2F%2Fevil.com')
    expect(resolveRedirect('/?x=//evil.com')).toBe('/?x=//evil.com')
  })

  it('拒绝自指 /login（否则登录成功后又跳回登录页）', () => {
    expect(resolveRedirect('/login')).toBe('/event/list')
    expect(resolveRedirect('/login?redirect=/x')).toBe('/event/list')
  })

  it('空值与非字符串回落首页', () => {
    expect(resolveRedirect(undefined)).toBe('/event/list')
    expect(resolveRedirect(null)).toBe('/event/list')
    expect(resolveRedirect('')).toBe('/event/list')
    expect(resolveRedirect(123)).toBe('/event/list')
    expect(resolveRedirect({ path: '/event/list' })).toBe('/event/list')
  })

  it('支持自定义 fallback', () => {
    expect(resolveRedirect('//evil.com', '/')).toBe('/')
    expect(resolveRedirect(null, '/event/statistics')).toBe('/event/statistics')
  })
})
