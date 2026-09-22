import {
  b64url, fail, getJson, json, normalizeDomain, readBody, requireAuth,
  requireKV, safeUserId, settingsKey
} from '../../utils/shared.js'

async function hmacSha1(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
}

function safeName(name) {
  const raw = String(name || 'image').replace(/[^\w.\-]/g, '_').slice(-100)
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${raw}`
}

export async function onRequestPost({ request, env }) {
  const denied = await requireAuth(request, env)
  if (denied) return denied
  const body = await readBody(request)
  const userId = safeUserId(body.userId)
  const kv = requireKV(env)
  const settings = await getJson(kv, settingsKey(userId), {})
  const ak = String(settings.qiniuAccessKey || '')
  const sk = String(settings.qiniuSecretKey || '')
  const bucket = String(settings.qiniuBucket || '')
  const domain = normalizeDomain(settings.qiniuDomain)
  const uploadUrl = String(settings.qiniuUploadUrl || 'https://upload.qiniup.com')

  if (!ak || !sk || !bucket || !domain) return fail('请先在 /admin/ 配置七牛云 AccessKey、SecretKey、Bucket 和访问域名')

  const keyName = safeName(body.filename)
  const deadline = Math.floor(Date.now() / 1000) + 3600
  const policy = { scope: `${bucket}:${keyName}`, deadline }
  const encodedPolicy = b64url(new TextEncoder().encode(JSON.stringify(policy)))
  const sign = b64url(await hmacSha1(sk, encodedPolicy))
  const token = `${ak}:${sign}:${encodedPolicy}`

  return json({
    ok: true,
    token,
    key: keyName,
    uploadUrl,
    publicUrl: `${domain}/${encodeURIComponent(keyName).replace(/%2F/g, '/')}`
  })
}

export const onRequest = onRequestPost
