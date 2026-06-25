<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { api, clearAccessToken, getUserId, resetUserId } from './services/api'
import { addDuration, describeDays, diffDays, formatDate, getStatus } from './utils/date'

const today = formatDate()
const screen = ref('home')
const loading = ref(false)
const toast = ref('')
const query = ref('')
const activeTab = ref('category')
const items = ref([])
const templates = ref([])
const selectedItem = ref(null)
const editingId = ref('')
const scannerVisible = ref(false)
const scannerInstance = ref(null)
const scannerTarget = ref('barcode')
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
  defaultCategory: '',
  autoCloseDialog: false
})

const form = reactive(emptyForm())

function emptyForm() {
  return {
    fromTemplate: false,
    name: '',
    category: '',
    imageUrl: '',
    tagText: '',
    tags: [],
    quantity: 1,
    warningQty: 0,
    startDate: today,
    shelfLifeValue: '',
    shelfLifeUnit: 'day',
    expiryDate: '',
    reminder: false,
    remindDays: 3,
    barcode: '',
    remark: '',
    saveToTemplate: false
  }
}

function applyEmpty() {
  Object.assign(form, emptyForm(), {
    category: settings.defaultCategory || '',
    remindDays: Number(settings.defaultRemindDays) || 3
  })
  editingId.value = ''
}

watch(() => [form.startDate, form.shelfLifeValue, form.shelfLifeUnit], () => {
  const next = addDuration(form.startDate, form.shelfLifeValue, form.shelfLifeUnit)
  if (next) form.expiryDate = next
})

let toastTimer
function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 2400)
}

function executeSearch() {
  query.value = query.value.trim()
  if (document?.activeElement?.blur) document.activeElement.blur()
}

