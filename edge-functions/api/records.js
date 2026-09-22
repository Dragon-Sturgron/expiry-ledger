import {
  fail, getJson, getUserIdFromUrl, json, newId, nowIso, putJson,
  readBody, recordsKey, requireAuth, requireKV, safeUserId
} from '../utils/shared.js'

export async function onRequest({ request, env }) {
  const denied = await requireAuth(request, env)
  if (denied) return denied
  const kv = requireKV(env)

  if (request.method === 'GET') {
    const userId = getUserIdFromUrl(request)
    const records = await getJson(kv, recordsKey(userId), [])
    return json({ ok: true, records })
  }

  const body = await readBody(request)
  const userId = safeUserId(body.userId)
  const records = await getJson(kv, recordsKey(userId), [])

  if (request.method === 'POST') {
    const input = body.record || {}
    if (!input.productId && !String(input.productName || '').trim()) return fail('请选择或输入药品')
    if (!input.expiryDate) return fail('失效日期不能为空')
    const record = {
      ...input,
      id: input.id || newId('rec'),
      createdAt: input.createdAt || nowIso(),
      updatedAt: nowIso()
    }
    records.unshift(record)
    await putJson(kv, recordsKey(userId), records)
    return json({ ok: true, record }, 201)
  }

  if (request.method === 'PUT') {
    const input = body.record || {}
    if (!input.id) return fail('缺少记录 ID')
    const index = records.findIndex(r => r.id === input.id)
    if (index < 0) return fail('记录不存在', 404)
    records[index] = { ...records[index], ...input, updatedAt: nowIso() }
    await putJson(kv, recordsKey(userId), records)
    return json({ ok: true, record: records[index] })
  }

  if (request.method === 'DELETE') {
    if (!body.id) return fail('缺少记录 ID')
    const next = records.filter(r => r.id !== body.id)
    await putJson(kv, recordsKey(userId), next)
    return json({ ok: true })
  }

  return fail('Method Not Allowed', 405)
}
