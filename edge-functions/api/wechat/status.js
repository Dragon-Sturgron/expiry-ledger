import { getJson, getUserIdFromUrl, json, requireAuth, requireKV, wechatKey } from '../../utils/shared.js'

export async function onRequest({ request, env }) {
  const denied = await requireAuth(request, env)
  if (denied) return denied
  const kv = requireKV(env)
  const userId = getUserIdFromUrl(request)
  const binding = await getJson(kv, wechatKey(userId), null)
  return json({ ok: true, bound: Boolean(binding?.openid) })
}
