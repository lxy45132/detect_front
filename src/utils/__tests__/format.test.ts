import { describe, expect, it } from 'vitest'
import { DASH, dash, percent, textOr } from '@/utils/format'

describe('dash', () => {
  it('空值统一显示破折号', () => {
    expect(DASH).toBe('—')
    expect(dash(null)).toBe('—')
    expect(dash(undefined)).toBe('—')
    expect(dash('')).toBe('—')
    expect(dash('   ')).toBe('—')
  })

  it('数字 0 是有效值，不转破折号', () => {
    expect(dash(0)).toBe('0')
    expect(dash('浙C6B5P8')).toBe('浙C6B5P8')
  })
})

describe('textOr', () => {
  it('默认回退到破折号', () => {
    expect(textOr(null)).toBe('—')
    expect(textOr('')).toBe('—')
  })

  it('支持自定义 fallback', () => {
    expect(textOr(null, '未知')).toBe('未知')
    expect(textOr('南河湫水闸', '未知')).toBe('南河湫水闸')
  })
})

describe('percent', () => {
  it('比率转百分比字符串，默认两位小数', () => {
    expect(percent(0.1234)).toBe('12.34%')
    expect(percent(0.5)).toBe('50.00%')
    expect(percent(0)).toBe('0.00%')
  })

  it('支持自定义小数位', () => {
    expect(percent(0.1234, 1)).toBe('12.3%')
    expect(percent(0.5, 0)).toBe('50%')
  })

  it('NaN 与非数字输入回退 0（看板 total=0 时不得显示 NaN%）', () => {
    expect(percent(NaN)).toBe('0.00%')
    expect(percent(undefined as unknown as number)).toBe('0.00%')
  })
})
