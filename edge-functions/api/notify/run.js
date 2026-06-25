import { corsHeaders, getEnv, getUrl, json, kvGetJson, listAllKeys, readJson, requireKV, safeId } from '../../utils/shared.js'
import { sendTemplateMessage } from '../../utils/wx.js'

export function onRequestOptions() { return new Response(null, { status: 204, headers: corsHeaders() }) }

function diffDays(dateText) {
  if (!dateText) return null
  const today = new Date()
  const t0 = new Date(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}T00:00:00`)
  const t1 = new Date(`${dateText}T00:00:00`)
  return Math.ceil((t1 - t0) / 86400000)
}

function statusInfo(record) {
  const days = diffDays(record.expiryDate)
  if (days === null) return null
  if (days < 0) return { status: 'expired', label: '已过期', daysText: `已过期 ${Math.abs(days)} 天` }
  if (record.reminder && days <= Number(record.remindDays || 0)) return { status: 'expiring', label: '即将到期', daysText: days === 0 ? '今天到期' : `还有 ${days} 天到期` }
  return null
}

async function readProducts(kv) {
  const map = new Map()
  const keys = await listAllKeys(kv, 'product_')
  for (const key of keys) {
    const product = await kvGetJson(kv, key)
    if (product?.id) map.set(safeId(product.id), product)
  }
  return map
}

export async function onRequest(context) {
  const { request } = context
  const { kv, response: kvError } = requireKV(context)
  if (kvError) return kvError
  const body = await readJson(request)
  const secret = getEnv(context, 'NOTIFY_SECRET')
  const inputSecret = getUrl(request).searchParams.get('secret') || body.secret || request.headers.get('x-notify-secret')
  if (secret && inputSecret !== secret) return json({ ok: false, message: 'NOTIFY_SECRET 校验失败' }, 401)

  const recordKeys = await listAllKeys(kv, 'record_')
  const productMap = await readProducts(kv)
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  let sent = 0
  let skipped = 0
  const errors = []

  for (const key of recordKeys) {
    const record = await kvGetJson(kv, key)
    if (!record?.id) { skipped++; continue }
    const userId = record.userId || 'default'
    const info = statusInfo(record)
    if (!info) { skipped++; continue }
    const bind = await kvGetJson(kv, `wechat_${safeId(userId)}`)
    if (!bind?.openid) { skipped++; continue }
    const product = productMap.get(safeId(record.productId)) || record.productSnapshot || {}
    const item = {
      ...record,
      name: product.name || '未命名商品',
      category: product.category || '未分类'
    }
    const notifyKey = `notify_${safeId(userId)}_${safeId(record.id)}_${today}_${info.status}`
    const already = await kv.get(notifyKey)
    if (already) { skipped++; continue }
    try {
      await sendTemplateMessage(context, kv, { openid: bind.openid, item, statusLabel: info.label, daysText: info.daysText })
      await kv.put(notifyKey, JSON.stringify({ at: new Date().toISOString(), recordId: record.id, status: info.status }))
      sent++
    } catch (e) {
      errors.push({ recordId: record.id, message: e.message })
    }
  }
  return json({ ok: true, sent, skipped, errors })
}
