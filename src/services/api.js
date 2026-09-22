const USER_ID_KEY = 'expiry_ledger_user_id'
const ACCESS_TOKEN_KEY = 'expiry_ledger_access_token'

export function getUserId() {
  let id = localStorage.getItem(USER_ID_KEY)
  if (!id) {
    id = 'default'
    localStorage.setItem(USER_ID_KEY, id)
  }
  return id
}

export function getAccessToken() {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem(ACCESS_TOKEN_KEY) || ''
}

export function clearAccessToken() {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(ACCESS_TOKEN_KEY)
}

function setAccessToken(token, remember = false) {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, token || '')
  if (remember) localStorage.setItem(ACCESS_TOKEN_KEY, token || '')
}

async function request(path, options = {}) {
  const token = getAccessToken()
  const headers = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  }
  const res = await fetch(path, { ...options, headers })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) throw new Error(data?.message || data?.error || `请求失败：${res.status}`)
  return data
}

function withUser(path) {
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}userId=${encodeURIComponent(getUserId())}`
}

export const api = {
  authStatus: () => request('/api/auth/status'),
  async verifyAccess(password, remember = false) {
    const data = await request('/api/auth/verify', { method: 'POST', body: JSON.stringify({ password }) })
    if (data?.token) setAccessToken(data.token, remember)
    return data
  },
  listProducts: () => request(withUser('/api/products')),
  createProduct: product => request('/api/products', { method: 'POST', body: JSON.stringify({ userId: getUserId(), product }) }),
  updateProduct: product => request('/api/products', { method: 'PUT', body: JSON.stringify({ userId: getUserId(), product }) }),
  deleteProduct: id => request('/api/products', { method: 'DELETE', body: JSON.stringify({ userId: getUserId(), id }) }),
  listRecords: () => request(withUser('/api/records')),
  createRecord: record => request('/api/records', { method: 'POST', body: JSON.stringify({ userId: getUserId(), record }) }),
  updateRecord: record => request('/api/records', { method: 'PUT', body: JSON.stringify({ userId: getUserId(), record }) }),
  deleteRecord: id => request('/api/records', { method: 'DELETE', body: JSON.stringify({ userId: getUserId(), id }) }),
  getSettings: () => request(withUser('/api/settings')),
  saveSettings: settings => request('/api/settings', { method: 'POST', body: JSON.stringify({ userId: getUserId(), settings }) }),
  getWechatBindUrl: () => request(withUser('/api/wechat/bind-url')),
  checkWechatBind: () => request(withUser('/api/wechat/status')),
  runNotify: () => request('/api/notify/run', { method: 'POST', body: JSON.stringify({ manual: true, userId: getUserId() }) }),
  getQiniuUploadToken: ({ filename, contentType }) => request('/api/upload/qiniu-token', { method: 'POST', body: JSON.stringify({ userId: getUserId(), filename, contentType }) }),
  async uploadImageToQiniu(file) {
    const info = await this.getQiniuUploadToken({ filename: file.name, contentType: file.type })
    const form = new FormData()
    form.append('token', info.token)
    form.append('key', info.key)
    form.append('file', file)
    const res = await fetch(info.uploadUrl, { method: 'POST', body: form })
    if (!res.ok) throw new Error(`图片上传失败：${res.status}`)
    return { ...(await res.json()), url: info.publicUrl, key: info.key }
  }
}
