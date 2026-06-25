import { corsHeaders, error, getKV, getUserId, json, readJson, safeId, requireAccess } from '../utils/shared.js'

function settingKey(userId) { return `setting_${safeId(userId)}` }

const DEFAULT_SETTINGS = {
  nearDays: 30,
  defaultRemindDays: 3,
  defaultCategory: '',
  autoCloseDialog: false
}

function cleanSettings(s = {}) {
  return {
    nearDays: Math.max(1, Math.min(3650, Number(s.nearDays || 30))),
    defaultRemindDays: Math.max(0, Math.min(3650, Number(s.defaultRemindDays || 3))),
    defaultCategory: String(s.defaultCategory || '').slice(0, 40),
    autoCloseDialog: Boolean(s.autoCloseDialog)
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

export async function onRequestGet(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const { request } = context
  const kv = getKV(context)
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
  const kv = getKV(context)
  const userId = getUserId(request, body)
  if (!userId) return error('缺少 userId', 400)
  const settings = cleanSettings(body.settings || {})
  await kv.put(settingKey(userId), JSON.stringify(settings))
  return json({ ok: true, settings })
}
