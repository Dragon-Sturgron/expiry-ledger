import {
  getJson, json, recordsKey, requireAuth, requireKV, safeUserId, settingsKey
} from '../../utils/shared.js'
import { getBinding, getOfficialAccessToken, getWxConfig, sendTemplateMessage } from '../../utils/wx.js'

function dayDiff(dateText) {
  if (!dateText) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(`${dateText}T00:00:00`)
  return Math.ceil((target - today) / 86400000)
}

export async function onRequest({ request, env }) {
  const manual = request.method === 'POST'
  if (manual) {
    const denied = await requireAuth(request, env)
    if (denied) return denied
  }

  const kv = requireKV(env)
  let body = {}
  if (request.method === 'POST') {
    try { body = await request.json() } catch {}
  }
  const userId = safeUserId(body.userId || 'default')
  const [settings, records, binding] = await Promise.all([
    getJson(kv, settingsKey(userId), {}),
    getJson(kv, recordsKey(userId), []),
    getBinding(kv, userId)
  ])

  const cfg = await getWxConfig(kv, userId)
  if (!binding?.openid || !cfg.appid || !cfg.secret || !cfg.templateId) {
    return json({ ok: true, sent: 0, skipped: records.length, reason: '微信未绑定或配置不完整' })
  }

  const candidates = records.filter(r => {
    if (r.reminder === false || !r.expiryDate) return false
    const days = dayDiff(r.expiryDate)
    const remindDays = Number(settings.defaultRemindDays ?? 7)
    return days !== null && days >= 0 && days <= remindDays
  }).slice(0, 3)

  if (!candidates.length) return json({ ok: true, sent: 0, skipped: records.length })

  const token = await getOfficialAccessToken(cfg.appid, cfg.secret)
  let sent = 0
  const errors = []
  for (const record of candidates) {
    const days = dayDiff(record.expiryDate)
    try {
      await sendTemplateMessage({
        accessToken: token,
        openid: binding.openid,
        templateId: cfg.templateId,
        pageUrl: cfg.siteUrl,
        medicineName: record.productSnapshot?.name || record.productName || '药品',
        expiryDate: record.expiryDate,
        daysText: days === 0 ? '今天到期' : `剩余 ${days} 天`
      })
      sent++
    } catch (e) {
      errors.push(e.message)
    }
  }
  return json({ ok: true, sent, skipped: Math.max(0, records.length - candidates.length), errors })
}
