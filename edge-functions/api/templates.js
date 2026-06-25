import { cleanItem, corsHeaders, error, requireKV, getUserId, json, listAllKeys, newId, kvGetJson, kvPutJson, readJson, safeId, requireAccess } from '../utils/shared.js'

function tplKey(userId, id) { return `tpl_${safeId(userId)}_${safeId(id)}` }
function tplPrefix(userId) { return `tpl_${safeId(userId)}_` }

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

export async function onRequestGet(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { request } = context
  const { kv, response: kvError } = requireKV(context)
  if (kvError) return kvError
  const userId = getUserId(request) || 'default'
  const keys = await listAllKeys(kv, 'tpl_')
  const templates = []
  for (const key of keys) {
    const tpl = await kvGetJson(kv, key)
    if (tpl) templates.push(tpl)
  }
  return json({ ok: true, templates })
}

export async function onRequestPost(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { request } = context
  const body = await readJson(request)
  const { kv, response: kvError } = requireKV(context)
  if (kvError) return kvError
  const userId = getUserId(request, body)
  if (!userId) body.userId = 'default'
  const item = cleanItem(body.template || {})
  const template = {
    ...item,
    id: newId('tpl'),
    userId,
    barcode: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  await kvPutJson(kv, tplKey(userId || 'default', template.id), template)
  return json({ ok: true, template })
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
  if (!userId || !id) return error('缺少 userId 或 id', 400)
  await kv.delete(tplKey(userId, id))
  return json({ ok: true })
}
