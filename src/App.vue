<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { api, clearAccessToken } from './services/api'
import { addDuration, describeDays, diffDays, formatDate, getStatus } from './utils/date'

const today = formatDate()
const isAdminPath = location.pathname.replace(/\/+$/, '') === '/admin'
const screen = ref(isAdminPath ? 'admin' : 'home')
const stack = ref([])
const loading = ref(false)
const toast = ref('')
const query = ref('')
const homeFilter = ref('all')
const selectedCategory = ref('')
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
  defaultCategory: '家庭常备',
  categories: ['家庭常备', '感冒发热', '肠胃用药', '消毒护理', '儿童用药', '慢病用药'],
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
    defaultShelfLifeUnit: 'month',
    remark: ''
  }
}

function emptyRecord() {
  return {
    productId: '',
    productName: '',
    category: '',
    imageUrl: '',
    barcode: '',
    tagText: '',
    tags: [],
    quantity: 1,
    warningQty: 0,
    startDate: today,
    shelfLifeValue: '',
    shelfLifeUnit: 'day',
    expiryDate: '',
    reminder: true,
    remindDays: 7,
    location: '',
    remark: '',
    saveTemplate: false
  }
}

watch(() => [recordForm.startDate, recordForm.shelfLifeValue, recordForm.shelfLifeUnit], () => {
  const next = addDuration(recordForm.startDate, recordForm.shelfLifeValue, recordForm.shelfLifeUnit)
  if (next) recordForm.expiryDate = next
})

let toastTimer
function showToast(message) {
  toast.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 2600)
}

