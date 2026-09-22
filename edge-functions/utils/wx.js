import { getJson, normalizeDomain, settingsKey, wechatKey } from './shared.js'

export async function getWxConfig(kv, userId) {
  const settings = await getJson(kv, settingsKey(userId), {})
  return {
    appid: String(settings.wxAppid || ''),
    secret: String(settings.wxSecret || ''),
    templateId: String(settings.wxTemplateId || ''),
    siteUrl: normalizeDomain(settings.siteUrl)
  }
}

export async function getBinding(kv, userId) {
  return getJson(kv, wechatKey(userId), null)
}

export async function getOfficialAccessToken(appid, secret) {
  const url = new URL('https://api.weixin.qq.com/cgi-bin/token')
  url.searchParams.set('grant_type', 'client_credential')
  url.searchParams.set('appid', appid)
  url.searchParams.set('secret', secret)
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok || data.errcode) throw new Error(data.errmsg || `获取微信 access_token 失败：${res.status}`)
  return data.access_token
}

export async function sendTemplateMessage({ accessToken, openid, templateId, pageUrl, medicineName, expiryDate, daysText }) {
  const endpoint = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${encodeURIComponent(accessToken)}`
  const payload = {
    touser: openid,
    template_id: templateId,
    url: pageUrl || '',
    data: {
      thing1: { value: String(medicineName || '药品临期提醒').slice(0, 20) },
      date2: { value: String(expiryDate || '').slice(0, 20) },
      thing3: { value: String(daysText || '请及时检查').slice(0, 20) }
    }
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(payload)
  })
  const data = await res.json()
  if (!res.ok || data.errcode) throw new Error(data.errmsg || `微信模板消息发送失败：${res.status}`)
  return data
}
