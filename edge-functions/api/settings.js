import {
  defaultSettings, getJson, getUserIdFromUrl, json, putJson, readBody,
  requireAuth, requireKV, safeUserId, settingsKey
} from '../utils/shared.js'

export async function onRequest({ request, env }) {
  const denied = await requireAuth(request, env)
  if (denied) return denied
  const kv = requireKV(env)

  if (request.method === 'GET') {
    const userId = getUserIdFromUrl(request)
    const saved = await getJson(kv, settingsKey(userId), {})
    return json({ ok: true, settings: { ...defaultSettings(), ...saved } })
  }

  if (request.method === 'POST') {
    const body = await readBody(request)
    const userId = safeUserId(body.userId)
    const current = await getJson(kv, settingsKey(userId), {})
    const settings = { ...defaultSettings(), ...current, ...(body.settings || {}) }
    await putJson(kv, settingsKey(userId), settings)
    return json({ ok: true, settings })
  }

  return json({ ok: false, message: 'Method Not Allowed' }, 405)
}
