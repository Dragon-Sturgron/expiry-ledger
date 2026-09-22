import { fail, getUserIdFromUrl, json, requireAuth, requireKV } from '../../utils/shared.js'
import { getWxConfig } from '../../utils/wx.js'

export async function onRequest({ request, env }) {
  const denied = await requireAuth(request, env)
  if (denied) return denied
  const kv = requireKV(env)
  const userId = getUserIdFromUrl(request)
  const cfg = await getWxConfig(kv, userId)
  if (!cfg.appid || !cfg.secret || !cfg.siteUrl) return fail('请先配置公众号 AppID、AppSecret 和网站域名')

  const redirect = `${cfg.siteUrl}/api/wechat/callback`
  const url = new URL('https://open.weixin.qq.com/connect/oauth2/authorize')
  url.searchParams.set('appid', cfg.appid)
  url.searchParams.set('redirect_uri', redirect)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'snsapi_base')
  url.searchParams.set('state', userId)
  return json({ ok: true, url: url.toString() + '#wechat_redirect' })
}
