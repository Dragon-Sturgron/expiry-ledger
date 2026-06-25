import { getEnv } from './shared.js'

export function wxConfig(context) {
  return {
    appid: getEnv(context, 'WX_APPID'),
    secret: getEnv(context, 'WX_SECRET'),
    templateId: getEnv(context, 'WX_TEMPLATE_ID'),
    siteUrl: getEnv(context, 'SITE_URL')
  }
}

export async function getOfficialAccessToken(context, kv) {
  const cached = await kv.get('wx_access_token', { type: 'json' })
  const now = Date.now()
  if (cached?.token && cached?.expiresAt && cached.expiresAt > now + 60_000) return cached.token

  const cfg = wxConfig(context)
  if (!cfg.appid || !cfg.secret) throw new Error('缺少 WX_APPID 或 WX_SECRET')
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(cfg.appid)}&secret=${encodeURIComponent(cfg.secret)}`
  const res = await fetch(url)
  const data = await res.json()
  if (!data.access_token) throw new Error(data.errmsg || '获取公众号 access_token 失败')
  await kv.put('wx_access_token', JSON.stringify({ token: data.access_token, expiresAt: now + (Number(data.expires_in || 7200) - 300) * 1000 }))
  return data.access_token
}

export function buildOAuthUrl({ appid, redirectUri, state, scope = 'snsapi_base' }) {
  const url = new URL('https://open.weixin.qq.com/connect/oauth2/authorize')
  url.searchParams.set('appid', appid)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', scope)
  url.searchParams.set('state', state)
  return `${url.toString()}#wechat_redirect`
}

export async function exchangeOAuthCode({ appid, secret, code }) {
  const url = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&code=${encodeURIComponent(code)}&grant_type=authorization_code`
  const res = await fetch(url)
  const data = await res.json()
  if (!data.openid) throw new Error(data.errmsg || '微信网页授权失败，未获取到 openid')
  return data
}

export function buildTemplateData(item, statusLabel, daysText) {
  // 默认适配常见“事项提醒/到期提醒”类模板。
  // 如果你的公众号模板字段不同，请在这里调整字段名，如 thing1、date2、thing3 等。
  return {
    thing1: { value: item.name || '物品到期提醒' },
    thing2: { value: statusLabel },
    time3: { value: item.expiryDate || '' },
    thing4: { value: daysText },
    thing5: { value: item.category || '未分类' }
  }
}

export async function sendTemplateMessage(context, kv, { openid, item, statusLabel, daysText }) {
  const cfg = wxConfig(context)
  if (!cfg.templateId) throw new Error('缺少 WX_TEMPLATE_ID')
  const token = await getOfficialAccessToken(context, kv)
  const url = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${encodeURIComponent(token)}`
  const body = {
    touser: openid,
    template_id: cfg.templateId,
    url: cfg.siteUrl || undefined,
    data: buildTemplateData(item, statusLabel, daysText)
  }
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (data.errcode && data.errcode !== 0) throw new Error(data.errmsg || `模板消息发送失败：${data.errcode}`)
  return data
}
