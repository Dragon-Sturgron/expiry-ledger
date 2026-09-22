import { getJson, getUserIdFromUrl, json, productsKey, recordsKey, requireAuth, requireKV } from '../utils/shared.js'

export async function onRequest({ request, env }) {
  const denied = await requireAuth(request, env)
  if (denied) return denied
  const kv = requireKV(env)
  const userId = getUserIdFromUrl(request)
  const [products, records] = await Promise.all([
    getJson(kv, productsKey(userId), []),
    getJson(kv, recordsKey(userId), [])
  ])
  return json({ ok: true, products, records })
}
