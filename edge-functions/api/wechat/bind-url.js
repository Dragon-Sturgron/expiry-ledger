import { corsHeaders, error, requireKV, getUserId, json, newId, safeId, requireAccess } from '../../utils/shared.js'
import { buildOAuthUrl, wxConfig } from '../../utils/wx.js'

export function onRequestOptions() { return new Response(null, { status: 204, headers: corsHeaders() }) }

export async function onRequestGet(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { request } = context
  const { kv, response: kvError } = requireKV(context)
  if (kvError) return kvError
  const userId = getUserId(request)
  if (!userId) return error('缺少 userId', 400)
  const cfg = wxConfig(context)
  if (!cfg.appid || !cfg.secret || !cfg.siteUrl) return error('缺少 WX_APPID、WX_SECRET 或 SITE_URL，请先在 Makers 环境变量中配置', 500)
  const state = safeId(newId('state'))
  await kv.put(`oauthstate_${state}`, JSON.stringify({ userId, createdAt: Date.now(), expireAt: Date.now() + 10 * 60 * 1000 }))
  const redirectUri = `${cfg.siteUrl.replace(/\/$/, '')}/api/wechat/callback`
  const url = buildOAuthUrl({ appid: cfg.appid, redirectUri, state, scope: 'snsapi_base' })
  return json({ ok: true, url })
}
