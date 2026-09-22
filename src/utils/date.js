export function formatDate(date = new Date()) {
  const d = typeof date === 'string' ? new Date(date) : date
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDuration(startDate, value, unit) {
  if (!startDate || !value) return ''
  const date = new Date(`${startDate}T00:00:00`)
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (unit === 'day') date.setDate(date.getDate() + n)
  if (unit === 'month') date.setMonth(date.getMonth() + n)
  if (unit === 'year') date.setFullYear(date.getFullYear() + n)
  return formatDate(date)
}

export function diffDays(dateText) {
  if (!dateText) return null
  const today = new Date(`${formatDate()}T00:00:00`)
  const target = new Date(`${dateText}T00:00:00`)
  return Math.ceil((target - today) / 86400000)
}

export function getStatus(item, nearDays = 30) {
  const days = diffDays(item.expiryDate)
  if (days === null) return { key: 'unknown', label: '未设置', days }
  if (days < 0) return { key: 'expired', label: '已过期', days }
  if (days <= nearDays) return { key: 'expiring', label: '即将过期', days }
  return { key: 'normal', label: '正常', days }
}

export function describeDays(days) {
  if (days === null || days === undefined) return '未设置'
  if (days < 0) return `已过期 ${Math.abs(days)} 天`
  if (days === 0) return '今天到期'
  return `剩余 ${days} 天`
}
