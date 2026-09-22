import { accessPassword, isAuthorized, json } from '../../utils/shared.js'

export async function onRequest({ request, env }) {
  const required = Boolean(accessPassword(env))
  const authed = required ? await isAuthorized(request, env) : true
  return json({ ok: true, required, authed })
}
