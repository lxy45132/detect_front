import { describe, expect, it } from 'vitest'
import { TOKEN_KEY } from '@/constants/error-code'

/**
 * 测试基座冒烟：只验证三件事 —— vitest 能跑、`@` 别名在测试环境生效、jsdom 环境生效。
 * 业务用例不写在这里。
 */
describe('测试基座冒烟', () => {
  it('vitest 能执行断言', () => {
    expect(1 + 1).toBe(2)
  })

  it('@ 别名在测试环境生效', () => {
    expect(typeof TOKEN_KEY).toBe('string')
    expect(TOKEN_KEY.length).toBeGreaterThan(0)
  })

  it('jsdom 环境生效', () => {
    expect(typeof window).toBe('object')
  })
})
