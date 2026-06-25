import { corsHeaders, error, getEnv, getStoredSettings, getUserId, json, readJson, requireAccess, requireKV } from '../../utils/shared.js'

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function base64UrlFromString(str) {
  return bytesToBase64(new TextEncoder().encode(str)).replace(/\+/g, '-').replace(/\//g, '_')
}

function base64UrlFromBytes(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_')
}

function extFromName(filename = '', contentType = '') {
  const clean = String(filename).split('?')[0].split('#')[0]
  const match = clean.match(/\.([a-zA-Z0-9]{1,8})$/)
  if (match) return match[1].toLowerCase()
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('webp')) return 'webp'
  if (contentType.includes('gif')) return 'gif'
  return 'jpg'
}

async function hmacSha1(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text))
  return new Uint8Array(sig)
}

export async function onRequestPost(context) {
  const denied = await requireAccess(context)
  if (denied) return denied
  const body = await readJson(context.request)
  const { kv, response: kvError } = requireKV(context)
  if (kvError) return kvError
  const userId = getUserId(context.request, body)
  const settings = await getStoredSettings(kv, userId)
  const accessKey = settings.qiniuAccessKey || getEnv(context, 'QINIU_ACCESS_KEY')
  const secretKey = settings.qiniuSecretKey || getEnv(context, 'QINIU_SECRET_KEY')
  const bucket = settings.qiniuBucket || getEnv(context, 'QINIU_BUCKET')
  const domain = String(settings.qiniuDomain || getEnv(context, 'QINIU_DOMAIN') || '').replace(/\/$/, '')
  const uploadUrl = settings.qiniuUploadUrl || getEnv(context, 'QINIU_UPLOAD_URL', 'https://upload.qiniup.com')
  if (!accessKey || !secretKey || !bucket || !domain) {
    return error('请先在「设置 → 七牛云图片上传」里配置 AccessKey、SecretKey、Bucket 和访问域名。', 500, { code: 'QINIU_CONFIG_MISSING' })
  }

  const ext = extFromName(body.filename, body.contentType)
  const raw = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`
  const key = `expiry-ledger/${new Date().toISOString().slice(0, 10)}/${raw.replace(/[^a-zA-Z0-9]/g, '')}.${ext}`
  const deadline = Math.floor(Date.now() / 1000) + 3600
  const policy = {
    scope: `${bucket}:${key}`,
    deadline,
    returnBody: '{"key":"$(key)","hash":"$(etag)","name":"$(fname)","size":$(fsize),"mimeType":"$(mimeType)"}'
  }
  const encodedPolicy = base64UrlFromString(JSON.stringify(policy))
  const encodedSign = base64UrlFromBytes(await hmacSha1(secretKey, encodedPolicy))
  const token = `${accessKey}:${encodedSign}:${encodedPolicy}`
  return json({ ok: true, token, key, uploadUrl, publicUrl: `${domain}/${key}`, deadline })
}
