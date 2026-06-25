import { corsHeaders, json, requireAccess } from '../utils/shared.js'

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

export async function onRequestGet(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  return json({ ok: true, templates: [] })
}

export async function onRequestPost(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  return json({ ok: true, message: '新版已改为商品资料库，请使用 /api/products' })
}

export async function onRequestDelete(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  return json({ ok: true })
}
