import {
  fail, getJson, getUserIdFromUrl, json, newId, nowIso, productsKey,
  putJson, readBody, requireAuth, requireKV, safeUserId
} from '../utils/shared.js'

export async function onRequest({ request, env }) {
  const denied = await requireAuth(request, env)
  if (denied) return denied
  const kv = requireKV(env)

  if (request.method === 'GET') {
    const userId = getUserIdFromUrl(request)
    const products = await getJson(kv, productsKey(userId), [])
    return json({ ok: true, products })
  }

  const body = await readBody(request)
  const userId = safeUserId(body.userId)
  const products = await getJson(kv, productsKey(userId), [])

  if (request.method === 'POST') {
    const input = body.product || {}
    if (!String(input.name || '').trim()) return fail('药品名称不能为空')
    const product = {
      ...input,
      id: input.id || newId('prd'),
      name: String(input.name).trim(),
      createdAt: input.createdAt || nowIso(),
      updatedAt: nowIso()
    }
    products.unshift(product)
    await putJson(kv, productsKey(userId), products)
    return json({ ok: true, product }, 201)
  }

  if (request.method === 'PUT') {
    const input = body.product || {}
    if (!input.id) return fail('缺少药品 ID')
    const index = products.findIndex(p => p.id === input.id)
    if (index < 0) return fail('药品资料不存在', 404)
    products[index] = { ...products[index], ...input, updatedAt: nowIso() }
    await putJson(kv, productsKey(userId), products)
    return json({ ok: true, product: products[index] })
  }

  if (request.method === 'DELETE') {
    if (!body.id) return fail('缺少药品 ID')
    const next = products.filter(p => p.id !== body.id)
    await putJson(kv, productsKey(userId), next)
    return json({ ok: true })
  }

  return fail('Method Not Allowed', 405)
}
