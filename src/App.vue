<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { api, clearAccessToken, getUserId, resetUserId } from './services/api'
import { addDuration, describeDays, diffDays, formatDate, getStatus } from './utils/date'

const today = formatDate()
const ADMIN_PATH = '/admin'
const isAdminPath = location.pathname.replace(/\/+$/, '') === ADMIN_PATH
const screen = ref(isAdminPath ? 'adminSettings' : 'home')
const loading = ref(false)
const toast = ref('')
const query = ref('')
const activeTab = ref('records')
const products = ref([])
const records = ref([])
const selectedProduct = ref(null)
const selectedRecord = ref(null)
const editingProductId = ref('')
const editingRecordId = ref('')
const scannerVisible = ref(false)
const scannerInstance = ref(null)
const scannerTarget = ref('query')
const scannerTip = ref('')
const recordProductKeyword = ref('')
const categoryText = ref('')
const wechatStatus = ref({ bound: false })

const auth = reactive({
  checking: true,
  required: false,
  authed: false,
  password: '',
  remember: false,
  error: ''
})

const settings = reactive({
  nearDays: 30,
  defaultRemindDays: 3,
  defaultCategory: '',
  categories: [],
  autoCloseDialog: false,
  qiniuAccessKey: '',
  qiniuSecretKey: '',
  qiniuBucket: '',
  qiniuDomain: '',
  qiniuUploadUrl: 'https://upload.qiniup.com',
  wxAppid: '',
  wxSecret: '',
  wxTemplateId: '',
  siteUrl: ''
})

const exportFilter = reactive({
  status: '',
  category: '',
  tag: '',
  startDate: '',
  endDate: ''
})

const productForm = reactive(emptyProduct())
const recordForm = reactive(emptyRecord())

function emptyProduct() {
  return {
    name: '',
    category: '',
    barcode: '',
    imageUrl: '',
    tagText: '',
    tags: [],
    defaultShelfLifeValue: '',
    defaultShelfLifeUnit: 'day',
    remark: ''
  }
}

function emptyRecord() {
  return {
    productId: '',
    quantity: 1,
    warningQty: 0,
    startDate: today,
    shelfLifeValue: '',
    shelfLifeUnit: 'day',
    expiryDate: '',
    reminder: false,
    remindDays: 3,
    location: '',
    remark: ''
  }
}

watch(() => [recordForm.startDate, recordForm.shelfLifeValue, recordForm.shelfLifeUnit], () => {
  const next = addDuration(recordForm.startDate, recordForm.shelfLifeValue, recordForm.shelfLifeUnit)
  if (next) recordForm.expiryDate = next
})

let toastTimer
function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 2600)
}

function executeSearch() {
  query.value = query.value.trim()
  if (document?.activeElement?.blur) document.activeElement.blur()
}

function splitLines(text) {
  return String(text || '')
    .split(/[\n，,]+/)
    .map(s => s.trim())
    .filter(Boolean)
}

function uniqueList(list) {
  return Array.from(new Set((list || []).map(s => String(s || '').trim()).filter(Boolean)))
}

function syncCategoryTextFromSettings() {
  categoryText.value = uniqueList(settings.categories || []).join('\n')
}

function syncSettingsCategoriesFromText() {
  settings.categories = uniqueList(splitLines(categoryText.value)).slice(0, 80)
}

async function initAuth() {
  auth.checking = true
  auth.error = ''
  try {
    const data = await api.authStatus()
    auth.required = Boolean(data.required)
    auth.authed = !data.required || Boolean(data.authed)
  } catch (e) {
    auth.required = true
    auth.authed = false
    auth.error = e.message || '访问校验失败'
  } finally {
    auth.checking = false
  }
}

async function submitAccessPassword() {
  if (!auth.password.trim()) {
    auth.error = '请输入访问密码'
    return
  }
  loading.value = true
  auth.error = ''
  try {
    const data = await api.verifyAccess(auth.password, auth.remember)
    auth.required = Boolean(data.required)
    auth.authed = true
    auth.password = ''
    await loadAll()
    showToast('验证成功')
  } catch (e) {
    clearAccessToken()
    auth.authed = false
    auth.error = e.message || '访问密码错误'
  } finally {
    loading.value = false
  }
}

function logoutAccess() {
  clearAccessToken()
  auth.authed = false
  auth.required = true
  screen.value = 'home'
  showToast('已退出访问')
}

async function loadAll() {
  if (auth.required && !auth.authed) return
  loading.value = true
  try {
    const [productRes, recordRes, settingRes, wxRes] = await Promise.allSettled([
      api.listProducts(),
      api.listRecords(),
      api.getSettings(),
      api.checkWechatBind()
    ])
    if (productRes.status === 'fulfilled') products.value = productRes.value.products || []
    else showToast(productRes.reason?.message || '商品资料加载失败')

    if (recordRes.status === 'fulfilled') records.value = recordRes.value.records || []
    else showToast(recordRes.reason?.message || '效期记录加载失败')

    if (settingRes.status === 'fulfilled') {
      Object.assign(settings, settingRes.value.settings || {})
      settings.categories = uniqueList(settings.categories || [])
      syncCategoryTextFromSettings()
    }
    if (wxRes.status === 'fulfilled') wechatStatus.value = wxRes.value
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await initAuth()
  if (auth.authed) {
    await loadAll()
    if (isAdminPath) screen.value = 'adminSettings'
  }
  const params = new URLSearchParams(location.search)
  if (params.get('wechat') === 'bound') {
    showToast('微信绑定成功')
    history.replaceState(null, '', location.pathname)
  }
})

