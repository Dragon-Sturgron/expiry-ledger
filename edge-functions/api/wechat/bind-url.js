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
  const settings = await getStoredSettings(kv, userId)
  const cfg = wxConfig(context, settings)
  if (!cfg.appid || !cfg.secret || !cfg.siteUrl) return error('请先在「设置 → 微信公众号通知」里配置 AppID、AppSecret 和网站域名，并保存设置。', 500)
  const state = safeId(newId('state'))
  await kv.put(`oauthstate_${state}`, JSON.stringify({ userId, createdAt: Date.now(), expireAt: Date.now() + 10 * 60 * 1000 }))
  const redirectUri = `${cfg.siteUrl.replace(/\/$/, '')}/api/wechat/callback`
  const url = buildOAuthUrl({ appid: cfg.appid, redirectUri, state, scope: 'snsapi_base' })
  return json({ ok: true, url })
}
