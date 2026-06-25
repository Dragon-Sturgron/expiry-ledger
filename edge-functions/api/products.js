import { cleanProduct, corsHeaders, error, getUserId, json, kvGetJson, kvPutJson, listAllKeys, readJson, requireAccess, requireKV, safeId } from '../utils/shared.js'

function productKey(userId, id) { return `product_${safeId(userId || 'default')}_${safeId(id)}` }

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

async function getAllProducts(kv) {
  const keys = await listAllKeys(kv, 'product_')
  const products = []
  for (const key of keys) {
    const product = await kvGetJson(kv, key)
    if (product?.id) products.push(product)
  }
  const seen = new Set()
  return products.filter(product => {
    const id = safeId(product.id || '')
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

async function findExistingProductKey(kv, id, preferredUserId = 'default') {
  const safe = safeId(id || '')
  if (!safe) return ''
  const preferredKey = productKey(preferredUserId || 'default', safe)
  const preferred = await kvGetJson(kv, preferredKey)
  if (preferred?.id) return preferredKey
  const keys = await listAllKeys(kv, 'product_')
  for (const key of keys) {
    const product = await kvGetJson(kv, key)
    if (safeId(product?.id || '') === safe) return key
  }
  return preferredKey
}

export async function onRequestGet(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { kv, response: kvError } = requireKV(context)
  if (kvError) return kvError
  const products = await getAllProducts(kv)
  return json({ ok: true, products })
}

export async function onRequestPost(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { request } = context
  const body = await readJson(request)
  const { kv, response: kvError } = requireKV(context)
  if (kvError) return kvError
  const userId = getUserId(request, body)
  const product = cleanProduct(body.product || {})
  product.userId = userId
  await kvPutJson(kv, productKey(userId, product.id), product)
  return json({ ok: true, product })
}

export async function onRequestPut(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { request } = context
  const body = await readJson(request)
  const { kv, response: kvError } = requireKV(context)
  if (kvError) return kvError
  const userId = getUserId(request, body)
  const incoming = cleanProduct(body.product || {})
  if (!incoming.id) return error('缺少 id', 400)
  const key = await findExistingProductKey(kv, incoming.id, userId)
  const old = await kvGetJson(kv, key)
  const product = { ...(old || {}), ...incoming, userId: old?.userId || userId, createdAt: old?.createdAt || incoming.createdAt, updatedAt: new Date().toISOString() }
  await kvPutJson(kv, key, product)
  return json({ ok: true, product })
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
  const key = await findExistingProductKey(kv, id, userId)
  await kv.delete(key)
  return json({ ok: true })
}