function navigate(target) {
  if (screen.value !== target) stack.value.push(screen.value)
  screen.value = target
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function back() {
  stopScanner()
  screen.value = stack.value.pop() || 'home'
}

function backHome() {
  stack.value = []
  homeFilter.value = 'all'
  selectedCategory.value = ''
  query.value = ''
  screen.value = 'home'
  selectedProduct.value = null
  selectedRecord.value = null
  stopScanner()
}

async function initAuth() {
  auth.checking = true
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
  if (!auth.password.trim()) return
  loading.value = true
  try {
    await api.verifyAccess(auth.password, auth.remember)
    auth.authed = true
    auth.password = ''
    await loadAll()
  } catch (e) {
    auth.error = e.message || '访问密码错误'
  } finally {
    loading.value = false
  }
}

async function loadAll() {
  if (auth.required && !auth.authed) return
  loading.value = true
  try {
    const [p, r, s, w] = await Promise.allSettled([
      api.listProducts(),
      api.listRecords(),
      api.getSettings(),
      api.checkWechatBind()
    ])
    if (p.status === 'fulfilled') products.value = p.value.products || []
    if (r.status === 'fulfilled') records.value = r.value.records || []
    if (s.status === 'fulfilled') Object.assign(settings, s.value.settings || {})
    if (w.status === 'fulfilled') wechatStatus.value = w.value || { bound: false }
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await initAuth()
  if (auth.authed) {
    await loadAll()
    if (isAdminPath) screen.value = 'admin'
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
  return productMap.value.get(record.productId) || record.productSnapshot || {
    name: record.productName || '未命名药品'
  }
}

const recordCards = computed(() => records.value
  .map(record => ({ record, product: productOf(record) }))
  .sort((a, b) => (a.record.expiryDate || '9999').localeCompare(b.record.expiryDate || '9999')))

const stats = computed(() => {
  const result = { total: records.value.length, normal: 0, expiring: 0, expired: 0 }
  records.value.forEach(r => {
    const key = getStatus(r, Number(settings.nearDays) || 30).key
    if (result[key] !== undefined) result[key]++
  })
  return result
})

const categories = computed(() => {
  const names = [...(settings.categories || []), ...products.value.map(p => p.category)]
  return Array.from(new Set(names.filter(Boolean)))
})

const filteredProducts = computed(() => {
  const key = query.value.trim().toLowerCase()
  const list = [...products.value].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-CN'))
  if (!key) return list
  return list.filter(p => [p.name, p.category, p.barcode, p.remark, ...(p.tags || [])]
    .filter(Boolean).join(' ').toLowerCase().includes(key))
})

const categoryCounts = computed(() => categories.value.map(name => ({
  name,
  count: recordCards.value.filter(({ product }) => (product.category || '未分类') === name).length
})))

const homeRecordCards = computed(() => {
  const key = query.value.trim().toLowerCase()
  let list = recordCards.value

  if (homeFilter.value === 'expiring') {
    list = list.filter(({ record }) => getStatus(record, Number(settings.nearDays) || 30).key === 'expiring')
  } else if (homeFilter.value === 'expired') {
    list = list.filter(({ record }) => getStatus(record, Number(settings.nearDays) || 30).key === 'expired')
  } else if (homeFilter.value === 'category') {
    if (!selectedCategory.value) return []
    list = list.filter(({ product }) => (product.category || '未分类') === selectedCategory.value)
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

const homeFilterTitle = computed(() => {
  if (homeFilter.value === 'expiring') return '即将过期'
  if (homeFilter.value === 'expired') return '已过期'
  if (homeFilter.value === 'category') return selectedCategory.value || '我的分类'
  return '全部药品'
})

function setHomeFilter(filter) {
  homeFilter.value = filter
  if (filter !== 'category') selectedCategory.value = ''
}

function chooseHomeCategory(name) {
  homeFilter.value = 'category'
  selectedCategory.value = name
}

function statClass(record) {
  return getStatus(record, Number(settings.nearDays) || 30).key
}

function unitText(unit) {
  return { day: '天', month: '月', year: '年' }[unit] || '天'
}

function imageStyle(url) {
  if (!url) return {}
  return { backgroundImage: `url("${String(url).replace(/"/g, '%22')}")` }
}

function applyProductToRecord(product) {
  if (!product) return
  recordForm.productId = product.id
  recordForm.productName = product.name || ''
  recordForm.category = product.category || settings.defaultCategory || ''
  recordForm.imageUrl = product.imageUrl || ''
  recordForm.barcode = product.barcode || ''
  recordForm.tags = [...(product.tags || [])]
  recordForm.tagText = recordForm.tags.join('，')
  if (product.defaultShelfLifeValue) recordForm.shelfLifeValue = product.defaultShelfLifeValue
  if (product.defaultShelfLifeUnit) recordForm.shelfLifeUnit = product.defaultShelfLifeUnit
}

function matchRecordProductByName() {
  const name = recordForm.productName.trim().toLowerCase()
  if (!name) return
  const product = products.value.find(p => String(p.name || '').trim().toLowerCase() === name)
  if (product) applyProductToRecord(product)
}

function openProductForm(product = null) {
  Object.assign(productForm, emptyProduct(), {
    category: settings.defaultCategory || categories.value[0] || '家庭常备'
  })
  editingProductId.value = ''
  if (product) {
    editingProductId.value = product.id
    Object.assign(productForm, JSON.parse(JSON.stringify(product)), {
      tagText: (product.tags || []).join('，')
    })
  }
  navigate('productForm')
}

function openRecordForm(record = null, product = null) {
  Object.assign(recordForm, emptyRecord(), {
    remindDays: Number(settings.defaultRemindDays) || 7,
    category: settings.defaultCategory || categories.value[0] || '家庭常备'
  })
  editingRecordId.value = ''
  if (product) applyProductToRecord(product)
  if (record) {
    editingRecordId.value = record.id
    Object.assign(recordForm, JSON.parse(JSON.stringify(record)))
    const snapshot = productOf(record)
    recordForm.productName = snapshot.name || record.productName || ''
    recordForm.category = snapshot.category || recordForm.category || ''
    recordForm.imageUrl = snapshot.imageUrl || ''
    recordForm.barcode = snapshot.barcode || ''
    recordForm.tags = [...(snapshot.tags || [])]
    recordForm.tagText = recordForm.tags.join('，')
    recordForm.saveTemplate = Boolean(record.productId)
  }
  navigate('recordForm')
}

function openProductDetail(product) {
  selectedProduct.value = product
  navigate('productDetail')
}

function openRecordDetail(record) {
  selectedRecord.value = record
  navigate('recordDetail')
}

function updateProductTags() {
  productForm.tags = String(productForm.tagText || '')
    .split(/[，,\s]+/).map(x => x.trim()).filter(Boolean)
}

async function saveProduct() {
  updateProductTags()
  if (!productForm.name.trim()) return showToast('请输入药品名称')
  if (!productForm.category.trim()) return showToast('请选择药品分类')
  loading.value = true
  try {
    const payload = {
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
    if (editingProductId.value) await api.updateProduct(payload)
    else await api.createProduct(payload)
    await loadAll()
    showToast('药品资料已保存')
    stack.value = []
    screen.value = 'productList'
  } catch (e) {
    showToast(e.message)
  } finally {
    loading.value = false
  }
}

function recordTags() {
  return String(recordForm.tagText || '')
    .split(/[，,\s]+/)
    .map(x => x.trim())
    .filter(Boolean)
}

async function ensureRecordProduct() {
  const selected = productMap.value.get(recordForm.productId)
  if (selected) return selected

  const typed = recordForm.productName.trim()
  const existing = products.value.find(p => String(p.name || '').trim().toLowerCase() === typed.toLowerCase())
  if (existing) return existing
  if (!recordForm.saveTemplate) return null

  const created = await api.createProduct({
    name: typed,
    category: recordForm.category || settings.defaultCategory || '家庭常备',
    barcode: recordForm.barcode || '',
    imageUrl: recordForm.imageUrl || '',
    tags: recordTags(),
    defaultShelfLifeValue: recordForm.shelfLifeValue ? Number(recordForm.shelfLifeValue) : '',
    defaultShelfLifeUnit: recordForm.shelfLifeUnit,
    remark: recordForm.remark || ''
  })
  return created.product
}

async function saveRecord(continueAdd = false) {
  if (!recordForm.productName.trim() && !recordForm.productId) return showToast('请输入药品名称')
  if (!recordForm.category.trim()) return showToast('请选择分类')
  if (!recordForm.expiryDate) return showToast('请选择失效日期')
  loading.value = true
  try {
    const product = await ensureRecordProduct()
    const snapshot = product ? {
      id: product.id,
      name: product.name,
      category: product.category,
      barcode: product.barcode,
      imageUrl: product.imageUrl,
      tags: product.tags || []
    } : {
      name: recordForm.productName.trim(),
      category: recordForm.category.trim(),
      barcode: recordForm.barcode.trim(),
      imageUrl: recordForm.imageUrl.trim(),
      tags: recordTags()
    }

    const payload = {
      id: editingRecordId.value || undefined,
      productId: product?.id || recordForm.productId || '',
      productName: snapshot.name,
      productSnapshot: snapshot,
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
    if (editingRecordId.value) await api.updateRecord(payload)
    else await api.createRecord(payload)
    await loadAll()
    showToast('临期记录已保存')
    if (continueAdd) openRecordForm(null, product)
    else backHome()
  } catch (e) {
    showToast(e.message)
  } finally {
    loading.value = false
  }
}

async function deleteProduct(product) {
  if (!confirm(`确定删除「${product.name}」？历史效期记录仍会保留快照。`)) return
  try {
    await api.deleteProduct(product.id)
    await loadAll()
    stack.value = []
    screen.value = 'productList'
  } catch (e) {
    showToast(e.message)
  }
}

async function deleteRecord(record) {
  if (!confirm('确定删除这条药品记录？')) return
  try {
    await api.deleteRecord(record.id)
    await loadAll()
    backHome()
  } catch (e) {
    showToast(e.message)
  }
}

async function saveSettings() {
  try {
    await api.saveSettings({ ...settings })
    showToast('设置已保存')
  } catch (e) {
    showToast(e.message)
  }
}

async function uploadImage(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  loading.value = true
  try {
    const data = await api.uploadImageToQiniu(file)
    productForm.imageUrl = data.url
    showToast('图片上传成功')
  } catch (e) {
    showToast(e.message || '图片上传失败')
  } finally {
    loading.value = false
  }
}

async function uploadRecordImage(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  loading.value = true
  try {
    const data = await api.uploadImageToQiniu(file)
    recordForm.imageUrl = data.url
    showToast('图片上传成功')
  } catch (e) {
    showToast(e.message || '图片上传失败')
  } finally {
    loading.value = false
  }
}

function findByBarcode(code) {
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
      { fps: 10, qrbox: { width: 250, height: 150 } },
      code => {
        if (target === 'productBarcode') {
          productForm.barcode = code
        } else if (target === 'recordProduct') {
          const p = findByBarcode(code)
          if (p) applyProductToRecord(p)
          else recordForm.barcode = code
        } else {
          query.value = code
        }
        stopScanner()
      },
      () => {}
    )
    scannerTip.value = '请将药品条形码放入扫描框'
  } catch {
    scannerTip.value = '摄像头启动失败，请检查 HTTPS 和浏览器摄像头权限。'
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


async function bindWechat() {
  try {
    const data = await api.getWechatBindUrl()
    if (!data?.url) throw new Error('未生成微信授权链接，请先保存微信配置')
    location.href = data.url
  } catch (e) {
    showToast(e.message || '微信绑定失败')
  }
}

async function manualNotify() {
  try {
    const data = await api.runNotify()
    showToast(`通知检查完成：发送 ${data.sent || 0} 条，跳过 ${data.skipped || 0} 条`)
  } catch (e) {
    showToast(e.message || '通知检查失败')
  }
}

function openAdmin() {
  location.href = '/admin/'
}

function openHome() {
  location.href = '/'
}

function logout() {
  clearAccessToken()
  auth.authed = false
  auth.required = true
}
</script>

<template>
  <main class="phone-shell">
    <div v-if="toast" class="toast">{{ toast }}</div>

    <section v-if="auth.checking" class="access-page">
      <div class="access-card">
        <div class="app-icon"><i></i></div>
        <h1>临期账本</h1>
        <p>药品效期管理</p>
      </div>
    </section>

    <section v-else-if="auth.required && !auth.authed" class="access-page">
      <form class="access-card" @submit.prevent="submitAccessPassword">
        <div class="app-icon"><i></i></div>
        <h1>临期账本</h1>
        <p>记住每一份药，守护家人的健康</p>
        <input v-model="auth.password" type="password" placeholder="请输入访问密码">
        <label class="remember"><input type="checkbox" v-model="auth.remember"> 记住登录状态</label>
        <span v-if="auth.error" class="error-text">{{ auth.error }}</span>
        <button class="primary" type="submit">进入药箱</button>
      </form>
    </section>

    <template v-else>
      <section v-if="screen === 'home'" class="page home-page">
        <header class="home-brandbar">
          <div>
            <h1>临期账本</h1>
            <p>守护家人健康 · 让每一份药品不浪费</p>
          </div>
          <button class="home-bell" @click="navigate('settings')" aria-label="设置">♧<i></i></button>
        </header>

        <section class="home-hero-card">
          <div class="hero-copy">
            <h2>管理药品有效期<br>守护家人健康</h2>
            <p>及时提醒 · 避免过期 · 科学用药</p>
            <span>小小记录&nbsp;&nbsp;大大安心</span>
          </div>
          <div class="hero-medicine" aria-hidden="true">
            <div class="hero-shield">＋</div>
            <div class="hero-bottle"><i></i></div>
            <div class="hero-pill"></div>
          </div>
          <div class="hero-dots"><i></i><i></i><i></i></div>
        </section>

        <div class="home-metrics">
          <button class="home-metric all" :class="{ selected: homeFilter === 'all' }" @click="setHomeFilter('all')">
            <span class="metric-icon">▣</span><b>{{ stats.total }}</b><small>全部药品</small>
          </button>
          <button class="home-metric expiring" :class="{ selected: homeFilter === 'expiring' }" @click="setHomeFilter('expiring')">
            <span class="metric-icon">◷</span><b>{{ stats.expiring }}</b><small>即将过期</small>
          </button>
          <button class="home-metric expired" :class="{ selected: homeFilter === 'expired' }" @click="setHomeFilter('expired')">
            <span class="metric-icon">!</span><b>{{ stats.expired }}</b><small>已过期</small>
          </button>
          <button class="home-metric category" :class="{ selected: homeFilter === 'category' }" @click="setHomeFilter('category')">
            <span class="metric-icon">▰</span><b>{{ categories.length }}</b><small>我的分类</small>
          </button>
        </div>

        <div v-if="homeFilter === 'category'" class="home-category-panel">
          <button
            v-for="row in categoryCounts"
            :key="row.name"
            :class="{ active: selectedCategory === row.name }"
            @click="chooseHomeCategory(row.name)"
          ><span>{{ row.name }}</span><b>{{ row.count }}</b></button>
          <div v-if="!categoryCounts.length" class="home-empty-categories">暂无分类</div>
        </div>

        <section class="home-record-list" :class="{ 'category-mode': homeFilter === 'category' }">
          <button v-for="card in homeRecordCards" :key="card.record.id" class="home-record-row" @click="openRecordDetail(card.record)">
            <div class="record-thumb" :style="imageStyle(card.product.imageUrl)"><span v-if="!card.product.imageUrl">💊</span></div>
            <div class="record-main">
              <strong>{{ card.product.name || card.record.productName || '未命名药品' }}</strong>
              <small>{{ card.record.expiryDate || '-' }} 失效<span v-if="card.record.quantity !== undefined"> · 数量 {{ card.record.quantity }}</span></small>
            </div>
            <i :class="['record-status', statClass(card.record)]">{{ describeDays(diffDays(card.record.expiryDate)) }}</i>
            <em>›</em>
          </button>

          <div v-if="!homeRecordCards.length" class="home-list-empty">
            <span>✓</span>
            <strong>{{ homeFilterTitle }}暂无记录</strong>
            <small v-if="homeFilter === 'category' && !selectedCategory">请选择上方分类</small>
            <small v-else>点击下方“+”添加临期记录</small>
          </div>
        </section>

        <section class="health-tip-card">
          <div class="health-tip-icon">✓</div>
          <div><strong>定期检查药品</strong><small>让健康多一份保障</small></div>
          <em>›</em>
        </section>

        <nav class="tabbar simple-tabbar">
          <button class="active" @click="backHome()"><b>⌂</b><span>首页</span></button>
          <button class="center-add" @click="openRecordForm()">＋</button>
          <button @click="navigate('settings')"><b>♙</b><span>我的</span></button>
        </nav>
      </section>

      <section v-if="screen === 'productList'" class="page sub-page">
        <header class="page-header"><button @click="back">‹</button><strong>药品资料</strong><button class="header-action" @click="openProductForm()">新增</button></header>
        <div class="searchbar compact-search">
          <span>⌕</span><input v-model="query" placeholder="搜索药品名称、条码、分类"><button @click="startScanner('query')"><b class="scan-icon"></b></button>
        </div>
        <section class="panel list-panel products-panel">
          <div class="category-scroll"><button :class="{active: !query}" @click="query=''">全部</button><button v-for="c in categories" :key="c" @click="query=c">{{ c }}</button></div>
          <button v-for="product in filteredProducts" :key="product.id" class="medicine-row" @click="openProductDetail(product)">
            <div class="thumb" :style="imageStyle(product.imageUrl)"><span v-if="!product.imageUrl">💊</span></div>
            <div class="row-main"><strong>{{ product.name }}</strong><div class="chips"><span>{{ product.category || '未分类' }}</span></div><small>{{ product.barcode || '无条码' }} · 默认有效期 {{ product.defaultShelfLifeValue || '-' }}{{ unitText(product.defaultShelfLifeUnit) }}</small></div><em class="arrow">›</em>
          </button>
          <div v-if="!filteredProducts.length" class="empty-state"><span>＋</span><strong>暂无药品资料</strong><small>点击右上角新增药品</small></div>
        </section>
      </section>

      <section v-if="screen === 'productForm'" class="page sub-page">
        <header class="page-header"><button @click="back">‹</button><strong>{{ editingProductId ? '编辑药品资料' : '新增药品资料' }}</strong><span></span></header>

        <button class="scan-entry" @click="startScanner('productBarcode')"><span class="scan-box"><b></b></span><div><strong>扫描药品条码</strong><small>快速填入药品条码信息</small></div><em>›</em></button>

        <div class="form-card">
          <label><span>药品名称 <i>*</i></span><input v-model="productForm.name" placeholder="请输入药品名称"></label>
          <label><span>药品分类 <i>*</i></span><select v-model="productForm.category"><option value="">请选择</option><option v-for="c in categories" :key="c">{{ c }}</option></select></label>
          <label><span>条形码</span><input v-model="productForm.barcode" placeholder="请输入或扫码"></label>
          <label><span>标签</span><input v-model="productForm.tagText" placeholder="如 OTC、处方药、外用药"></label>
          <label class="period"><span>默认有效期</span><input type="number" v-model="productForm.defaultShelfLifeValue"><select v-model="productForm.defaultShelfLifeUnit"><option value="day">天</option><option value="month">月</option><option value="year">年</option></select></label>
          <label><span>图片地址</span><input v-model="productForm.imageUrl" placeholder="七牛云图片地址"></label>
          <label class="upload-line"><span>药品图片</span><label class="upload-btn">上传图片<input type="file" accept="image/*" @change="uploadImage"></label></label>
          <label class="textarea-label"><span>备注 / 说明</span><textarea v-model="productForm.remark" placeholder="可记录通用名称、厂家、适应症或其他说明"></textarea></label>
        </div>
        <button class="primary page-primary" @click="saveProduct">保存药品资料</button>
      </section>

      <section v-if="screen === 'recordForm'" class="page sub-page record-form-page">
        <header class="page-header"><button @click="back">‹</button><strong>{{ editingRecordId ? '编辑临期记录' : '新增临期记录' }}</strong><span></span></header>

        <section class="record-section-card">
          <header class="record-section-head"><span class="section-icon">▣</span><strong>基本信息</strong><small>填写药品的基础信息</small></header>
          <div class="record-field required-field">
            <label>名称</label>
            <div class="record-control"><input v-model="recordForm.productName" list="record-product-options" placeholder="请输入药品名称" @input="recordForm.productId=''" @change="matchRecordProductByName" /><datalist id="record-product-options"><option v-for="p in products" :key="p.id" :value="p.name"></option></datalist></div>
          </div>
          <div class="record-field required-field">
            <label>分类</label>
            <div class="record-control"><select v-model="recordForm.category"><option value="">请选择分类</option><option v-for="c in categories" :key="c" :value="c">{{ c }}</option></select><em>›</em></div>
          </div>
          <div class="record-field image-field">
            <label><b>图片</b><small>支持选择图片并上传</small></label>
            <div class="record-image-actions">
              <div v-if="recordForm.imageUrl" class="record-image-preview" :style="imageStyle(recordForm.imageUrl)"></div>
              <label class="record-camera">▣<input type="file" accept="image/*" @change="uploadRecordImage"></label>
            </div>
          </div>
          <div class="record-field">
            <label>标签</label>
            <div class="record-control"><input v-model="recordForm.tagText" placeholder="如 OTC、处方药、外用药"><em>›</em></div>
          </div>
          <div class="record-field">
            <label>数量</label>
            <div class="number-stepper"><button @click="recordForm.quantity=Math.max(0, Number(recordForm.quantity||0)-1)">−</button><b>{{ recordForm.quantity }}</b><button @click="recordForm.quantity=Number(recordForm.quantity||0)+1">＋</button></div>
          </div>
          <div class="record-field">
            <label>数量预警</label>
            <div class="number-stepper"><button @click="recordForm.warningQty=Math.max(0, Number(recordForm.warningQty||0)-1)">−</button><b>{{ recordForm.warningQty }}</b><button @click="recordForm.warningQty=Number(recordForm.warningQty||0)+1">＋</button></div>
          </div>
        </section>

        <section class="record-section-card">
          <header class="record-section-head"><span class="section-icon">▦</span><strong>日期信息</strong><small>设置有效期，及时提醒</small></header>
          <div class="record-field"><label>生产日期</label><div class="record-control"><input type="date" v-model="recordForm.startDate"><em>›</em></div></div>
          <div class="record-field duration-field">
            <label>期限</label>
            <div class="duration-control"><input type="number" min="0" v-model="recordForm.shelfLifeValue" placeholder="请输入"><div class="duration-units"><button :class="{active:recordForm.shelfLifeUnit==='day'}" @click="recordForm.shelfLifeUnit='day'">天</button><button :class="{active:recordForm.shelfLifeUnit==='month'}" @click="recordForm.shelfLifeUnit='month'">月</button><button :class="{active:recordForm.shelfLifeUnit==='year'}" @click="recordForm.shelfLifeUnit='year'">年</button></div></div>
          </div>
          <div class="record-field required-field"><label>失效日期</label><div class="record-control"><input type="date" v-model="recordForm.expiryDate"><em>›</em></div></div>
          <div class="record-field reminder-field">
            <label><b>提醒</b><small>提前 {{ recordForm.remindDays }} 天提醒</small></label>
            <div class="reminder-actions"><input class="remind-days-input" type="number" min="0" v-model.number="recordForm.remindDays"><label class="new-switch"><input type="checkbox" v-model="recordForm.reminder"><i></i></label></div>
          </div>
        </section>

        <section class="record-section-card">
          <header class="record-section-head"><span class="section-icon">◇</span><strong>其他信息</strong><small>补充信息，便于管理</small></header>
          <button class="record-field button-field" @click="startScanner('recordProduct')"><label>条形码 &amp; 二维码</label><div class="record-control"><span class="scan-inline">⌗</span><input v-model="recordForm.barcode" placeholder="点击扫描或输入" @click.stop><em>›</em></div></button>
          <div class="record-field"><label>存放位置</label><div class="record-control"><input v-model="recordForm.location" placeholder="如 家庭药箱 / 抽屉"></div></div>
          <div class="record-field"><label>备注</label><div class="record-control"><input v-model="recordForm.remark" placeholder="请输入备注"><em>›</em></div></div>
          <div class="record-field reminder-field"><label><b>同时保存到模板库</b><small>下次可快速添加相同药品</small></label><label class="new-switch"><input type="checkbox" v-model="recordForm.saveTemplate"><i></i></label></div>
        </section>

        <div class="record-bottom-actions">
          <button class="record-save-light" @click="saveRecord(false)">保存</button>
          <button class="record-save-primary" @click="saveRecord(true)">保存再记</button>
        </div>
      </section>

      <section v-if="screen === 'productDetail' && selectedProduct" class="page sub-page">
        <header class="page-header"><button @click="back">‹</button><strong>药品资料</strong><button class="header-action" @click="openProductForm(selectedProduct)">编辑</button></header>

        <div class="product-hero">
          <div class="hero-thumb" :style="imageStyle(selectedProduct.imageUrl)"><span v-if="!selectedProduct.imageUrl">💊</span></div>
          <div><div class="title-with-tag"><h2>{{ selectedProduct.name }}</h2><b v-if="selectedProduct.tags?.[0]">{{ selectedProduct.tags[0] }}</b></div>
          <div class="chips"><span>{{ selectedProduct.category || '未分类' }}</span><span v-for="tag in (selectedProduct.tags || []).slice(1)" :key="tag" class="soft">{{ tag }}</span></div>
          <p>{{ selectedProduct.remark || '已建立药品资料，可继续管理不同批次的效期记录。' }}</p></div>
        </div>

        <div class="detail-card">
          <div class="detail-title"><strong>基本信息</strong><button @click="openProductForm(selectedProduct)">✎ 编辑</button></div>
          <dl><dt>药品分类</dt><dd>{{ selectedProduct.category || '-' }}</dd><dt>条形码</dt><dd>{{ selectedProduct.barcode || '-' }}</dd><dt>默认有效期</dt><dd>{{ selectedProduct.defaultShelfLifeValue || '-' }} {{ unitText(selectedProduct.defaultShelfLifeUnit) }}</dd><dt>标签</dt><dd>{{ (selectedProduct.tags || []).join('，') || '-' }}</dd></dl>
        </div>

        <div class="detail-card"><div class="detail-title"><strong>效期管理</strong></div><p class="detail-copy">同一种药可以建立多个批次记录，分别管理生产日期、失效日期、数量与存放位置。</p><button class="primary" @click="openRecordForm(null, selectedProduct)">＋ 新增药品记录</button></div>
        <button class="danger-outline" @click="deleteProduct(selectedProduct)">删除药品资料</button>
      </section>

      <section v-if="screen === 'recordDetail' && selectedRecord" class="page sub-page">
        <header class="page-header"><button @click="back">‹</button><strong>记录详情</strong><button class="header-action" @click="openRecordForm(selectedRecord)">编辑</button></header>

        <div class="record-hero">
          <div class="hero-thumb" :style="imageStyle(productOf(selectedRecord).imageUrl)"><span v-if="!productOf(selectedRecord).imageUrl">💊</span></div>
          <div><h2>{{ productOf(selectedRecord).name }}</h2><div class="chips"><span>{{ productOf(selectedRecord).category || '未分类' }}</span></div></div>
        </div>

        <div class="status-pair">
          <div><small>库存数量</small><b>{{ selectedRecord.quantity }}</b></div>
          <div><small>剩余天数</small><b :class="statClass(selectedRecord)">{{ describeDays(diffDays(selectedRecord.expiryDate)) }}</b></div>
        </div>

        <div class="detail-card"><dl>
          <dt>生产日期</dt><dd>{{ selectedRecord.startDate || '-' }}</dd>
          <dt>失效日期</dt><dd>{{ selectedRecord.expiryDate || '-' }}</dd>
          <dt>有效期</dt><dd>{{ selectedRecord.shelfLifeValue || '-' }} {{ unitText(selectedRecord.shelfLifeUnit) }}</dd>
          <dt>存放位置</dt><dd>{{ selectedRecord.location || '-' }}</dd>
          <dt>备注</dt><dd>{{ selectedRecord.remark || '-' }}</dd>
        </dl></div>
        <button class="danger-outline" @click="deleteRecord(selectedRecord)">删除记录</button>
      </section>

      <section v-if="screen === 'settings'" class="page sub-page settings-page">
        <header class="page-header"><button @click="back">‹</button><strong>我的</strong><span></span></header>
        <div class="settings-banner"><div class="app-icon small"><i></i></div><div><strong>临期账本</strong><p>记录 · 提醒 · 守护家人的健康</p></div></div>
        <div class="settings-list">
          <button @click="navigate('basicSettings')"><span>🔔</span><div><strong>药品提醒设置</strong><small>临期天数与默认提醒时间</small></div><em>›</em></button>
          <button @click="loadAll"><span>↻</span><div><strong>刷新同步</strong><small>重新加载最新数据</small></div><em>›</em></button>
          <button @click="navigate('productList')"><span>▣</span><div><strong>药品资料管理</strong><small>{{ products.length }} 种药品资料</small></div><em>›</em></button>
          <button @click="openAdmin"><span>⚙</span><div><strong>后台配置</strong><small>七牛云、公众号和高级设置</small></div><em>›</em></button>
        </div>
        <button v-if="auth.required" class="logout-btn" @click="logout">退出登录</button>
      </section>

      <section v-if="screen === 'basicSettings'" class="page sub-page">
        <header class="page-header"><button @click="back">‹</button><strong>提醒设置</strong><span></span></header>
        <div class="form-card">
          <label><span>临期天数</span><input type="number" min="0" v-model.number="settings.nearDays"><em>天</em></label>
          <label><span>默认提前提醒</span><input type="number" min="0" v-model.number="settings.defaultRemindDays"><em>天</em></label>
          <label><span>默认药品分类</span><input v-model="settings.defaultCategory"></label>
        </div>
        <button class="primary page-primary" @click="saveSettings">保存设置</button>
      </section>


      <section v-if="screen === 'admin'" class="page sub-page admin-page">
        <header class="page-header">
          <button @click="openHome">‹</button>
          <strong>后台配置</strong>
          <span></span>
        </header>

        <div class="admin-hero">
          <div class="app-icon small"><i></i></div>
          <div>
            <strong>临期账本 · 后台</strong>
            <p>七牛云图片、微信公众号、数据同步与通知</p>
          </div>
        </div>

        <p class="admin-section-title">七牛云图片上传</p>
        <div class="form-card admin-form">
          <label><span>AccessKey</span><input v-model="settings.qiniuAccessKey" placeholder="七牛云 AccessKey"></label>
          <label><span>SecretKey</span><input v-model="settings.qiniuSecretKey" type="password" placeholder="七牛云 SecretKey"></label>
          <label><span>Bucket</span><input v-model="settings.qiniuBucket" placeholder="空间名称"></label>
          <label><span>访问域名</span><input v-model="settings.qiniuDomain" placeholder="https://img.example.com"></label>
          <label><span>上传域名</span><input v-model="settings.qiniuUploadUrl" placeholder="https://upload.qiniup.com"></label>
        </div>

        <p class="admin-section-title">微信公众号通知</p>
        <div class="admin-status-card">
          <div>
            <strong>微信绑定状态</strong>
            <p>{{ wechatStatus.bound ? '当前用户已绑定微信' : '当前用户尚未绑定微信' }}</p>
          </div>
          <span :class="{ ok: wechatStatus.bound }">{{ wechatStatus.bound ? '已绑定' : '未绑定' }}</span>
        </div>
        <div class="form-card admin-form">
          <label><span>AppID</span><input v-model="settings.wxAppid" placeholder="公众号 AppID"></label>
          <label><span>AppSecret</span><input v-model="settings.wxSecret" type="password" placeholder="公众号 AppSecret"></label>
          <label><span>模板 ID</span><input v-model="settings.wxTemplateId" placeholder="模板消息 ID"></label>
          <label><span>网站域名</span><input v-model="settings.siteUrl" placeholder="https://你的域名"></label>
        </div>

        <button class="primary page-primary" @click="saveSettings">保存后台配置</button>
        <div class="admin-action-grid">
          <button class="secondary" @click="bindWechat">绑定微信</button>
          <button class="secondary" @click="manualNotify">测试临期通知</button>
          <button class="secondary" @click="loadAll">刷新同步</button>
          <button class="secondary" @click="openHome">返回首页</button>
        </div>
        <button v-if="auth.required" class="logout-btn" @click="logout">退出访问</button>
      </section>

      <div v-if="scannerVisible" class="modal-mask" @click.self="stopScanner">
        <div class="scanner-card"><div id="reader"></div><p>{{ scannerTip }}</p><button class="primary" @click="stopScanner">关闭扫码</button></div>
      </div>

      <div v-if="loading" class="loading">同步中...</div>
    </template>
  </main>
</template>
