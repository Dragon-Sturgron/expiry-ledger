import { corsHeaders, error, requireKV, getUserId, json, readJson, safeId, requireAccess } from '../utils/shared.js'

function settingKey(userId) { return `setting_${safeId(userId)}` }

const DEFAULT_SETTINGS = {
  nearDays: 30,
  defaultRemindDays: 3,
  defaultCategory: '',
  categories: [],
  autoCloseDialog: false,
  qiniuAccessKey: '',
  qiniuSecretKey: '',
  qiniuBucket: '',
  qiniuDomain: '',
  qiniuUploadUrl: 'https://upload.qiniup.com',
  wxAppid: '',
  wxSecret: '',
  wxTemplateId: '',
  siteUrl: ''
}

function cleanSettings(s = {}) {
  return {
    nearDays: Math.max(1, Math.min(3650, Number(s.nearDays || 30))),
    defaultRemindDays: Math.max(0, Math.min(3650, Number(s.defaultRemindDays || 3))),
    defaultCategory: String(s.defaultCategory || '').slice(0, 40),
    categories: Array.isArray(s.categories)
      ? Array.from(new Set(s.categories.map(x => String(x || '').trim()).filter(Boolean))).slice(0, 80)
      : [],
    autoCloseDialog: Boolean(s.autoCloseDialog),
    qiniuAccessKey: String(s.qiniuAccessKey || '').trim().slice(0, 200),
    qiniuSecretKey: String(s.qiniuSecretKey || '').trim().slice(0, 200),
    qiniuBucket: String(s.qiniuBucket || '').trim().slice(0, 120),
    qiniuDomain: String(s.qiniuDomain || '').trim().replace(/\/$/, '').slice(0, 300),
    qiniuUploadUrl: String(s.qiniuUploadUrl || 'https://upload.qiniup.com').trim().replace(/\/$/, '').slice(0, 300),
    wxAppid: String(s.wxAppid || '').trim().slice(0, 120),
    wxSecret: String(s.wxSecret || '').trim().slice(0, 200),
    wxTemplateId: String(s.wxTemplateId || '').trim().slice(0, 200),
    siteUrl: String(s.siteUrl || '').trim().replace(/\/$/, '').slice(0, 300)
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

export async function onRequestGet(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { request } = context
  const { kv, response: kvError } = requireKV(context)
  if (kvError) return kvError
  const userId = getUserId(request)
  if (!userId) return error('缺少 userId', 400)
  const settings = await kv.get(settingKey(userId), { type: 'json' })
  return json({ ok: true, settings: { ...DEFAULT_SETTINGS, ...(settings || {}) } })
}

export async function onRequestPost(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { request } = context
  const body = await readJson(request)
  const { kv, response: kvError } = requireKV(context)
  if (kvError) return kvError
  const userId = getUserId(request, body)
  if (!userId) return error('缺少 userId', 400)
  const settings = cleanSettings(body.settings || {})
  await kv.put(settingKey(userId), JSON.stringify(settings))
  return json({ ok: true, settings })
}
