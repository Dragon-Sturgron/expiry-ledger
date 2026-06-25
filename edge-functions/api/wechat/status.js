import { corsHeaders, error, requireKV, getUserId, json, safeId, requireAccess } from '../../utils/shared.js'
function wxKey(userId) { return `wechat_${safeId(userId)}` }

export function onRequestOptions() { return new Response(null, { status: 204, headers: corsHeaders() }) }

export async function onRequestGet(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { request } = context
  const { kv, response: kvError } = requireKV(context)
  if (kvError) return kvError
  const userId = getUserId(request)
  if (!userId) return error('缺少 userId', 400)
  const bind = await kv.get(wxKey(userId), { type: 'json' })
  return json({ ok: true, bound: Boolean(bind?.openid), boundAt: bind?.boundAt || '' })
}