async function loadAll() {
  if (auth.required && !auth.authed) return
  loading.value = true
  try {
    const [itemRes, tplRes, settingRes, wxRes] = await Promise.allSettled([
      api.listItems(),
      api.listTemplates(),
      api.getSettings(),
      api.checkWechatBind()
    ])
    if (itemRes.status === 'fulfilled') items.value = itemRes.value.items || []
    if (tplRes.status === 'fulfilled') templates.value = tplRes.value.templates || []
    if (settingRes.status === 'fulfilled') Object.assign(settings, settingRes.value.settings || {})
    if (wxRes.status === 'fulfilled') wechatStatus.value = wxRes.value
  } catch (e) {
    showToast(e.message)
  } finally {
    loading.value = false
  }
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

onMounted(async () => {
  await initAuth()
  if (auth.authed) await loadAll()
  const params = new URLSearchParams(location.search)
  if (params.get('wechat') === 'bound') {
    showToast('微信绑定成功')
    history.replaceState(null, '', location.pathname)
  }
})

const filteredItems = computed(() => {
  const key = query.value.trim().toLowerCase()
  const list = [...items.value].sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || ''))
  if (!key) return list
  return list.filter(item => [item.name, item.category, item.barcode, item.remark, ...(item.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(key))
})

const stats = computed(() => {
  const map = { normal: 0, expiring: 0, expired: 0, total: items.value.length, warning: 0, invalid: 0 }
  items.value.forEach(item => {
    const st = getStatus(item, Number(settings.nearDays) || 30)
    if (map[st.key] !== undefined) map[st.key]++
    if (Number(item.quantity) <= Number(item.warningQty || 0) && Number(item.warningQty || 0) > 0) map.warning++
    if (Number(item.quantity) <= 0) map.invalid++
  })
  return map
})

const categoryRows = computed(() => {
  const map = new Map()
  filteredItems.value.forEach(item => {
    const c = item.category || '未分类'
    map.set(c, (map.get(c) || 0) + 1)
  })
  return Array.from(map.entries()).map(([name, count]) => ({ name, count }))
})

const tagRows = computed(() => {
  const map = new Map()
  filteredItems.value.forEach(item => (item.tags || []).forEach(tag => map.set(tag, (map.get(tag) || 0) + 1)))
  return Array.from(map.entries()).map(([name, count]) => ({ name, count }))
})

const todoRows = computed(() => {
  return filteredItems.value
    .filter(item => ['expiring', 'expired'].includes(getStatus(item, Number(settings.nearDays) || 30).key))
    .map(item => ({ name: item.name, count: describeDays(diffDays(item.expiryDate)), item }))
})

function unitText(unit) {
  return { day: '天', month: '月', year: '年' }[unit] || '天'
}

function statClass(item) {
  return getStatus(item, Number(settings.nearDays) || 30).key
}

function openAdd(template) {
  applyEmpty()
  if (template) applyTemplate(template)
  screen.value = 'add'
}

function applyTemplate(tpl) {
  Object.assign(form, {
    fromTemplate: true,
    name: tpl.name || '',
    category: tpl.category || '',
    imageUrl: tpl.imageUrl || '',
    tags: [...(tpl.tags || [])],
    tagText: (tpl.tags || []).join('，'),
    quantity: tpl.quantity || 1,
    warningQty: tpl.warningQty || 0,
    shelfLifeValue: tpl.shelfLifeValue || '',
    shelfLifeUnit: tpl.shelfLifeUnit || 'day',
    reminder: tpl.reminder || false,
    remindDays: tpl.remindDays || settings.defaultRemindDays || 3,
    remark: tpl.remark || ''
  })
  showToast('已套用模板')
}

function openEdit(item) {
  editingId.value = item.id
  Object.assign(form, emptyForm(), JSON.parse(JSON.stringify(item)), {
    tagText: (item.tags || []).join('，'),
    saveToTemplate: false
  })
  screen.value = 'add'
}

function openDetail(item) {
  selectedItem.value = item
  screen.value = 'detail'
}

function backHome() {
  screen.value = 'home'
  selectedItem.value = null
  stopScanner()
}

function updateTags() {
  form.tags = form.tagText
    .split(/[，,\s]+/)
    .map(s => s.trim())
    .filter(Boolean)
}

function changeQty(field, delta) {
  form[field] = Math.max(0, Number(form[field] || 0) + delta)
}

function validateForm() {
  updateTags()
  if (!form.name.trim()) throw new Error('请输入名称')
  if (!form.category.trim()) throw new Error('请选择或输入分类')
  if (!form.expiryDate) throw new Error('请选择期限或到期日期')
}

function toPayload() {
  return {
    id: editingId.value || undefined,
    name: form.name.trim(),
    category: form.category.trim(),
    imageUrl: form.imageUrl.trim(),
    tags: form.tags,
    quantity: Number(form.quantity) || 0,
    warningQty: Number(form.warningQty) || 0,
    startDate: form.startDate,
    shelfLifeValue: form.shelfLifeValue ? Number(form.shelfLifeValue) : '',
    shelfLifeUnit: form.shelfLifeUnit,
    expiryDate: form.expiryDate,
    reminder: Boolean(form.reminder),
    remindDays: Number(form.remindDays) || 0,
    barcode: form.barcode.trim(),
    remark: form.remark.trim()
  }
}

async function saveItem(again = false, same = false) {
  try {
    validateForm()
    const payload = toPayload()
    if (editingId.value) await api.updateItem(payload)
    else await api.createItem(payload)
    if (form.saveToTemplate) await api.saveTemplate(payload)
    await loadAll()
    showToast(editingId.value ? '已修改' : '已保存')
    if (again) {
      const keep = same ? payload : null
      applyEmpty()
      if (keep) Object.assign(form, keep, { id: undefined, barcode: '', saveToTemplate: false, quantity: keep.quantity || 1 })
      screen.value = 'add'
    } else {
      backHome()
    }
  } catch (e) {
    showToast(e.message)
  }
}

async function removeItem(item) {
  if (!confirm(`确定删除「${item.name}」吗？`)) return
  try {
    await api.deleteItem(item.id)
    await loadAll()
    showToast('已删除')
    backHome()
  } catch (e) {
    showToast(e.message)
  }
}

async function removeTemplate(tpl) {
  if (!confirm(`确定删除模板「${tpl.name}」吗？`)) return
  try {
    await api.deleteTemplate(tpl.id)
    await loadAll()
    showToast('模板已删除')
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

async function startScanner(target = screen.value === 'home' ? 'query' : 'barcode') {
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
        if (scannerTarget.value === 'query') {
          query.value = decodedText
          showToast('已识别并填入关键词')
        } else {
          form.barcode = decodedText
          showToast('已识别条码')
        }
        stopScanner()
      },
      () => {}
    )
    scannerTip.value = scannerTarget.value === 'query'
      ? '请将条形码或二维码放入扫描框，识别后会填入关键词'
      : '请将条形码或二维码放入扫描框'
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
        <input v-model="query" placeholder="请输入关键词" />
        <button class="search-action" @click="executeSearch">搜索</button>
      </div>

      <div class="stats-grid">
        <button class="stat-card" @click="query = ''"><b>😊</b><span>正常 {{ stats.normal }}</span></button>
        <button class="stat-card" @click="activeTab='todo'"><b>😎</b><span>临期 {{ stats.expiring }}</span></button>
        <button class="stat-card" @click="activeTab='todo'"><b>😈</b><span>过期 {{ stats.expired }}</span></button>
        <button class="stat-card"><b>😄</b><span>总数 {{ stats.total }}</span></button>
        <button class="stat-card"><b>😐</b><span>数量预警 {{ stats.warning }}</span></button>
        <button class="stat-card"><b>😈</b><span>无效量 {{ stats.invalid }}</span></button>
      </div>

      <nav class="tabs">
        <button :class="{ active: activeTab === 'category' }" @click="activeTab = 'category'">分类</button>
        <button :class="{ active: activeTab === 'tag' }" @click="activeTab = 'tag'">标签</button>
        <button :class="{ active: activeTab === 'member' }" @click="activeTab = 'member'">成员</button>
        <button :class="{ active: activeTab === 'todo' }" @click="activeTab = 'todo'">待办</button>
      </nav>

      <div class="list-panel" v-if="activeTab === 'category'">
        <button v-for="row in categoryRows" :key="row.name" class="row" @click="query = row.name">
          <span>{{ row.name }}</span><em>{{ row.count }} ›</em>
        </button>
        <div v-if="!categoryRows.length" class="empty">暂无分类，点击右下角 + 添加</div>
      </div>

      <div class="list-panel" v-if="activeTab === 'tag'">
        <button v-for="row in tagRows" :key="row.name" class="row" @click="query = row.name">
          <span># {{ row.name }}</span><em>{{ row.count }} ›</em>
        </button>
        <div v-if="!tagRows.length" class="empty">暂无标签</div>
      </div>

      <div class="list-panel" v-if="activeTab === 'member'">
        <button class="row"><span>我</span><em>{{ getUserId().slice(0, 10) }}...</em></button>
      </div>

      <div class="list-panel" v-if="activeTab === 'todo'">
        <button v-for="row in todoRows" :key="row.item.id" class="row" @click="openDetail(row.item)">
          <span>{{ row.name }}</span><em>{{ row.count }} ›</em>
        </button>
        <div v-if="!todoRows.length" class="empty">暂无临期或过期物品</div>
      </div>

      <div v-if="!filteredItems.length && items.length" class="empty">没有匹配的物品</div>
      <div v-if="!items.length" class="empty">暂无物品，点击右下角 + 添加第一条记录</div>

      <div class="item-cards" v-if="filteredItems.length">
        <article v-for="item in filteredItems" :key="item.id" class="item-card" @click="openDetail(item)">
          <div class="thumb" :style="item.imageUrl ? { backgroundImage: `url(${item.imageUrl})` } : {}">
            <span v-if="!item.imageUrl">📷</span>
          </div>
          <div class="item-main">
            <strong>{{ item.name }}</strong>
            <small>{{ item.category }} · {{ item.expiryDate || '未设置期限' }}</small>
            <small>{{ describeDays(diffDays(item.expiryDate)) }}</small>
          </div>
          <i :class="['badge', statClass(item)]">{{ getStatus(item, settings.nearDays).label }}</i>
        </article>
      </div>

      <div class="fab-stack">
        <button class="fab small" @click="activeTab='todo'">效期<br>计算</button>
        <button class="fab fab-scan" @click="startScanner('query')" aria-label="扫码"><span class="scan-mark"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i></span></button>
        <button class="fab" @click="openAdd()">＋</button>
      </div>

      <button class="setting-entry" @click="screen='settings'">⚙ 设置</button>
    </section>

    <section v-if="screen === 'add'" class="page add-page">
      <header class="page-header">
        <button class="back-btn" @click="backHome" aria-label="返回">←</button>
        <strong class="page-title">{{ editingId ? '编辑' : '添加' }}</strong>
        <span class="header-placeholder"></span>
      </header>

      <div class="scan-line">
        <span class="scan-icon">⌗</span>
        <span>从模板库扫码</span>
        <label class="switch"><input type="checkbox" v-model="form.fromTemplate"><i></i></label>
        <button class="mini-btn" @click="screen='templates'">选择模板</button>
      </div>

      <p class="section-title">基本信息</p>
      <div class="card form-card">
        <label><span class="required">*名称</span><input v-model="form.name" placeholder="请输入名称"></label>
        <label><span class="required">*分类</span><input v-model="form.category" list="category-list" placeholder="请选择分类"></label>
        <datalist id="category-list"><option v-for="row in categoryRows" :key="row.name" :value="row.name" /></datalist>
        <label class="photo-line"><span>图片<small>增值服务</small></span><input v-model="form.imageUrl" placeholder="请输入图片链接"><em>📷</em></label>
        <label><span>标签</span><input v-model="form.tagText" placeholder="请选择标签，多个用逗号分隔" @blur="updateTags"></label>
        <label><span>数量</span><div class="stepper"><button @click.prevent="changeQty('quantity', -1)">−</button><input v-model.number="form.quantity"><button @click.prevent="changeQty('quantity', 1)">＋</button></div></label>
        <label><span>数量预警</span><div class="stepper"><button @click.prevent="changeQty('warningQty', -1)">−</button><input v-model.number="form.warningQty"><button @click.prevent="changeQty('warningQty', 1)">＋</button></div></label>
      </div>

      <p class="section-title">日期信息</p>
      <div class="card form-card">
        <label><span>日期</span><input type="date" v-model="form.startDate"></label>
        <label class="period"><span>期限</span><input type="number" v-model="form.shelfLifeValue" placeholder="请输入"><div class="units"><button :class="{on:form.shelfLifeUnit==='day'}" @click.prevent="form.shelfLifeUnit='day'">天</button><button :class="{on:form.shelfLifeUnit==='month'}" @click.prevent="form.shelfLifeUnit='month'">月</button><button :class="{on:form.shelfLifeUnit==='year'}" @click.prevent="form.shelfLifeUnit='year'">年</button></div></label>
        <label><span>到期日期</span><input type="date" v-model="form.expiryDate"></label>
        <label><span>提醒</span><div class="switch-row"><input class="remind-input" type="number" v-model.number="form.remindDays" min="0" placeholder="提前天数"><label class="switch"><input type="checkbox" v-model="form.reminder"><i></i></label></div></label>
      </div>

      <p class="section-title fold">其他信息 <span>⌄</span></p>
      <div class="card form-card">
        <label><span>条形码&二维码</span><input v-model="form.barcode" placeholder="请输入"><button class="scan-btn" @click.prevent="startScanner('barcode')">扫码</button></label>
        <label><span>备注</span><input v-model="form.remark" placeholder="请输入备注"></label>
        <label><span>同时保存到模板库</span><label class="switch"><input type="checkbox" v-model="form.saveToTemplate"><i></i></label></label>
      </div>

      <div class="save-actions">
        <button class="primary blue" @click="saveItem(false)">保存</button>
        <button class="primary" @click="saveItem(true, false)">保存再记</button>
        <button class="primary wide" @click="saveItem(true, true)">保存再记相同物品</button>
      </div>
    </section>

    <section v-if="screen === 'detail' && selectedItem" class="page detail-page">
      <header class="page-header">
        <button class="back-btn" @click="backHome" aria-label="返回">←</button>
        <strong class="page-title">详情</strong>
        <button class="text-action danger" @click="removeItem(selectedItem)">删除</button>
      </header>
      <article class="detail-card">
        <div class="big-thumb" :style="selectedItem.imageUrl ? { backgroundImage: `url(${selectedItem.imageUrl})` } : {}"><span v-if="!selectedItem.imageUrl">📷</span></div>
        <h2>{{ selectedItem.name }}</h2>
        <i :class="['badge', statClass(selectedItem)]">{{ getStatus(selectedItem, settings.nearDays).label }} · {{ describeDays(diffDays(selectedItem.expiryDate)) }}</i>
        <dl>
          <dt>分类</dt><dd>{{ selectedItem.category || '-' }}</dd>
          <dt>数量</dt><dd>{{ selectedItem.quantity }}</dd>
          <dt>生产/记录日期</dt><dd>{{ selectedItem.startDate || '-' }}</dd>
          <dt>保质期</dt><dd>{{ selectedItem.shelfLifeValue || '-' }} {{ unitText(selectedItem.shelfLifeUnit) }}</dd>
          <dt>到期日期</dt><dd>{{ selectedItem.expiryDate || '-' }}</dd>
          <dt>条码</dt><dd>{{ selectedItem.barcode || '-' }}</dd>
          <dt>标签</dt><dd>{{ (selectedItem.tags || []).join('，') || '-' }}</dd>
          <dt>备注</dt><dd>{{ selectedItem.remark || '-' }}</dd>
        </dl>
        <button class="primary wide" @click="openEdit(selectedItem)">修改</button>
      </article>
    </section>

    <section v-if="screen === 'templates'" class="page settings-page">
      <header class="page-header">
        <button class="back-btn" @click="screen='add'" aria-label="返回">←</button>
        <strong class="page-title">模板库</strong>
        <span class="header-placeholder"></span>
      </header>
      <div class="card list-panel template-list">
        <div v-if="!templates.length" class="empty">暂无模板，可在添加物品时开启“同时保存到模板库”</div>
        <div v-for="tpl in templates" :key="tpl.id" class="template-row">
          <button @click="applyTemplate(tpl);screen='add'">
            <strong>{{ tpl.name }}</strong>
            <small>{{ tpl.category }} · {{ tpl.shelfLifeValue || '-' }}{{ unitText(tpl.shelfLifeUnit) }}</small>
          </button>
          <button class="danger" @click="removeTemplate(tpl)">删除</button>
        </div>
      </div>
    </section>

    <section v-if="screen === 'settings'" class="page settings-page">
      <header class="page-header">
        <button class="back-btn" @click="backHome" aria-label="返回">←</button>
        <strong class="page-title">设置</strong>
        <span class="header-placeholder"></span>
      </header>
      <div class="card form-card">
        <label><span>临期天数</span><input type="number" v-model.number="settings.nearDays" placeholder="默认30"></label>
        <label><span>默认提前提醒</span><input type="number" v-model.number="settings.defaultRemindDays" placeholder="默认3"></label>
        <label><span>默认分类</span><input v-model="settings.defaultCategory" placeholder="可留空"></label>
        <label><span>弹框点空白关闭</span><label class="switch"><input type="checkbox" v-model="settings.autoCloseDialog"><i></i></label></label>
      </div>

      <div class="card wx-card">
        <h3>微信公众号通知</h3>
        <p>当前状态：<b :class="wechatStatus.bound ? 'ok' : 'danger-text'">{{ wechatStatus.bound ? '已绑定' : '未绑定' }}</b></p>
        <p class="hint">绑定后，定时任务会在物品临期或过期时尝试通过公众号模板消息通知你。</p>
        <button class="primary wide" @click="bindWechat">绑定微信</button>
        <button class="ghost wide" @click="manualNotify">手动执行一次通知检查</button>
      </div>

      <div class="card wx-card">
        <h3>数据</h3>
        <p class="hint">当前用户ID：{{ getUserId() }}</p>
        <button class="ghost wide" @click="loadAll">刷新同步</button>
        <button v-if="auth.required" class="ghost wide" @click="logoutAccess">退出访问</button>
        <button class="ghost wide" @click="resetUserId(); showToast('已生成新的本地用户ID'); loadAll()">重置本地用户ID</button>
      </div>

      <button class="primary wide" @click="saveSettings">保存设置</button>
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