const productMap = computed(() => {
  const map = new Map()
  products.value.forEach(p => map.set(p.id, p))
  return map
})

function productOf(record) {
  return productMap.value.get(record.productId) || record.productSnapshot || {}
}

const recordCards = computed(() => {
  return records.value
    .map(record => ({ record, product: productOf(record) }))
    .sort((a, b) => (a.record.expiryDate || '').localeCompare(b.record.expiryDate || ''))
})

const filteredProducts = computed(() => {
  const key = query.value.trim().toLowerCase()
  const list = [...products.value].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN'))
  if (!key) return list
  return list.filter(p => [p.name, p.category, p.barcode, p.remark, ...(p.tags || [])].filter(Boolean).join(' ').toLowerCase().includes(key))
})

const filteredRecordCards = computed(() => {
  const key = query.value.trim().toLowerCase()
  let list = recordCards.value
  if (activeTab.value === 'todo') {
    list = list.filter(({ record }) => ['expiring', 'expired'].includes(getStatus(record, Number(settings.nearDays) || 30).key))
  }
  if (activeTab.value === 'category' && key) {
    list = list.filter(({ product }) => (product.category || '').toLowerCase().includes(key))
  }
  if (!key) return list
  return list.filter(({ record, product }) => [
    product.name,
    product.category,
    product.barcode,
    record.location,
    record.remark,
    ...(product.tags || [])
  ].filter(Boolean).join(' ').toLowerCase().includes(key))
})

const stats = computed(() => {
  const map = { normal: 0, expiring: 0, expired: 0, total: records.value.length, warning: 0, invalid: 0 }
  records.value.forEach(record => {
    const st = getStatus(record, Number(settings.nearDays) || 30)
    if (map[st.key] !== undefined) map[st.key]++
    if (Number(record.quantity) <= Number(record.warningQty || 0) && Number(record.warningQty || 0) > 0) map.warning++
    if (Number(record.quantity) <= 0) map.invalid++
  })
  return map
})

const categoryRows = computed(() => {
  const map = new Map()
  products.value.forEach(p => map.set(p.category || '未分类', (map.get(p.category || '未分类') || 0) + 1))
  return Array.from(map.entries()).map(([name, count]) => ({ name, count }))
})

const configuredCategories = computed(() => {
  return uniqueList([
    ...(settings.categories || []),
    ...categoryRows.value.map(row => row.name).filter(name => name !== '未分类')
  ])
})

const recordProductSearchResults = computed(() => {
  const key = recordProductKeyword.value.trim().toLowerCase()
  const list = [...products.value].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN'))
  if (!key) return list.slice(0, 12)
  return list.filter(p => [
    p.name,
    p.category,
    p.barcode,
    p.remark,
    ...(p.tags || [])
  ].filter(Boolean).join(' ').toLowerCase().includes(key)).slice(0, 20)
})

const tagRows = computed(() => {
  const map = new Map()
  products.value.forEach(p => (p.tags || []).forEach(tag => map.set(tag, (map.get(tag) || 0) + 1)))
  return Array.from(map.entries()).map(([name, count]) => ({ name, count }))
})

const exportRows = computed(() => {
  return recordCards.value.filter(({ record, product }) => {
    const status = getStatus(record, Number(settings.nearDays) || 30).key
    if (exportFilter.status === 'warning') {
      if (!(Number(record.quantity) <= Number(record.warningQty || 0) && Number(record.warningQty || 0) > 0)) return false
    } else if (exportFilter.status === 'invalid') {
      if (!(Number(record.quantity) <= 0)) return false
    } else if (exportFilter.status && status !== exportFilter.status) {
      return false
    }
    if (exportFilter.category && (product.category || '') !== exportFilter.category) return false
    if (exportFilter.tag && !(product.tags || []).includes(exportFilter.tag)) return false
    const recordDate = record.startDate || record.createdAt?.slice(0, 10) || ''
    if (exportFilter.startDate && recordDate < exportFilter.startDate) return false
    if (exportFilter.endDate && recordDate > exportFilter.endDate) return false
    return true
  })
})

const todoRows = computed(() => {
  return recordCards.value
    .filter(({ record }) => ['expiring', 'expired'].includes(getStatus(record, Number(settings.nearDays) || 30).key))
    .map(({ record, product }) => ({ name: product.name || '未命名商品', count: describeDays(diffDays(record.expiryDate)), record }))
})

function unitText(unit) {
  return { day: '天', month: '月', year: '年' }[unit] || '天'
}

function statClass(record) {
  return getStatus(record, Number(settings.nearDays) || 30).key
}

function updateProductTags() {
  productForm.tags = productForm.tagText
    .split(/[，,\s]+/)
    .map(s => s.trim())
    .filter(Boolean)
}

function applyEmptyProduct() {
  Object.assign(productForm, emptyProduct(), { category: settings.defaultCategory || configuredCategories.value[0] || '' })
  editingProductId.value = ''
}

function applyEmptyRecord(product = null) {
  Object.assign(recordForm, emptyRecord(), {
    remindDays: Number(settings.defaultRemindDays) || 3,
    productId: product?.id || ''
  })
  recordProductKeyword.value = ''
  editingRecordId.value = ''
  if (product) applyProductToRecord(product)
}

function openProductForm(product = null) {
  applyEmptyProduct()
  if (product) {
    editingProductId.value = product.id
    Object.assign(productForm, JSON.parse(JSON.stringify(product)), { tagText: (product.tags || []).join('，') })
  }
  screen.value = 'productForm'
}

