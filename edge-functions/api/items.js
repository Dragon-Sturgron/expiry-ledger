import { cleanItem, corsHeaders, error, getKV, getUserId, json, listAllKeys, readJson, safeId, requireAccess } from '../utils/shared.js'

function itemKey(userId, id) { return `item_${safeId(userId)}_${safeId(id)}` }
function itemPrefix(userId) { return `item_${safeId(userId)}_` }

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

export async function onRequestGet(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { request } = context
  const kv = getKV(context)
  const userId = getUserId(request)
  if (!userId) return error('缺少 userId', 400)
  const keys = await listAllKeys(kv, itemPrefix(userId))
  const items = []
  for (const key of keys) {
    const item = await kv.get(key, { type: 'json' })
    if (item) items.push(item)
  }
  return json({ ok: true, items })
}

export async function onRequestPost(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { request } = context
  const body = await readJson(request)
  const kv = getKV(context)
  const userId = getUserId(request, body)
  if (!userId) return error('缺少 userId', 400)
  const item = cleanItem(body.item || {})
  item.userId = userId
  await kv.put(itemKey(userId, item.id), JSON.stringify(item))
  return json({ ok: true, item })
}

export async function onRequestPut(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { request } = context
  const body = await readJson(request)
  const kv = getKV(context)
  const userId = getUserId(request, body)
  if (!userId) return error('缺少 userId', 400)
  const incoming = cleanItem(body.item || {})
  const old = await kv.get(itemKey(userId, incoming.id), { type: 'json' })
  const item = { ...(old || {}), ...incoming, userId, createdAt: old?.createdAt || incoming.createdAt, updatedAt: new Date().toISOString() }
  await kv.put(itemKey(userId, item.id), JSON.stringify(item))
  return json({ ok: true, item })
}

export async function onRequestDelete(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { request } = context
  const body = await readJson(request)
  const kv = getKV(context)
  const userId = getUserId(request, body)
  const id = safeId(body.id || '')
  if (!userId || !id) return error('缺少 userId 或 id', 400)
  await kv.delete(itemKey(userId, id))
  return json({ ok: true })
}
