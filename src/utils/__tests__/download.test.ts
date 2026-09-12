import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildExportFilename, downloadBlob, isJsonBlob, readErrorFromBlob } from '@/utils/download'

describe('buildExportFilename', () => {
  it('生成 事件记录_yyyyMMdd_HHmmss.xlsx', () => {
    expect(buildExportFilename('事件记录', 'xlsx')).toMatch(/^事件记录_\d{8}_\d{6}\.xlsx$/)
  })

  it('csv 格式使用 .csv 后缀', () => {
    expect(buildExportFilename('事件记录', 'csv')).toMatch(/^事件记录_\d{8}_\d{6}\.csv$/)
  })
})

describe('isJsonBlob', () => {
  it('识别 JSON blob（导出超限时后端返 200 + {code:4001}）', () => {
    expect(isJsonBlob(new Blob(['{}'], { type: 'application/json' }))).toBe(true)
    expect(isJsonBlob(new Blob(['{}'], { type: 'application/json;charset=UTF-8' }))).toBe(true)
  })

  it('Excel 流不是 JSON', () => {
    expect(
      isJsonBlob(
        new Blob(['x'], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        })
      )
    ).toBe(false)
    expect(isJsonBlob(new Blob(['x'], { type: '' }))).toBe(false)
  })
})

describe('readErrorFromBlob', () => {
  it('一级：解析 R 包装取出后端 msg', async () => {
    const blob = new Blob([JSON.stringify({ code: 4001, msg: '导出数量超限', data: null })], {
      type: 'application/json'
    })
    await expect(readErrorFromBlob(blob)).resolves.toBe('导出数量超限')
  })

  it('二级：msg 缺失时查 ERROR_MESSAGES 兜底文案', async () => {
    const blob = new Blob([JSON.stringify({ code: 4001 })], { type: 'application/json' })
    await expect(readErrorFromBlob(blob)).resolves.toBe(
      '导出数量超限（单次上限 5 万条），请缩小筛选范围'
    )
  })

  it('三级：非法 JSON 返回通用兜底文案', async () => {
    const blob = new Blob(['not-json'], { type: 'application/json' })
    await expect(readErrorFromBlob(blob)).resolves.toBe('导出失败')
  })
})

describe('downloadBlob', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('创建临时 <a download>、点击一次、回收 objectURL 与 DOM 节点', () => {
    const click = vi.fn()
    const created: HTMLAnchorElement[] = []
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = { href: '', download: '', click, style: {} } as unknown as HTMLAnchorElement
      if (tag === 'a') created.push(el)
      return el
    }) as typeof document.createElement)
    const append = vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n)
    const remove = vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n)
    const revoke = vi.fn()
    Object.defineProperty(globalThis.URL, 'createObjectURL', {
      value: () => 'blob:x',
      configurable: true
    })
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', { value: revoke, configurable: true })

    downloadBlob(new Blob(['x']), 'a.xlsx')

    expect(created).toHaveLength(1)
    expect(created[0].download).toBe('a.xlsx')
    expect(created[0].href).toBe('blob:x')
    expect(click).toHaveBeenCalledOnce()
    expect(append).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith('blob:x')
  })
})
