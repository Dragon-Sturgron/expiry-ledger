import { corsHeaders, createAccessToken, error, getAccessPassword, json, readJson } from '../../utils/shared.js'

export function onRequestOptions() { return new Response(null, { status: 204, headers: corsHeaders() }) }

export async function onRequestPost(context) {
  const configured = getAccessPassword(context)
  if (!configured) return json({ ok: true, required: false, authed: true, token: '' })
  const body = await readJson(context.request)
  const input = String(body.password || '')
  if (input !== configured) return error('访问密码错误', 401, { code: 'ACCESS_PASSWORD_INVALID' })
  const token = await createAccessToken(context)
  return json({ ok: true, required: true, authed: true, token })
}
