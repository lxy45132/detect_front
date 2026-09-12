import { ERROR_MESSAGES } from '@/constants/error-code'

/** 本地时间戳 yyyyMMdd_HHmmss（用于导出文件名） */
function timestamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/**
 * 生成导出文件名。
 *
 * 刻意不解析响应的 Content-Disposition —— 后端用 URLEncoder 编码（空格变 `+`），
 * 解析需处理编码歧义；前端已知 format，自行拼名更可靠。
 */
export function buildExportFilename(prefix: string, format: 'xlsx' | 'csv'): string {
  return `${prefix}_${timestamp()}.${format}`
}

/** 导出超限时后端返 HTTP 200 + JSON 错误体（code 4001），需与文件流区分 */
export function isJsonBlob(blob: Blob): boolean {
  return (blob.type || '').toLowerCase().includes('application/json')
}

/** 从 JSON 错误 blob 中取出可展示的 msg：后端 msg → ERROR_MESSAGES[code] → 通用兜底 */
export async function readErrorFromBlob(blob: Blob): Promise<string> {
  try {
    const body = JSON.parse(await blob.text()) as { code?: number; msg?: string }
    if (body.msg) return body.msg
    if (typeof body.code === 'number' && ERROR_MESSAGES[body.code]) return ERROR_MESSAGES[body.code]
  } catch {
    // 非法 JSON，落到兜底
  }
  return '导出失败'
}

/** 触发浏览器下载并回收 objectURL 与 DOM 节点（否则重复导出会累积） */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
