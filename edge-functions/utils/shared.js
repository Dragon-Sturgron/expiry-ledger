export const KV_NAME = 'EXPIRE_KV'

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=UTF-8'
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

const memory = new Map()
function createMemoryKV() {
  return {
    async get(key, options) {
      const value = memory.get(key)
      if (value == null) return null
      const type = typeof options === 'string' ? options : options?.type
      if (type === 'json') {
        try { return JSON.parse(value) } catch { return null }
      }
      return value
    },
    async put(key, value) {
      memory.set(key, typeof value === 'string' ? value : JSON.stringify(value))
    },
    async delete(key) { memory.delete(key) },
    async list({ prefix = '', limit = 256, cursor = '' } = {}) {
      const keys = Array.from(memory.keys()).filter(k => k.startsWith(prefix)).sort()
      const start = cursor ? Math.max(0, keys.findIndex(k => k > cursor)) : 0
      const page = keys.slice(start, start + limit)
      const last = page[page.length - 1]
      return { complete: start + limit >= keys.length, cursor: start + limit >= keys.length ? null : last, keys: page.map(key => ({ key })) }
    }
  }
}

export function getKV(context) {
  const kv = context?.env?.[KV_NAME] || globalThis?.[KV_NAME]
  if (kv) return kv
  console.warn(`[临期账本] 未找到 ${KV_NAME} KV 绑定，当前仅使用内存KV，部署后请在 EdgeOne Makers 绑定命名空间。`)
  return createMemoryKV()
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
  return safeId(body.userId || url.searchParams.get('userId') || '')
}

export async function listAllKeys(kv, prefix) {
  const out = []
  let cursor = undefined
  do {
    const result = await kv.list({ prefix, limit: 256, cursor })
    out.push(...(result?.keys || []).map(x => x.key))
    cursor = result?.cursor
    if (result?.complete) break
  } while (cursor)
  return out
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

export function cleanItem(item = {}) {
  return {
    id: safeId(item.id || newId('item')),
    name: String(item.name || '').trim().slice(0, 80),
    category: String(item.category || '').trim().slice(0, 40),
    imageUrl: String(item.imageUrl || '').trim().slice(0, 600),
    tags: Array.isArray(item.tags) ? item.tags.map(t => String(t).trim().slice(0, 30)).filter(Boolean).slice(0, 12) : [],
    quantity: Number(item.quantity || 0),
    warningQty: Number(item.warningQty || 0),
    startDate: String(item.startDate || '').slice(0, 10),
    shelfLifeValue: item.shelfLifeValue === '' ? '' : Number(item.shelfLifeValue || 0),
    shelfLifeUnit: ['day', 'month', 'year'].includes(item.shelfLifeUnit) ? item.shelfLifeUnit : 'day',
    expiryDate: String(item.expiryDate || '').slice(0, 10),
    reminder: Boolean(item.reminder),
    remindDays: Number(item.remindDays || 0),
    barcode: String(item.barcode || '').trim().slice(0, 120),
    remark: String(item.remark || '').trim().slice(0, 500),
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}
