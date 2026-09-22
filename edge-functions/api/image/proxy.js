import { fail } from '../../utils/shared.js'

function blocked(hostname) {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h === '::1' || h.endsWith('.local')) return true
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true
  const m = h.match(/^172\.(\d+)\./)
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true
  return false
}

export async function onRequest({ request }) {
  const url = new URL(request.url).searchParams.get('url')
  if (!url) return fail('缺少 url 参数')
  let target
  try { target = new URL(url) } catch { return fail('无效图片地址') }
  if (!['http:', 'https:'].includes(target.protocol) || blocked(target.hostname)) return fail('不允许代理该地址', 403)

  const res = await fetch(target.toString(), {
    headers: { 'user-agent': 'Mozilla/5.0 ExpiryLedger/2.0' }
  })
  if (!res.ok) return fail(`图片源站返回 ${res.status}`, 502)
  const headers = new Headers()
  headers.set('content-type', res.headers.get('content-type') || 'application/octet-stream')
  headers.set('cache-control', 'public, max-age=86400')
  return new Response(res.body, { status: 200, headers })
}