function openRecordForm(record = null, product = null) {
  applyEmptyRecord(product)
  if (record) {
    editingRecordId.value = record.id
    Object.assign(recordForm, JSON.parse(JSON.stringify(record)))
    syncRecordProductKeyword()
  }
  screen.value = 'recordForm'
}

function openProductDetail(product) {
  selectedProduct.value = product
  screen.value = 'productDetail'
}

function openRecordDetail(record) {
  selectedRecord.value = record
  screen.value = 'recordDetail'
}

function backHome() {
  screen.value = 'home'
  selectedProduct.value = null
  selectedRecord.value = null
  stopScanner()
}

function productDisplayName(product) {
  if (!product) return ''
  return [product.name, product.barcode ? `条码：${product.barcode}` : '无条码', product.category || '未分类'].filter(Boolean).join(' / ')
}

function syncRecordProductKeyword() {
  const product = productMap.value.get(recordForm.productId)
  recordProductKeyword.value = product ? productDisplayName(product) : ''
}

function selectProductForRecord(product) {
  if (!product) return
  applyProductToRecord(product)
}

function applyProductToRecord(product = productMap.value.get(recordForm.productId)) {
  if (!product) return
  recordForm.productId = product.id
  recordProductKeyword.value = productDisplayName(product)
  if (!recordForm.shelfLifeValue && product.defaultShelfLifeValue) recordForm.shelfLifeValue = product.defaultShelfLifeValue
  if (product.defaultShelfLifeUnit) recordForm.shelfLifeUnit = product.defaultShelfLifeUnit
}

function changeQty(field, delta) {
  recordForm[field] = Math.max(0, Number(recordForm[field] || 0) + delta)
}

function validateProduct() {
  updateProductTags()
  if (!productForm.name.trim()) throw new Error('请输入商品名称')
  if (!productForm.category.trim()) throw new Error('请选择或输入分类')
}

function validateRecord() {
  if (!recordForm.productId) throw new Error('请选择商品资料')
  if (!recordForm.expiryDate) throw new Error('请选择期限或到期日期')
}

function productPayload() {
  return {
    id: editingProductId.value || undefined,
    name: productForm.name.trim(),
    category: productForm.category.trim(),
    barcode: productForm.barcode.trim(),
    imageUrl: productForm.imageUrl.trim(),
    tags: productForm.tags,
    defaultShelfLifeValue: productForm.defaultShelfLifeValue ? Number(productForm.defaultShelfLifeValue) : '',
    defaultShelfLifeUnit: productForm.defaultShelfLifeUnit,
    remark: productForm.remark.trim()
  }
}

function recordPayload() {
  const product = productMap.value.get(recordForm.productId)
  return {
    id: editingRecordId.value || undefined,
    productId: recordForm.productId,
    productSnapshot: product ? {
      id: product.id,
      name: product.name,
      category: product.category,
      barcode: product.barcode,
      imageUrl: product.imageUrl,
      tags: product.tags || []
    } : undefined,
    quantity: Number(recordForm.quantity) || 0,
    warningQty: Number(recordForm.warningQty) || 0,
    startDate: recordForm.startDate,
    shelfLifeValue: recordForm.shelfLifeValue ? Number(recordForm.shelfLifeValue) : '',
    shelfLifeUnit: recordForm.shelfLifeUnit,
    expiryDate: recordForm.expiryDate,
    reminder: Boolean(recordForm.reminder),
    remindDays: Number(recordForm.remindDays) || 0,
    location: recordForm.location.trim(),
    remark: recordForm.remark.trim()
  }
}

async function saveProduct() {
  try {
    validateProduct()
    const payload = productPayload()
    if (editingProductId.value) await api.updateProduct(payload)
    else await api.createProduct(payload)
    await loadAll()
    showToast(editingProductId.value ? '商品资料已修改' : '商品资料已保存')
    backHome()
    activeTab.value = 'products'
  } catch (e) {
    showToast(e.message)
  }
}

async function saveRecord(again = false) {
  try {
    validateRecord()
    const payload = recordPayload()
    if (editingRecordId.value) await api.updateRecord(payload)
    else await api.createRecord(payload)
    await loadAll()
    showToast(editingRecordId.value ? '效期记录已修改' : '效期记录已保存')
    if (again) {
      const product = productMap.value.get(payload.productId)
      applyEmptyRecord(product)
      screen.value = 'recordForm'
    } else {
      backHome()
      activeTab.value = 'records'
    }
  } catch (e) {
    showToast(e.message)
  }
}

async function removeProduct(product) {
  const used = records.value.some(r => r.productId === product.id)
  const msg = used ? `「${product.name}」已有记录引用，删除后历史记录会保留商品快照，确定删除？` : `确定删除「${product.name}」？`
  if (!confirm(msg)) return
  try {
    await api.deleteProduct(product.id)
    await loadAll()
    showToast('商品资料已删除')
    backHome()
  } catch (e) {
    showToast(e.message)
  }
}

async function removeRecord(record) {
  if (!confirm('确定删除这条效期记录？')) return
  try {
    await api.deleteRecord(record.id)
    await loadAll()
    showToast('效期记录已删除')
    backHome()
  } catch (e) {
    showToast(e.message)
  }
}


function openPublicHome() {
  location.href = '/'
}

function openAdminSettings() {
  location.href = ADMIN_PATH + '/'
}

function statusText(record) {
  const status = getStatus(record, Number(settings.nearDays) || 30).key
  const base = { normal: '正常', expiring: '临期', expired: '过期', unknown: '未知' }[status] || '未知'
  if (Number(record.quantity) <= 0) return '无效量'
  if (Number(record.quantity) <= Number(record.warningQty || 0) && Number(record.warningQty || 0) > 0) return '数量预警'
  return base
}

