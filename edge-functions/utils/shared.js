export const KV_NAME = 'EXPIRE_KV'

export function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-notify-secret',
    'Content-Type': 'application/json; charset=UTF-8',
    ...extra
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() })
}

export function error(message, status = 400, extra = {}) {
  return json({ ok: false, message, ...extra }, status)
}

export async function readJson(request) {
  try {
    const text = await request.text()
    return text ? JSON.parse(text) : {}
  } catch {
    return {}
  }
}

export function getEnv(context, name, fallback = '') {
  const procEnv = typeof process !== 'undefined' ? process.env : {}
  return context?.env?.[name] || globalThis?.[name] || procEnv?.[name] || fallback
}

export function getKV(context) {
  return context?.env?.[KV_NAME] || globalThis?.[KV_NAME] || null
}

export function requireKV(context) {
  const kv = getKV(context)
  if (!kv) {
    return { kv: null, response: error(`未绑定 ${KV_NAME}，请先在 EdgeOne Makers 项目中绑定 KV 命名空间变量 ${KV_NAME} 后再使用。`, 500, { code: 'KV_NOT_BOUND' }) }
  }
  return { kv, response: null }
}

export async function kvGetJson(kv, key) {
  if (!key) return null
  try {
    const value = await kv.get(key, { type: 'json' })
    if (value && typeof value === 'object') return value
    if (typeof value === 'string') {
      try { return JSON.parse(value) } catch { return null }
    }
    return value || null
  } catch {
    try {
      const value = await kv.get(key)
      if (typeof value === 'string') {
        try { return JSON.parse(value) } catch { return null }
      }
      return value || null
    } catch {
      return null
    }
  }
}

export async function kvPutJson(kv, key, value) {
  return kv.put(key, JSON.stringify(value))
}

export function normalizeKVKey(item) {
  if (!item) return ''
  if (typeof item === 'string') return item
  return item.key || item.name || item.id || ''
}

export async function listAllKeys(kv, prefix) {
  const out = []
  let cursor = undefined
  let guard = 0
  do {
    const args = { prefix, limit: 256 }
    if (cursor) args.cursor = cursor
    const result = await kv.list(args)
    const rawKeys = result?.keys || result?.list || result?.items || result?.data || []
    out.push(...rawKeys.map(normalizeKVKey).filter(Boolean))
    const complete = result?.complete ?? result?.list_complete ?? result?.done
    const nextCursor = result?.cursor || result?.nextCursor || result?.next_cursor || ''
    cursor = complete ? '' : nextCursor
    guard++
  } while (cursor && guard < 50)
  return Array.from(new Set(out))
}

export function safeId(input = '') {
  return String(input).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 120)
}

export function newId(prefix = 'id') {
  const raw = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}_${Math.random()}`
  return `${prefix}_${raw.replace(/[^a-zA-Z0-9]/g, '_')}`
}

export function getUrl(request) {
  return new URL(request.url)
}

export function getUserId(request, body = {}) {
  const url = getUrl(request)
  return safeId(body.userId || url.searchParams.get('userId') || 'default') || 'default'
}

export function settingKey(userId = 'default') {
  return `setting_${safeId(userId || 'default')}`
}

export async function getStoredSettings(kv, userId = 'default') {
  return (await kvGetJson(kv, settingKey(userId))) || {}
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function getAccessPassword(context) {
  return String(getEnv(context, 'ACCESS_PASSWORD') || '').trim()
}

export async function createAccessToken(context) {
  const password = getAccessPassword(context)
  if (!password) return ''
  const salt = String(getEnv(context, 'ACCESS_AUTH_SALT', 'expiry-ledger-access') || 'expiry-ledger-access')
  return sha256Hex(`${salt}:${password}`)
}

export async function checkAccess(context) {
  const password = getAccessPassword(context)
  if (!password) return { required: false, authed: true }
  const token = (context.request?.headers?.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const expected = await createAccessToken(context)
  return { required: true, authed: Boolean(token && expected && token === expected) }
}

export async function requireAccess(context) {
  const result = await checkAccess(context)
  if (result.authed) return null
  return error('请输入正确的访问密码', 401, { code: 'ACCESS_PASSWORD_REQUIRED', required: result.required })
}

export function cleanProduct(product = {}) {
  return {
    id: safeId(product.id || newId('product')),
    name: String(product.name || '').trim().slice(0, 80),
    category: String(product.category || '').trim().slice(0, 40),
    barcode: String(product.barcode || '').trim().slice(0, 120),
    imageUrl: String(product.imageUrl || '').trim().slice(0, 600),
    tags: Array.isArray(product.tags) ? product.tags.map(t => String(t).trim().slice(0, 30)).filter(Boolean).slice(0, 12) : [],
    defaultShelfLifeValue: product.defaultShelfLifeValue === '' ? '' : Number(product.defaultShelfLifeValue || 0),
    defaultShelfLifeUnit: ['day', 'month', 'year'].includes(product.defaultShelfLifeUnit) ? product.defaultShelfLifeUnit : 'day',
    remark: String(product.remark || '').trim().slice(0, 500),
    createdAt: product.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

export function cleanRecord(record = {}) {
  return {
    id: safeId(record.id || newId('record')),
    productId: safeId(record.productId || ''),
    productSnapshot: record.productSnapshot && typeof record.productSnapshot === 'object' ? record.productSnapshot : null,
    quantity: Number(record.quantity || 0),
    warningQty: Number(record.warningQty || 0),
    startDate: String(record.startDate || '').slice(0, 10),
    shelfLifeValue: record.shelfLifeValue === '' ? '' : Number(record.shelfLifeValue || 0),
    shelfLifeUnit: ['day', 'month', 'year'].includes(record.shelfLifeUnit) ? record.shelfLifeUnit : 'day',
    expiryDate: String(record.expiryDate || '').slice(0, 10),
    reminder: Boolean(record.reminder),
    remindDays: Number(record.remindDays || 0),
    location: String(record.location || '').trim().slice(0, 120),
    remark: String(record.remark || '').trim().slice(0, 500),
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

export function legacyItemToRecord(item = {}) {
  const productId = safeId(item.productId || `legacy_product_${item.id || newId('legacy')}`)
  return cleanRecord({
    id: safeId(item.id || newId('record')),
    productId,
    productSnapshot: {
      id: productId,
      name: item.name || '',
      category: item.category || '',
      barcode: item.barcode || '',
      imageUrl: item.imageUrl || '',
      tags: item.tags || []
    },
    quantity: item.quantity,
    warningQty: item.warningQty,
    startDate: item.startDate,
    shelfLifeValue: item.shelfLifeValue,
    shelfLifeUnit: item.shelfLifeUnit,
    expiryDate: item.expiryDate,
    reminder: item.reminder,
    remindDays: item.remindDays,
    location: item.location || '',
    remark: item.remark || '',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  })
}
