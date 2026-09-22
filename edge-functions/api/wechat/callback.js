import { fail, json, putJson, requireKV, safeUserId, wechatKey } from '../../utils/shared.js'
import { getWxConfig } from '../../utils/wx.js'

export async function onRequest({ request, env }) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const userId = safeUserId(url.searchParams.get('state') || 'default')
  if (!code) return fail('微信授权缺少 code')

  const kv = requireKV(env)
  const cfg = await getWxConfig(kv, userId)
  if (!cfg.appid || !cfg.secret) return fail('公众号配置不完整')

  const tokenUrl = new URL('https://api.weixin.qq.com/sns/oauth2/access_token')
  tokenUrl.searchParams.set('appid', cfg.appid)
  tokenUrl.searchParams.set('secret', cfg.secret)
  tokenUrl.searchParams.set('code', code)
  tokenUrl.searchParams.set('grant_type', 'authorization_code')

  const res = await fetch(tokenUrl)
  const data = await res.json()
  if (!res.ok || data.errcode || !data.openid) return fail(data.errmsg || '微信授权失败', 502)

  await putJson(kv, wechatKey(userId), {
    openid: data.openid,
    scope: data.scope || '',
    boundAt: new Date().toISOString()
  })

  const base = cfg.siteUrl || new URL(request.url).origin
  return Response.redirect(`${base}/?wechat=bound`, 302)
}
