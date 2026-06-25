const USER_ID_KEY = 'linqi_ledger_user_id'
const ACCESS_TOKEN_KEY = 'expiry_ledger_access_token'

function uid() {
  const random = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  return `u_${random.replace(/[^a-zA-Z0-9]/g, '_')}`
}

export function getUserId() {
  let id = localStorage.getItem(USER_ID_KEY)
  if (!id) {
    id = uid()
    localStorage.setItem(USER_ID_KEY, id)
  }
  return id
}

export function resetUserId() {
  localStorage.removeItem(USER_ID_KEY)
  return getUserId()
}

export function getAccessToken() {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem(ACCESS_TOKEN_KEY) || ''
}

export function setAccessToken(token, remember = false) {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, token || '')
  if (remember) localStorage.setItem(ACCESS_TOKEN_KEY, token || '')
}

export function clearAccessToken() {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(ACCESS_TOKEN_KEY)
}

async function request(path, options = {}) {
  const token = getAccessToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  }
  const res = await fetch(path, {
    ...options,
    headers
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    const msg = data?.message || data?.error || `请求失败：${res.status}`
    throw new Error(msg)
  }
  return data
}

function withUser(path) {
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}userId=${encodeURIComponent(getUserId())}`
}

export const api = {
  authStatus() {
    return request('/api/auth/status')
  },
  async verifyAccess(password, remember = false) {
    const data = await request('/api/auth/verify', { method: 'POST', body: JSON.stringify({ password }) })
    if (data?.token) setAccessToken(data.token, remember)
    return data
  },
  listItems() {
    return request(withUser('/api/items'))
  },
  createItem(item) {
    return request('/api/items', { method: 'POST', body: JSON.stringify({ userId: getUserId(), item }) })
  },
  updateItem(item) {
    return request('/api/items', { method: 'PUT', body: JSON.stringify({ userId: getUserId(), item }) })
  },
  deleteItem(id) {
    return request('/api/items', { method: 'DELETE', body: JSON.stringify({ userId: getUserId(), id }) })
  },
  listTemplates() {
    return request(withUser('/api/templates'))
  },
  saveTemplate(template) {
    return request('/api/templates', { method: 'POST', body: JSON.stringify({ userId: getUserId(), template }) })
  },
  deleteTemplate(id) {
    return request('/api/templates', { method: 'DELETE', body: JSON.stringify({ userId: getUserId(), id }) })
  },
  getSettings() {
    return request(withUser('/api/settings'))
  },
  saveSettings(settings) {
    return request('/api/settings', { method: 'POST', body: JSON.stringify({ userId: getUserId(), settings }) })
  },
  getWechatBindUrl() {
    return request(withUser('/api/wechat/bind-url'))
  },
  checkWechatBind() {
    return request(withUser('/api/wechat/status'))
  },
  runNotify() {
    return request('/api/notify/run', { method: 'POST', body: JSON.stringify({ manual: true }) })
  }
}
