const JSON_HEADERS = {
  'content-type': 'application/json; charset=UTF-8',
  'cache-control': 'no-store'
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  })
}

export function fail(message, status = 400) {
  return json({ ok: false, message }, status)
}

export async function readBody(request) {
  try { return await request.json() } catch { return {} }
}

export function safeUserId(value) {
  const raw = String(value || 'default').trim() || 'default'
  return raw.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64) || 'default'
}

export function getUserIdFromUrl(request) {
  const url = new URL(request.url)
  return safeUserId(url.searchParams.get('userId') || 'default')
}

export function getKV(env = {}) {
  return env.EXPIRE_KV || globalThis.EXPIRE_KV
}

export function requireKV(env = {}) {
  const kv = getKV(env)
  if (!kv) throw new Error('未绑定 KV：请在 EdgeOne Pages 项目中将 KV 命名空间绑定为 EXPIRE_KV')
  return kv
}

export async function getJson(kv, key, fallback) {
  const raw = await kv.get(key)
  if (!raw) return fallback
  try { return JSON.parse(raw) } catch { return fallback }
}

export async function putJson(kv, key, value) {
  await kv.put(key, JSON.stringify(value))
}

export function productsKey(userId) { return `expiry_ledger_${safeUserId(userId)}_products` }
export function recordsKey(userId) { return `expiry_ledger_${safeUserId(userId)}_records` }
export function settingsKey(userId) { return `expiry_ledger_${safeUserId(userId)}_settings` }
export function wechatKey(userId) { return `expiry_ledger_${safeUserId(userId)}_wechat` }

export function defaultSettings() {
  return {
    nearDays: 30,
    defaultRemindDays: 7,
    defaultCategory: '家庭常备',
    categories: ['家庭常备', '感冒发热', '肠胃用药', '消毒护理', '儿童用药', '慢病用药'],
    qiniuAccessKey: '',
    qiniuSecretKey: '',
    qiniuBucket: '',
    qiniuDomain: '',
    qiniuUploadUrl: 'https://upload.qiniup.com',
    wxAppid: '',
    wxSecret: '',
    wxTemplateId: '',
    siteUrl: ''
  }
}

function envValue(env, name) {
  return env?.[name] ?? globalThis?.[name] ?? ''
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function expectedAccessToken(env = {}) {
  const password = String(envValue(env, 'ACCESS_PASSWORD') || '')
  if (!password) return ''
  const secret = String(envValue(env, 'ACCESS_TOKEN_SECRET') || password)
  return sha256(`expiry-ledger:${password}:${secret}`)
}

export function accessPassword(env = {}) {
  return String(envValue(env, 'ACCESS_PASSWORD') || '')
}

export async function isAuthorized(request, env = {}) {
  const password = accessPassword(env)
  if (!password) return true
  const header = request.headers.get('authorization') || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  return token === await expectedAccessToken(env)
}

export async function requireAuth(request, env = {}) {
  if (await isAuthorized(request, env)) return null
  return fail('未授权访问', 401)
}

export function newId(prefix = 'id') {
  if (crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function nowIso() { return new Date().toISOString() }

export function normalizeDomain(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

export function b64url(bytes) {
  let binary = ''
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  for (const b of arr) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
