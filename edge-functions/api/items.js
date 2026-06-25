import { cleanItem, corsHeaders, error, requireKV, getUserId, json, listAllKeys, kvGetJson, kvPutJson, readJson, safeId, requireAccess } from '../utils/shared.js'

function itemKey(userId, id) { return `item_${safeId(userId || 'default')}_${safeId(id)}` }

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

async function getAllItems(kv) {
  const keys = await listAllKeys(kv, 'item_')
  const items = []
  for (const key of keys) {
    const item = await kvGetJson(kv, key)
    if (item?.id) items.push(item)
  }
  const seen = new Set()
  return items.filter(item => {
    const id = safeId(item.id || '')
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

async function findExistingItemKey(kv, id, preferredUserId = 'default') {
  const safe = safeId(id || '')
  if (!safe) return ''
  const preferredKey = itemKey(preferredUserId || 'default', safe)
  const preferred = await kvGetJson(kv, preferredKey)
  if (preferred?.id) return preferredKey

  const keys = await listAllKeys(kv, 'item_')
  for (const key of keys) {
    const item = await kvGetJson(kv, key)
    if (safeId(item?.id || '') === safe) return key
  }
  return preferredKey
}

export async function onRequestGet(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { kv, response: kvError } = requireKV(context)
  if (kvError) return kvError
  const items = await getAllItems(kv)
  return json({ ok: true, items })
}

export async function onRequestPost(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { request } = context
  const body = await readJson(request)
  const { kv, response: kvError } = requireKV(context)
  if (kvError) return kvError
  const userId = getUserId(request, body) || 'default'
  const item = cleanItem(body.item || {})
  item.userId = userId
  await kvPutJson(kv, itemKey(userId, item.id), item)
  return json({ ok: true, item })
}

export async function onRequestPut(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { request } = context
  const body = await readJson(request)
  const { kv, response: kvError } = requireKV(context)
  if (kvError) return kvError
  const userId = getUserId(request, body) || 'default'
  const incoming = cleanItem(body.item || {})
  if (!incoming.id) return error('缺少 id', 400)
  const key = await findExistingItemKey(kv, incoming.id, userId)
  const old = await kvGetJson(kv, key)
  const item = { ...(old || {}), ...incoming, userId: old?.userId || userId, createdAt: old?.createdAt || incoming.createdAt, updatedAt: new Date().toISOString() }
  await kvPutJson(kv, key, item)
  return json({ ok: true, item })
}

export async function onRequestDelete(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { request } = context
  const body = await readJson(request)
  const { kv, response: kvError } = requireKV(context)
  if (kvError) return kvError
  const userId = getUserId(request, body) || 'default'
  const id = safeId(body.id || '')
  if (!id) return error('缺少 id', 400)
  const key = await findExistingItemKey(kv, id, userId)
  await kv.delete(key)
  return json({ ok: true })
}