function csvCell(value) {
  const text = String(value ?? '').replace(/"/g, '""')
  return `"${text}"`
}

function exportRecordsCsv() {
  const rows = exportRows.value
  if (!rows.length) {
    showToast('没有符合条件的记录')
    return
  }
  const header = ['商品名称', '物品状态', '分类', '标签', '数量', '数量预警', '记录日期', '到期日期', '剩余时间', '存放位置', '备注']
  const lines = [header.map(csvCell).join(',')]
  rows.forEach(({ record, product }) => {
    lines.push([
      product.name || '未命名商品',
      statusText(record),
      product.category || '',
      (product.tags || []).join('，'),
      record.quantity ?? '',
      record.warningQty ?? '',
      record.startDate || '',
      record.expiryDate || '',
      describeDays(diffDays(record.expiryDate)),
      record.location || '',
      record.remark || ''
    ].map(csvCell).join(','))
  })
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `临期账本导出_${formatDate()}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  showToast(`已导出 ${rows.length} 条记录`)
}

async function saveSettings() {
  try {
    syncSettingsCategoriesFromText()
    await api.saveSettings({ ...settings })
    syncCategoryTextFromSettings()
    showToast('设置已保存')
  } catch (e) {
    showToast(e.message)
  }
}

async function bindWechat() {
  try {
    const data = await api.getWechatBindUrl()
    if (!data.url) throw new Error('后端没有返回授权链接，请检查微信配置')
    location.href = data.url
  } catch (e) {
    showToast(e.message)
  }
}

async function manualNotify() {
  try {
    const data = await api.runNotify()
    showToast(`已执行：发送 ${data.sent || 0} 条，跳过 ${data.skipped || 0} 条`)
  } catch (e) {
    showToast(e.message)
  }
}

async function handleProductImage(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件')
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('图片建议小于 5MB')
    return
  }
  loading.value = true
  try {
    const data = await api.uploadImageToQiniu(file)
    productForm.imageUrl = data.url
    showToast('图片上传成功')
  } catch (e) {
    showToast(e.message || '图片上传失败，请检查七牛云配置')
  } finally {
    loading.value = false
  }
}

function findProductByBarcode(code) {
  return products.value.find(p => String(p.barcode || '').trim() === String(code || '').trim())
}

async function startScanner(target = 'query') {
  scannerTarget.value = target
  scannerVisible.value = true
  scannerTip.value = '正在启动摄像头...'
  await nextTick()
  try {
    const { Html5Qrcode } = await import('html5-qrcode')
    const scanner = new Html5Qrcode('reader')
    scannerInstance.value = scanner
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 260, height: 160 } },
      decodedText => {
        if (scannerTarget.value === 'productBarcode') {
          productForm.barcode = decodedText
          showToast('已填入商品条码')
        } else if (scannerTarget.value === 'recordProduct') {
          const product = findProductByBarcode(decodedText)
          if (product) {
            selectProductForRecord(product)
            showToast('已匹配商品资料')
          } else {
            recordProductKeyword.value = decodedText
            showToast('未匹配商品，可输入名称搜索或先添加商品资料')
          }
        } else {
          query.value = decodedText
          showToast('已识别并填入关键词')
        }
        stopScanner()
      },
      () => {}
    )
    scannerTip.value = '请将条形码或二维码放入扫描框'
  } catch (e) {
    scannerTip.value = '摄像头启动失败：请确认 HTTPS、浏览器权限，或手动输入。'
  }
}

async function stopScanner() {
  if (scannerInstance.value) {
    try { await scannerInstance.value.stop() } catch {}
    try { await scannerInstance.value.clear() } catch {}
    scannerInstance.value = null
  }
  scannerVisible.value = false
}
</script>

<template>
  <main class="phone-shell">
    <div v-if="toast" class="toast">{{ toast }}</div>

    <section v-if="auth.checking" class="page access-page">
      <div class="access-card">
        <div class="access-logo">⏳</div>
        <h1>临期账本</h1>
        <p>正在校验访问权限...</p>
      </div>
    </section>

    <section v-else-if="auth.required && !auth.authed" class="page access-page">
      <form class="access-card" @submit.prevent="submitAccessPassword">
        <div class="access-logo">🔐</div>
        <h1>临期账本</h1>
        <p>请输入访问密码后继续使用。</p>
        <input v-model="auth.password" type="password" autocomplete="current-password" placeholder="访问密码" autofocus>
        <label class="remember-line"><input type="checkbox" v-model="auth.remember"> <span>在此设备记住密码</span></label>
        <p v-if="auth.error" class="access-error">{{ auth.error }}</p>
        <button class="primary wide" type="submit">进入账本</button>
      </form>
    </section>

    <template v-else>
      <section v-if="screen === 'home'" class="page home-page">
        <div class="search-box">
          <span>⌕</span>
          <input v-model="query" placeholder="请输入关键词、条码、分类" @keyup.enter="executeSearch" />
          <button class="search-action" @click="executeSearch">搜索</button>
        </div>

        <div class="stats-grid">
          <button class="stat-card" @click="activeTab='records'; query = ''"><b>😊</b><span>正常 {{ stats.normal }}</span></button>
          <button class="stat-card" @click="activeTab='todo'"><b>😎</b><span>临期 {{ stats.expiring }}</span></button>
          <button class="stat-card" @click="activeTab='todo'"><b>😈</b><span>过期 {{ stats.expired }}</span></button>
          <button class="stat-card" @click="activeTab='records'"><b>😄</b><span>记录 {{ stats.total }}</span></button>
          <button class="stat-card"><b>😐</b><span>数量预警 {{ stats.warning }}</span></button>
          <button class="stat-card" @click="activeTab='products'"><b>📦</b><span>商品 {{ products.length }}</span></button>
        </div>

        <nav class="tabs">
          <button :class="{ active: activeTab === 'records' }" @click="activeTab = 'records'">效期</button>
          <button :class="{ active: activeTab === 'products' }" @click="activeTab = 'products'">商品</button>
          <button :class="{ active: activeTab === 'category' }" @click="activeTab = 'category'">分类</button>
          <button :class="{ active: activeTab === 'todo' }" @click="activeTab = 'todo'">待办</button>
        </nav>

        <div class="list-panel" v-if="activeTab === 'category'">
          <button v-for="row in categoryRows" :key="row.name" class="row" @click="query = row.name; activeTab = 'records'">
            <span>{{ row.name }}</span><em>{{ row.count }} ›</em>
          </button>
          <div v-if="!categoryRows.length" class="empty">暂无分类，请先添加商品资料</div>
        </div>

        <div class="list-panel" v-if="activeTab === 'todo' && !todoRows.length">
          <div class="empty">暂无临期或过期物品</div>
        </div>

        <div class="item-cards" v-if="activeTab === 'products'">
          <article v-for="product in filteredProducts" :key="product.id" class="item-card" @click="openProductDetail(product)">
            <div class="thumb" :style="product.imageUrl ? { backgroundImage: `url(${product.imageUrl})` } : {}">
              <span v-if="!product.imageUrl">📷</span>
            </div>
            <div class="item-main">
              <strong>{{ product.name }}</strong>
              <small>{{ product.category || '未分类' }} · {{ product.barcode || '无条码' }}</small>
              <small>默认保质期：{{ product.defaultShelfLifeValue || '-' }}{{ unitText(product.defaultShelfLifeUnit) }}</small>
            </div>
            <em class="next">›</em>
          </article>
          <div v-if="!filteredProducts.length" class="empty">暂无商品资料，点击右下角 + 添加</div>
        </div>

        <div class="item-cards" v-if="activeTab !== 'products' && activeTab !== 'category'">
          <article v-for="card in filteredRecordCards" :key="card.record.id" class="item-card" @click="openRecordDetail(card.record)">
            <div class="thumb" :style="card.product.imageUrl ? { backgroundImage: `url(${card.product.imageUrl})` } : {}">
              <span v-if="!card.product.imageUrl">📷</span>
            </div>
            <div class="item-main">
              <strong>{{ card.product.name || '未命名商品' }}</strong>
              <small>{{ card.product.category || '未分类' }} · 数量 {{ card.record.quantity }}</small>
              <small>到期：{{ card.record.expiryDate || '-' }} · {{ describeDays(diffDays(card.record.expiryDate)) }}</small>
            </div>
            <i :class="['badge', statClass(card.record)]">{{ getStatus(card.record, settings.nearDays).label }}</i>
          </article>
          <div v-if="!filteredRecordCards.length" class="empty">暂无效期记录，点击右下角 + 添加</div>
        </div>

        <div class="fab-stack">
          <button class="fab small" @click="activeTab='todo'">效期<br>计算</button>
          <button class="fab fab-scan" @click="startScanner('query')" aria-label="扫码"><span class="scan-mark"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i></span></button>
          <button class="fab add" @click="products.length ? openRecordForm() : openProductForm()">＋</button>
        </div>

        <div class="bottom-actions">
          <button @click="openProductForm()">＋商品</button>
          <button @click="openRecordForm()">＋效期</button>
          <button @click="screen='userSettings'">⚙设置</button>
        </div>
      </section>

      <section v-if="screen === 'productForm'" class="page add-page">
        <header class="page-header">
          <button class="back-btn" @click="backHome" aria-label="返回">←</button>
          <strong class="page-title">{{ editingProductId ? '编辑商品' : '添加商品' }}</strong>
          <span class="header-placeholder"></span>
        </header>

        <p class="section-title">商品资料</p>
        <div class="card form-card">
          <label><span class="required">*商品名称</span><input v-model="productForm.name" placeholder="请输入商品名称"></label>
          <label><span class="required">*分类</span><input v-model="productForm.category" list="category-list" placeholder="请选择或输入分类"></label>
          <datalist id="category-list"><option v-for="name in configuredCategories" :key="name" :value="name" /></datalist>
          <label><span>条形码/二维码</span><input v-model="productForm.barcode" placeholder="请输入"><button class="scan-btn" @click.prevent="startScanner('productBarcode')">扫码</button></label>
          <label class="photo-line"><span>图片<small>七牛云/链接</small></span><input v-model="productForm.imageUrl" placeholder="图片链接"><label class="upload-btn">上传<input type="file" accept="image/*" @change="handleProductImage"></label></label>
          <div v-if="productForm.imageUrl" class="image-preview-card">
            <div class="thumb preview" :style="{ backgroundImage: `url(${productForm.imageUrl})` }"></div>
            <span>图片预览</span>
          </div>
          <label><span>标签</span><input v-model="productForm.tagText" placeholder="多个用逗号分隔" @blur="updateProductTags"></label>
          <label class="period"><span>默认保质期</span><input type="number" v-model="productForm.defaultShelfLifeValue" placeholder="请输入"><div class="units"><button :class="{on:productForm.defaultShelfLifeUnit==='day'}" @click.prevent="productForm.defaultShelfLifeUnit='day'">天</button><button :class="{on:productForm.defaultShelfLifeUnit==='month'}" @click.prevent="productForm.defaultShelfLifeUnit='month'">月</button><button :class="{on:productForm.defaultShelfLifeUnit==='year'}" @click.prevent="productForm.defaultShelfLifeUnit='year'">年</button></div></label>
          <label><span>备注</span><input v-model="productForm.remark" placeholder="请输入备注"></label>
        </div>
        <div class="save-actions single">
          <button class="primary wide" @click="saveProduct">保存商品资料</button>
        </div>
      </section>

      <section v-if="screen === 'recordForm'" class="page add-page">
        <header class="page-header">
          <button class="back-btn" @click="backHome" aria-label="返回">←</button>
          <strong class="page-title">{{ editingRecordId ? '编辑效期' : '添加效期' }}</strong>
          <span class="header-placeholder"></span>
        </header>

        <div class="scan-line">
          <span class="scan-icon"><span class="mini-scan-mark"><i></i></span></span>
          <span>扫码匹配商品资料</span>
          <button class="mini-btn" @click="startScanner('recordProduct')">扫码</button>
          <button class="mini-btn light" @click="openProductForm()">新增商品</button>
        </div>

        <p class="section-title">引用商品资料</p>
        <div class="card form-card">
          <div class="product-search-block">
            <label><span class="required">*商品</span><input v-model="recordProductKeyword" placeholder="输入商品名称、条码、分类搜索"></label>
            <div class="product-search-results">
              <button v-for="p in recordProductSearchResults" :key="p.id" :class="{ selected: p.id === recordForm.productId }" @click.prevent="selectProductForRecord(p)">
                <div class="thumb tiny" :style="p.imageUrl ? { backgroundImage: `url(${p.imageUrl})` } : {}"><span v-if="!p.imageUrl">📷</span></div>
                <div>
                  <strong>{{ p.name }}</strong>
                  <small>{{ p.category || '未分类' }} · {{ p.barcode || '无条码' }}</small>
                </div>
              </button>
              <div v-if="!recordProductSearchResults.length" class="empty mini">没有找到商品资料，可点击上方“新增商品”</div>
            </div>
          </div>
          <label v-if="productMap.get(recordForm.productId)"><span>已选商品</span><div class="inline-product"><div class="thumb tiny" :style="productMap.get(recordForm.productId).imageUrl ? { backgroundImage: `url(${productMap.get(recordForm.productId).imageUrl})` } : {}"></div><b>{{ productMap.get(recordForm.productId).category || '未分类' }}</b></div></label>
        </div>

        <p class="section-title">效期信息</p>
        <div class="card form-card">
          <label><span>数量</span><div class="stepper"><button @click.prevent="changeQty('quantity', -1)">−</button><input v-model.number="recordForm.quantity"><button @click.prevent="changeQty('quantity', 1)">＋</button></div></label>
          <label><span>数量预警</span><div class="stepper"><button @click.prevent="changeQty('warningQty', -1)">−</button><input v-model.number="recordForm.warningQty"><button @click.prevent="changeQty('warningQty', 1)">＋</button></div></label>
          <label><span>日期</span><input type="date" v-model="recordForm.startDate"></label>
          <label class="period"><span>期限</span><input type="number" v-model="recordForm.shelfLifeValue" placeholder="请输入"><div class="units"><button :class="{on:recordForm.shelfLifeUnit==='day'}" @click.prevent="recordForm.shelfLifeUnit='day'">天</button><button :class="{on:recordForm.shelfLifeUnit==='month'}" @click.prevent="recordForm.shelfLifeUnit='month'">月</button><button :class="{on:recordForm.shelfLifeUnit==='year'}" @click.prevent="recordForm.shelfLifeUnit='year'">年</button></div></label>
          <label><span>到期日期</span><input type="date" v-model="recordForm.expiryDate"></label>
          <label><span>提醒</span><div class="switch-row"><input class="remind-input" type="number" v-model.number="recordForm.remindDays" min="0" placeholder="提前天数"><label class="switch"><input type="checkbox" v-model="recordForm.reminder"><i></i></label></div></label>
          <label><span>存放位置</span><input v-model="recordForm.location" placeholder="例如：冰箱/仓库/药箱"></label>
          <label><span>备注</span><input v-model="recordForm.remark" placeholder="请输入备注"></label>
        </div>

        <div class="save-actions">
          <button class="primary blue" @click="saveRecord(false)">保存</button>
          <button class="primary" @click="saveRecord(true)">保存再记</button>
        </div>
      </section>

      <section v-if="screen === 'productDetail' && selectedProduct" class="page detail-page">
        <header class="page-header">
          <button class="back-btn" @click="backHome" aria-label="返回">←</button>
          <strong class="page-title">商品详情</strong>
          <button class="text-action danger" @click="removeProduct(selectedProduct)">删除</button>
        </header>
        <article class="detail-card">
          <div class="big-thumb" :style="selectedProduct.imageUrl ? { backgroundImage: `url(${selectedProduct.imageUrl})` } : {}"><span v-if="!selectedProduct.imageUrl">📷</span></div>
          <h2>{{ selectedProduct.name }}</h2>
          <dl>
            <dt>分类</dt><dd>{{ selectedProduct.category || '-' }}</dd>
            <dt>条码</dt><dd>{{ selectedProduct.barcode || '-' }}</dd>
            <dt>默认保质期</dt><dd>{{ selectedProduct.defaultShelfLifeValue || '-' }} {{ unitText(selectedProduct.defaultShelfLifeUnit) }}</dd>
            <dt>标签</dt><dd>{{ (selectedProduct.tags || []).join('，') || '-' }}</dd>
            <dt>备注</dt><dd>{{ selectedProduct.remark || '-' }}</dd>
          </dl>
          <button class="primary wide" @click="openRecordForm(null, selectedProduct)">添加效期记录</button>
          <button class="ghost wide" @click="openProductForm(selectedProduct)">修改商品资料</button>
        </article>
      </section>

      <section v-if="screen === 'recordDetail' && selectedRecord" class="page detail-page">
        <header class="page-header">
          <button class="back-btn" @click="backHome" aria-label="返回">←</button>
          <strong class="page-title">效期详情</strong>
          <button class="text-action danger" @click="removeRecord(selectedRecord)">删除</button>
        </header>
        <article class="detail-card">
          <div class="big-thumb" :style="productOf(selectedRecord).imageUrl ? { backgroundImage: `url(${productOf(selectedRecord).imageUrl})` } : {}"><span v-if="!productOf(selectedRecord).imageUrl">📷</span></div>
          <h2>{{ productOf(selectedRecord).name || '未命名商品' }}</h2>
          <i :class="['badge', statClass(selectedRecord)]">{{ getStatus(selectedRecord, settings.nearDays).label }} · {{ describeDays(diffDays(selectedRecord.expiryDate)) }}</i>
          <dl>
            <dt>分类</dt><dd>{{ productOf(selectedRecord).category || '-' }}</dd>
            <dt>数量</dt><dd>{{ selectedRecord.quantity }}</dd>
            <dt>日期</dt><dd>{{ selectedRecord.startDate || '-' }}</dd>
            <dt>保质期</dt><dd>{{ selectedRecord.shelfLifeValue || '-' }} {{ unitText(selectedRecord.shelfLifeUnit) }}</dd>
            <dt>到期日期</dt><dd>{{ selectedRecord.expiryDate || '-' }}</dd>
            <dt>存放位置</dt><dd>{{ selectedRecord.location || '-' }}</dd>
            <dt>备注</dt><dd>{{ selectedRecord.remark || '-' }}</dd>
          </dl>
          <button class="primary wide" @click="openRecordForm(selectedRecord)">修改效期记录</button>
          <button v-if="productMap.get(selectedRecord.productId)" class="ghost wide" @click="openProductDetail(productMap.get(selectedRecord.productId))">查看商品资料</button>
        </article>
      </section>

      <section v-if="screen === 'userSettings'" class="page settings-page">
        <header class="page-header">
          <button class="back-btn" @click="backHome" aria-label="返回">←</button>
          <strong class="page-title">设置</strong>
          <span class="header-placeholder"></span>
        </header>

        <div class="user-card">
          <div class="avatar">⏳</div>
          <div>
            <strong>临期账本</strong>
            <p>商品资料 + 效期记录</p>
          </div>
        </div>

        <div class="settings-grid">
          <button @click="screen='basicSettings'">
            <b class="icon green">🔔</b>
            <span>提醒设置</span>
          </button>
          <button @click="screen='basicSettings'">
            <b class="icon orange">⚙️</b>
            <span>临期配置</span>
          </button>
          <button @click="showToast('模板库后续可扩展')">
            <b class="icon blue">📋</b>
            <span>模板库</span>
          </button>
          <button @click="screen='categorySettings'">
            <b class="icon red">🏷️</b>
            <span>分类配置</span>
          </button>
          <button @click="showToast('数据导入后续可扩展')">
            <b class="icon purple">☰</b>
            <span>数据导入</span>
          </button>
          <button @click="screen='exportRecords'">
            <b class="icon teal">☷</b>
            <span>数据导出</span>
          </button>
        </div>

        <div class="setting-list">
          <button class="setting-row" @click="screen='basicSettings'">
            <span>临期天数与提醒时间</span><em>›</em>
          </button>
          <button class="setting-row" @click="screen='categorySettings'">
            <span>分类配置</span><em>›</em>
          </button>
          <button class="setting-row" @click="screen='exportRecords'">
            <span>数据导出</span><em>›</em>
          </button>
          <button class="setting-row" @click="loadAll">
            <span>刷新同步</span><em>›</em>
          </button>
          <button class="setting-row" @click="openAdminSettings">
            <span>后台配置</span><em>/admin ›</em>
          </button>
        </div>
      </section>

      <section v-if="screen === 'basicSettings'" class="page settings-page">
        <header class="page-header">
          <button class="back-btn" @click="screen='userSettings'" aria-label="返回">←</button>
          <strong class="page-title">提醒与临期</strong>
          <span class="header-placeholder"></span>
        </header>
        <div class="card form-card">
          <label><span>临期天数</span><input type="number" v-model.number="settings.nearDays" placeholder="默认30"></label>
          <label><span>默认提醒时间</span><input type="number" v-model.number="settings.defaultRemindDays" placeholder="提前提醒天数"></label>
          <label><span>默认分类</span><input v-model="settings.defaultCategory" placeholder="可留空"></label>
        </div>
        <button class="primary wide page-primary" @click="saveSettings">保存设置</button>
      </section>

      <section v-if="screen === 'categorySettings'" class="page settings-page">
        <header class="page-header">
          <button class="back-btn" @click="screen='userSettings'" aria-label="返回">←</button>
          <strong class="page-title">分类配置</strong>
          <span class="header-placeholder"></span>
        </header>
        <div class="card wx-card">
          <h3>商品分类</h3>
          <p class="hint">每行一个分类。添加商品时可直接选择，也可以手动输入新分类。</p>
        </div>
        <div class="card form-card">
          <label class="textarea-line"><span>分类列表</span><textarea v-model="categoryText" placeholder="例如：食品\n药品\n日用品\n护肤品"></textarea></label>
          <label>
            <span>默认分类</span>
            <input v-model="settings.defaultCategory" list="category-list" placeholder="可留空">
          </label>
        </div>
        <button class="primary wide page-primary" @click="saveSettings">保存分类配置</button>
      </section>

      <section v-if="screen === 'exportRecords'" class="page settings-page export-page">
        <header class="page-header">
          <button class="back-btn" @click="screen='userSettings'" aria-label="返回">←</button>
          <strong class="page-title">数据导出</strong>
          <span class="header-placeholder"></span>
        </header>
        <p class="danger-tip">不填默认导出全部</p>
        <div class="card form-card export-form">
          <label>
            <span>物品状态</span>
            <select v-model="exportFilter.status">
              <option value="">非必填</option>
              <option value="normal">正常</option>
              <option value="expiring">临期</option>
              <option value="expired">过期</option>
              <option value="warning">数量预警</option>
              <option value="invalid">无效量</option>
            </select>
          </label>
          <label>
            <span>分类</span>
            <select v-model="exportFilter.category">
              <option value="">非必填</option>
              <option v-for="row in categoryRows" :key="row.name" :value="row.name">{{ row.name }}</option>
            </select>
          </label>
          <label>
            <span>标签</span>
            <select v-model="exportFilter.tag">
              <option value="">非必填</option>
              <option v-for="row in tagRows" :key="row.name" :value="row.name">{{ row.name }}</option>
            </select>
          </label>
          <label><span>记录开始日期</span><input type="date" v-model="exportFilter.startDate" placeholder="非必填"></label>
          <label><span>记录结束日期</span><input type="date" v-model="exportFilter.endDate" placeholder="非必填"></label>
        </div>
        <button class="primary wide export-btn" @click="exportRecordsCsv">↓ 确认导出</button>
      </section>

      <section v-if="screen === 'adminSettings'" class="page settings-page admin-page">
        <header class="page-header">
          <button class="back-btn" @click="openPublicHome" aria-label="返回">←</button>
          <strong class="page-title">后台配置</strong>
          <span class="header-placeholder"></span>
        </header>
        <div class="card wx-card">
          <h3>访问路径</h3>
          <p class="hint">当前页面用于后台配置，访问地址为 <b>/admin/</b>。纯域名首页的设置仅保留临期、提醒和导出。</p>
        </div>

        <div class="card wx-card">
          <h3>七牛云图片上传</h3>
          <p class="hint">不需要上传图片时可以全部留空。配置后，添加商品资料时可直接上传图片，图片地址会保存到商品资料里。</p>
        </div>
        <div class="card form-card">
          <label><span>AccessKey</span><input v-model="settings.qiniuAccessKey" placeholder="七牛云 AccessKey"></label>
          <label><span>SecretKey</span><input v-model="settings.qiniuSecretKey" type="password" autocomplete="off" placeholder="七牛云 SecretKey"></label>
          <label><span>Bucket</span><input v-model="settings.qiniuBucket" placeholder="空间名称"></label>
          <label><span>访问域名</span><input v-model="settings.qiniuDomain" placeholder="https://图片域名"></label>
          <label><span>上传域名</span><input v-model="settings.qiniuUploadUrl" placeholder="默认 https://upload.qiniup.com"></label>
        </div>

        <div class="card wx-card">
          <h3>微信公众号通知</h3>
          <p class="hint">不需要公众号通知时可以全部留空。配置后先保存设置，再点击绑定微信。</p>
          <p>当前状态：<b :class="wechatStatus.bound ? 'ok' : 'danger-text'">{{ wechatStatus.bound ? '已绑定' : '未绑定' }}</b></p>
        </div>
        <div class="card form-card">
          <label><span>AppID</span><input v-model="settings.wxAppid" placeholder="公众号 AppID"></label>
          <label><span>AppSecret</span><input v-model="settings.wxSecret" type="password" autocomplete="off" placeholder="公众号 AppSecret"></label>
          <label><span>模板ID</span><input v-model="settings.wxTemplateId" placeholder="模板消息 ID"></label>
          <label><span>网站域名</span><input v-model="settings.siteUrl" placeholder="https://你的访问域名"></label>
        </div>
        <div class="card wx-card">
          <button class="primary wide" @click="saveSettings">保存后台配置</button>
          <button class="ghost wide" @click="bindWechat">绑定微信</button>
          <button class="ghost wide" @click="manualNotify">手动执行一次通知检查</button>
        </div>

        <div class="card wx-card">
          <h3>数据</h3>
          <p class="hint">当前用户ID：{{ getUserId() }}</p>
          <button class="ghost wide" @click="loadAll">刷新同步</button>
          <button v-if="auth.required" class="ghost wide" @click="logoutAccess">退出访问</button>
          <button class="ghost wide" @click="resetUserId(); showToast('已恢复默认用户ID'); loadAll()">恢复默认用户ID</button>
        </div>
      </section>

      <div v-if="scannerVisible" class="modal-mask" @click.self="settings.autoCloseDialog && stopScanner()">
        <div class="scanner-box">
          <div id="reader"></div>
          <p>{{ scannerTip }}</p>
          <button class="primary wide" @click="stopScanner">关闭扫码</button>
        </div>
      </div>

      <div v-if="loading" class="loading">同步中...</div>
    </template>
  </main>
</template>
