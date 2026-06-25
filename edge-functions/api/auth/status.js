import { checkAccess, corsHeaders, json } from '../../utils/shared.js'

export function onRequestOptions() { return new Response(null, { status: 204, headers: corsHeaders() }) }

export async function onRequestGet(context) {
  const result = await checkAccess(context)
  return json({ ok: true, required: result.required, authed: result.authed })
}
