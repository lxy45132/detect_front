import { describe, expect, it } from 'vitest'
import { cleanParams } from '@/utils/params'

describe('cleanParams', () => {
  it('剔除空串、null、undefined', () => {
    expect(cleanParams({ a: '', b: null, c: undefined, d: 'x' })).toEqual({ d: 'x' })
  })

  it('保留数字 0 与布尔 false（处理状态 0=未处理、优先级 0=普通 是合法筛选值）', () => {
    expect(cleanParams({ handleStatus: 0, priority: 0, enabled: false })).toEqual({
      handleStatus: 0,
      priority: 0,
      enabled: false
    })
  })

  it('剔除只有空白的字符串', () => {
    expect(cleanParams({ keyword: '   ' })).toEqual({})
  })

  it('入参为 undefined 时返回空对象', () => {
    expect(cleanParams(undefined as unknown as Record<string, unknown>)).toEqual({})
  })

  it('不修改入参对象', () => {
    const input = { a: '', b: 1 }
    cleanParams(input)
    expect(input).toEqual({ a: '', b: 1 })
  })
})
