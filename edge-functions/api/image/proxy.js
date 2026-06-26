import { corsHeaders } from '../../utils/shared.js'

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url)
  const target = url.searchParams.get('url')
  if (!target || !/^https?:\/\//i.test(target)) {
    return new Response('Invalid image url', { status: 400, headers: { 'Content-Type': 'text/plain; charset=UTF-8' } })
  }

  let parsed
  try {
    parsed = new URL(target)
  } catch {
    return new Response('Invalid image url', { status: 400, headers: { 'Content-Type': 'text/plain; charset=UTF-8' } })
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 ExpiryLedger Image Proxy',
        'Referer': `${parsed.origin}/`
      }
    })

    const headers = new Headers()
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Cache-Control', 'public, max-age=86400')
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'image/jpeg')
    const length = upstream.headers.get('Content-Length')
    if (length) headers.set('Content-Length', length)

    return new Response(upstream.body, { status: upstream.status, headers })
  } catch (e) {
    return new Response('Image fetch failed', { status: 502, headers: { 'Content-Type': 'text/plain; charset=UTF-8' } })
  }
}
