import { error, getKV, getUrl, json, safeId } from '../../utils/shared.js'
import { exchangeOAuthCode, wxConfig } from '../../utils/wx.js'

function html(message, siteUrl) {
  return new Response(`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>微信绑定</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:24px;text-align:center"><h3>${message}</h3><p><a href="${siteUrl || '/'}">返回临期账本</a></p></body></html>`, {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' }
  })
}

export async function onRequestGet(context) {
  const { request } = context
  const kv = getKV(context)
  const url = getUrl(request)
  const code = url.searchParams.get('code')
  const state = safeId(url.searchParams.get('state') || '')
  const cfg = wxConfig(context)
  if (!code || !state) return error('缺少微信回调 code/state', 400)
  const saved = await kv.get(`oauthstate_${state}`, { type: 'json' })
  if (!saved?.userId || saved.expireAt < Date.now()) return html('绑定链接已失效，请返回重新绑定', cfg.siteUrl)
  try {
    const data = await exchangeOAuthCode({ appid: cfg.appid, secret: cfg.secret, code })
    await kv.put(`wechat_${safeId(saved.userId)}`, JSON.stringify({ openid: data.openid, scope: data.scope || '', boundAt: new Date().toISOString() }))
    await kv.put(`wechat_openid_${safeId(data.openid)}`, JSON.stringify({ userId: safeId(saved.userId), boundAt: new Date().toISOString() }))
    await kv.delete(`oauthstate_${state}`)
    const target = `${(cfg.siteUrl || '/').replace(/\/$/, '')}/?wechat=bound`
    return Response.redirect(target, 302)
  } catch (e) {
    return html(`绑定失败：${e.message}`, cfg.siteUrl)
  }
}
