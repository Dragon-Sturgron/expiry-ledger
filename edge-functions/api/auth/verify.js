import { accessPassword, expectedAccessToken, fail, json, readBody } from '../../utils/shared.js'

export async function onRequestPost({ request, env }) {
  const configured = accessPassword(env)
  if (!configured) return json({ ok: true, required: false, token: '' })
  const body = await readBody(request)
  if (String(body.password || '') !== configured) return fail('访问密码错误', 401)
  return json({ ok: true, required: true, token: await expectedAccessToken(env) })
}

export const onRequest = onRequestPost
