import { cleanRecord, corsHeaders, error, getUserId, json, kvGetJson, kvPutJson, legacyItemToRecord, listAllKeys, readJson, requireAccess, requireKV, safeId } from '../utils/shared.js'

function recordKey(userId, id) { return `record_${safeId(userId || 'default')}_${safeId(id)}` }

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

async function getAllRecords(kv) {
  const keys = await listAllKeys(kv, 'record_')
  const records = []
  for (const key of keys) {
    const record = await kvGetJson(kv, key)
    if (record?.id) records.push(record)
  }

  // 兼容旧版 item_ 数据，避免升级后旧数据不显示
  const legacyKeys = await listAllKeys(kv, 'item_')
  for (const key of legacyKeys) {
    const item = await kvGetJson(kv, key)
    if (item?.id) records.push(legacyItemToRecord(item))
  }

  const seen = new Set()
  return records.filter(record => {
    const id = safeId(record.id || '')
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

async function findExistingRecordKey(kv, id, preferredUserId = 'default') {
  const safe = safeId(id || '')
  if (!safe) return ''
  const preferredKey = recordKey(preferredUserId || 'default', safe)
  const preferred = await kvGetJson(kv, preferredKey)
  if (preferred?.id) return preferredKey
  const keys = await listAllKeys(kv, 'record_')
  for (const key of keys) {
    const record = await kvGetJson(kv, key)
    if (safeId(record?.id || '') === safe) return key
  }
  return preferredKey
}

async function findExistingRecordKeys(kv, id, preferredUserId = 'default') {
  const safe = safeId(id || '')
  if (!safe) return []
  const matched = new Set()

  const preferredKey = recordKey(preferredUserId || 'default', safe)
  const preferred = await kvGetJson(kv, preferredKey)
  if (preferred?.id) matched.add(preferredKey)

  const recordKeys = await listAllKeys(kv, 'record_')
  for (const key of recordKeys) {
    const record = await kvGetJson(kv, key)
    if (safeId(record?.id || '') === safe) matched.add(key)
  }

  // 兼容旧版 item_ 数据：旧数据在列表中会被转换成效期记录。
  // 如果只删除 record_，旧 item_ 仍会再次显示，导致“提示删除成功但实际还在”。
  const legacyKeys = await listAllKeys(kv, 'item_')
  for (const key of legacyKeys) {
    const item = await kvGetJson(kv, key)
    if (!item?.id) continue
    const legacy = legacyItemToRecord(item)
    if (safeId(legacy?.id || item.id || '') === safe || safeId(item.id || '') === safe) matched.add(key)
  }

  return Array.from(matched)
}

export async function onRequestGet(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { kv, response: kvError } = requireKV(context)
  if (kvError) return kvError
  const records = await getAllRecords(kv)
  return json({ ok: true, records })
}

export async function onRequestPost(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { request } = context
  const body = await readJson(request)
  const { kv, response: kvError } = requireKV(context)
  if (kvError) return kvError
  const userId = getUserId(request, body)
  const record = cleanRecord(body.record || {})
  if (!record.productId) return error('请选择商品资料', 400)
  record.userId = userId
  await kvPutJson(kv, recordKey(userId, record.id), record)
  return json({ ok: true, record })
}

export async function onRequestPut(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { request } = context
  const body = await readJson(request)
  const { kv, response: kvError } = requireKV(context)
  if (kvError) return kvError
  const userId = getUserId(request, body)
  const incoming = cleanRecord(body.record || {})
  if (!incoming.id) return error('缺少 id', 400)
  const key = await findExistingRecordKey(kv, incoming.id, userId)
  const old = await kvGetJson(kv, key)
  const record = { ...(old || {}), ...incoming, userId: old?.userId || userId, createdAt: old?.createdAt || incoming.createdAt, updatedAt: new Date().toISOString() }
  await kvPutJson(kv, key, record)
  return json({ ok: true, record })
}

export async function onRequestDelete(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { request } = context
  const body = await readJson(request)
  const { kv, response: kvError } = requireKV(context)
  if (kvError) return kvError
  const userId = getUserId(request, body)
  const id = safeId(body.id || '')
  if (!id) return error('缺少 id', 400)
  const keys = await findExistingRecordKeys(kv, id, userId)
  if (!keys.length) return error('未找到要删除的效期记录', 404)
  await Promise.all(keys.map(key => kv.delete(key)))
  return json({ ok: true, deleted: keys.length })
}
