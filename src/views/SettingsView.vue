<template>
  <div class="settings-root">
    <h2 class="settings-title">设置</h2>

    <!-- BabyBuddy Settings -->
    <div class="settings-section">
      <div class="section-header">
        <span class="section-icon">🍼</span>
        <span class="section-label">BabyBuddy 服务器</span>
        <span v-if="bbTestResult?.ok" class="section-status section-status-ok">已连接</span>
      </div>
      <div class="section-card">
        <div class="field">
          <label class="field-label">服务器地址</label>
          <input v-model="bbUrl" type="url" placeholder="http://your-server:8000" class="field-input" @blur="saveBBUrl" />
          <p class="field-hint">填写到端口即可</p>
        </div>
        <div class="field">
          <label class="field-label">API Token</label>
          <input v-model="bbToken" type="text" placeholder="粘贴你的 BabyBuddy API Token" class="field-input field-input-mono" @blur="saveBBToken" />
          <p class="field-hint">BabyBuddy 网页 → 设置 → API → 生成新令牌</p>
        </div>
        <button @click="testBabyBuddy" :disabled="testingBB || !bbUrl || !bbToken" class="btn btn-primary w-full">
          <span v-if="testingBB" class="btn-spinner"></span>
          {{ testingBB ? '验证中...' : '测试连接' }}
        </button>
        <div v-if="bbTestResult" class="result-box" :class="bbTestResult.ok ? 'result-ok' : 'result-err'">
          {{ bbTestResult.message }}
        </div>
        <div v-if="isDevMode" class="dev-info">
          <p>Dev proxy: {{ proxyTarget || '(.env)' }}</p>
        </div>
      </div>
    </div>

    <!-- FnOS Settings -->
    <div class="settings-section">
      <div class="section-header">
        <span class="section-icon">📡</span>
        <span class="section-label">飞牛 NAS</span>
        <span v-if="fnosTestResult?.ok" class="section-status section-status-ok">已连接</span>
      </div>
      <div class="section-card">
        <div class="field-row">
          <div class="field field-flex">
            <label class="field-label">NAS 地址</label>
            <input v-model="fnosHost" type="url" placeholder="NAS地址或IPv6地址" class="field-input" @blur="saveFnos" />
          </div>
          <div class="field field-port">
            <label class="field-label">端口</label>
            <input v-model.number="fnosPort" type="number" placeholder="5666" class="field-input" @blur="saveFnos" />
          </div>
        </div>
        <div class="field-row">
          <div class="field field-flex">
            <label class="field-label">用户名</label>
            <input v-model="fnosUser" type="text" placeholder="admin" class="field-input" @blur="saveFnos" />
          </div>
          <div class="field field-flex">
            <label class="field-label">密码</label>
            <input v-model="fnosPass" type="password" placeholder="••••••••" class="field-input" @blur="saveFnos" />
          </div>
        </div>
        <button @click="testFnOS" :disabled="testingFnOS" class="btn btn-secondary w-full">
          <span v-if="testingFnOS" class="btn-spinner"></span>
          {{ testingFnOS ? '连接中...' : '测试连接' }}
        </button>
        <div v-if="fnosTestResult" class="result-box" :class="fnosTestResult.ok ? 'result-ok' : 'result-err'">
          {{ fnosTestResult.message }}
        </div>
      </div>
    </div>

    <!-- Photo Album Config -->
    <div class="settings-section">
      <div class="section-header">
        <span class="section-icon">📷</span>
        <span class="section-label">宝宝相册</span>
        <span v-if="settingsStore.fnosAlbumId" class="section-status section-status-ok">{{ settingsStore.fnosAlbumId }}</span>
      </div>
      <div class="section-card">
        <div class="field">
          <label class="field-label">相册地址</label>
          <input v-model="fnosAlbumUrl" type="url" placeholder="http://NAS:5666/p/album/59" class="field-input" />
          <p class="field-hint">粘贴飞牛相册完整地址，然后点保存</p>
        </div>
        <button @click="saveAlbumUrl" class="btn btn-primary w-full">保存相册地址</button>
        <div v-if="fnosAlbumUrl && !settingsStore.fnosAlbumId && albumSaved" class="result-box result-warn">
          无法识别相册 ID，请确认地址包含 /p/album/数字
        </div>
      </div>
    </div>

    <!-- About -->
    <div class="settings-section">
      <div class="section-header">
        <span class="section-icon">ℹ️</span>
        <span class="section-label">关于</span>
      </div>
      <div class="section-card section-card-flat">
        <div class="about-row">
          <span class="about-label">版本</span>
          <span class="about-value">宝宝管家 v2.0</span>
        </div>
        <div class="about-row">
          <span class="about-label">技术</span>
          <span class="about-value">Vue 3 + Vite + Capacitor</span>
        </div>
      </div>
    </div>

    <!-- Diagnostics -->
    <div class="settings-section">
      <div class="section-header">
        <span class="section-icon">🔧</span>
        <span class="section-label">运行诊断</span>
      </div>
      <div class="section-card">
        <p class="diag-desc">如遇连接或相册问题，点此收集诊断信息，截图反馈给开发者</p>
        <button @click="runDiagnostics" :disabled="diagRunning" class="btn btn-secondary w-full">
          <span v-if="diagRunning" class="btn-spinner"></span>
          {{ diagRunning ? '诊断中...' : '运行诊断' }}
        </button>
        <div v-if="diagResult" class="diag-result" @click="copyDiagResult">
          <pre class="diag-pre">{{ diagResult }}</pre>
          <p class="diag-tap-hint">👆 点击可复制</p>
        </div>
      </div>
    </div>

    <!-- Danger zone -->
    <div class="settings-section">
      <div class="section-card section-card-danger">
        <button @click="clearAllData" class="btn btn-danger w-full">清除所有本地数据</button>
      </div>
    </div>

    <div style="height: 72px;"></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { getFnOSClient, buildSignedApiRequest } from '../api/fnos'
import { setDevProxyTarget } from '../api/babybuddy'
import { isNativePlatform, createCapacitorAxiosAdapter, isCapacitorHttpAvailable, isLocalProxyRunning, nativeFetch, setLocalProxyConfig } from '../api/nativeHttp'
import { inject } from 'vue'
import axios from 'axios'
import { Capacitor, registerPlugin } from '@capacitor/core'

const settingsStore = useSettingsStore()
const showToast = inject('showToast')

const isDevMode = import.meta.env.DEV
const proxyTarget = ref(import.meta.env.VITE_BB_URL || '')

// Local edit copies
const bbUrl = ref(settingsStore.babybuddyUrl)
const bbToken = ref(settingsStore.babybuddyToken)
const fnosHost = ref(settingsStore.fnosHost)
const fnosPort = ref(settingsStore.fnosPort)
const fnosUser = ref(settingsStore.fnosUsername)
const fnosPass = ref(settingsStore.fnosPassword)
const fnosAlbumUrl = ref(settingsStore.fnosAlbumUrl)

const testingBB = ref(false)
const bbTestResult = ref(null)
const testingFnOS = ref(false)
const fnosTestResult = ref(null)
const albumSaved = ref(false)

const diagRunning = ref(false)
const diagResult = ref(null)

// Sync local refs with store on mount (in case pinia-persistedstate restored after module init)
onMounted(() => {
  bbUrl.value = settingsStore.babybuddyUrl || bbUrl.value
  bbToken.value = settingsStore.babybuddyToken || bbToken.value
  fnosHost.value = settingsStore.fnosHost || fnosHost.value
  fnosPort.value = settingsStore.fnosPort || fnosPort.value
  fnosUser.value = settingsStore.fnosUsername || fnosUser.value
  fnosPass.value = settingsStore.fnosPassword || fnosPass.value
  fnosAlbumUrl.value = settingsStore.fnosAlbumUrl || fnosAlbumUrl.value
  if (settingsStore.fnosAlbumId) {
    albumSaved.value = true
  }
})

function saveBBUrl() {
  const url = (bbUrl.value || '').replace(/\/$/, '').replace(/\/children.*$/, '').replace(/\/dashboard.*$/, '')
  settingsStore.babybuddyUrl = url
  if (import.meta.env.DEV && url) {
    setDevProxyTarget(url)
    proxyTarget.value = url
  }
}
function saveBBToken() { settingsStore.babybuddyToken = bbToken.value }
function saveFnos() {
  settingsStore.fnosHost = fnosHost.value
  settingsStore.fnosPort = fnosPort.value
  settingsStore.fnosUsername = fnosUser.value
  settingsStore.fnosPassword = fnosPass.value
}

function saveAlbumUrl() {
  settingsStore.parseAlbumUrl(fnosAlbumUrl.value)
  albumSaved.value = true

  if (settingsStore.fnosHost && !fnosHost.value) {
    fnosHost.value = settingsStore.fnosHost
  }
  if (settingsStore.fnosPort && (!fnosPort.value || fnosPort.value === 5666)) {
    fnosPort.value = settingsStore.fnosPort
  }

  if (settingsStore.fnosAlbumId) {
    showToast('相册地址已保存')
  } else {
    showToast('地址已保存但未能识别相册 ID', 'error')
  }
}

async function testBabyBuddy() {
  saveBBUrl()
  saveBBToken()

  const url = (bbUrl.value || '').replace(/\/$/, '').replace(/\/children.*$/, '').replace(/\/dashboard.*$/, '')

  if (!url) {
    bbTestResult.value = { ok: false, message: '请填写 BabyBuddy 服务器地址' }
    return
  }
  if (!bbToken.value) {
    bbTestResult.value = { ok: false, message: '请粘贴你的 API Token' }
    return
  }

  testingBB.value = true
  bbTestResult.value = null
  try {
    const useProxy = import.meta.env.DEV && proxyTarget.value && url === proxyTarget.value
    const baseURL = useProxy ? '' : url

    const api = axios.create({
      baseURL,
      timeout: 8000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${bbToken.value}`
      },
      ...(isNativePlatform() && isCapacitorHttpAvailable() ? { adapter: createCapacitorAxiosAdapter() } : {}),
    })

    const childRes = await api.get('/api/children/')
    const children = childRes.data.results || childRes.data

    if (Array.isArray(children) && children.length > 0) {
      const names = children.map(c => `${c.first_name}${c.last_name ? ' ' + c.last_name : ''}`).join(', ')
      bbTestResult.value = { ok: true, message: `连接成功! 找到 ${children.length} 个宝宝: ${names}` }
      showToast('验证成功')
    } else {
      bbTestResult.value = { ok: false, message: '连接成功但没有找到宝宝数据' }
    }
  } catch (e) {
    let msg = ''
    if (e.response?.status === 401 || e.response?.status === 403) {
      msg = 'Token 无效，请检查是否正确复制了完整内容'
    } else if (e.code === 'ECONNABORTED') {
      msg = '连接超时，请确认服务器可以访问'
    } else if (e.code === 'ERR_NETWORK') {
      msg = '网络不可达，请检查地址和端口'
    } else {
      msg = `连接失败: ${e.message || '未知错误'}`
    }
    bbTestResult.value = { ok: false, message: msg }
    showToast('连接失败', 'error')
  } finally {
    testingBB.value = false
  }
}

async function testFnOS() {
  saveFnos()

  if (!fnosHost.value || !fnosUser.value || !fnosPass.value) {
    fnosTestResult.value = { ok: false, message: '请填写完整的 NAS 地址、用户名和密码' }
    return
  }

  testingFnOS.value = true
  fnosTestResult.value = null

  const client = getFnOSClient()

  try {
    // Disconnect any existing connection
    if (client.ws) {
      client.disconnect()
    }

    await client.connect(fnosHost.value, fnosPort.value)
    const loginResult = await client.login(fnosUser.value, fnosPass.value)

    try { await client.getUserInfo() } catch { /* ignore */ }

    // On native platforms, configure the local proxy after successful login.
    // The proxy needs the cookie to forward authenticated requests to fnOS.
    if (isNativePlatform()) {
      const cookieStr = client.buildCookieString?.() || ''
      if (cookieStr) {
        try {
          await setLocalProxyConfig(cookieStr)
          console.log('[Settings] Local proxy config set after fnOS test')
        } catch (e) {
          console.warn('[Settings] Failed to set proxy config after fnOS test:', e.message)
        }
      }
    }

    fnosTestResult.value = { ok: true, message: `连接成功! uid=${loginResult.uid}` }
    settingsStore.fnosConnected = true
    showToast('飞牛 NAS 连接成功')
  } catch (e) {
    let msg = e.message || '未知错误'
    let detail = e.detail || ''
    if (msg.includes('WebSocket')) {
      msg = 'WebSocket 连接失败，请确认 NAS 地址和端口正确'
    } else if (msg.includes('无法解析')) {
      msg = '无法解析 NAS 域名，请检查地址是否正确。如使用 IPv6 地址，请直接填写 IP 地址（如 2408:8210:...）'
    } else if (msg.includes('登录失败')) {
      msg = '登录失败，请检查用户名和密码'
    } else if (msg.includes('API error')) {
      const match = msg.match(/API error (\d+)/)
      if (match) {
        const code = parseInt(match[1])
        msg = `服务器返回错误码 ${code}`
        if (detail) {
          // Show limited server response for debugging
          msg += `\n${detail}`
        }
        msg += '\n请关闭本应用后等待30秒再重新尝试'
      }
    }
    fnosTestResult.value = { ok: false, message: msg }
    settingsStore.fnosConnected = false
    showToast('连接失败', 'error')
  } finally {
    testingFnOS.value = false
  }
}

async function runDiagnostics() {
  diagRunning.value = true
  diagResult.value = null
  const lines = []
  const ts = new Date().toLocaleString('zh-CN', { hour12: false })
  const nowMs = Date.now()
  lines.push(`=== 宝宝管家诊断报告 ===`)
  lines.push(`时间: ${ts}`)
  lines.push(`Date.now(): ${nowMs}`)
  lines.push('')

  // 1. Environment info
  lines.push('【环境信息】')
  lines.push(`平台: ${Capacitor?.getPlatform?.() || 'unknown'}`)
  lines.push(`isNativePlatform: ${isNativePlatform()}`)
  lines.push(`CapacitorHttp静态检测: ${isCapacitorHttpAvailable()}`)
  // Check Capacitor.Plugins and PluginHeaders directly for debugging
  try {
    const hasInPlugins = !!Capacitor?.Plugins?.CapacitorHttp
    const pluginHeaders = Capacitor?.PluginHeaders
    const hasInHeaders = Array.isArray(pluginHeaders) && pluginHeaders.some(p => p.name === 'CapacitorHttp')
    lines.push(`Plugins中有CapacitorHttp: ${hasInPlugins}`)
    lines.push(`PluginHeaders中有: ${hasInHeaders}`)
  } catch (e) {
    lines.push(`插件检查异常: ${e.message}`)
  }
  try {
    lines.push(`UA: ${navigator.userAgent.substring(0, 120)}`)
  } catch { lines.push('UA: 无法获取') }
  lines.push('')

  // 2. Settings info
  lines.push('【配置信息】')
  lines.push(`BB地址: ${settingsStore.babybuddyUrl || '(未设置)'}`)
  lines.push(`BB Token: ${settingsStore.babybuddyToken ? '已设置(' + settingsStore.babybuddyToken.length + '字符)' : '(未设置)'}`)
  lines.push(`fnOS地址: ${settingsStore.fnosHost || '(未设置)'}`)
  lines.push(`fnOS端口: ${settingsStore.fnosPort || '(未设置)'}`)
  lines.push(`fnOS用户: ${settingsStore.fnosUsername || '(未设置)'}`)
  lines.push(`fnOS密码: ${settingsStore.fnosPassword ? '已设置' : '(未设置)'}`)
  lines.push(`相册ID: ${settingsStore.fnosAlbumId || '(未设置)'}`)
  lines.push('')

  // 3. Local proxy status
  lines.push('【本地代理】')
  try {
    const LocalMediaProxy = registerPlugin('LocalMediaProxy')
    const proxyStatus = await LocalMediaProxy.getStatus()
    lines.push(`代理状态: ${proxyStatus.running ? '✅ 运行中' : '❌ 未运行'}`)
    lines.push(`代理已配置: ${proxyStatus.hasCookie ? '✅ 已设置' : '❌ 未设置(503)'}`)
  } catch (e) {
    lines.push(`代理状态: 检查失败(${e.message})`)
  }

  // If proxy is running but not configured, try to configure it now
  const client = getFnOSClient()
  if (isNativePlatform() && client.token) {
    const cookieStr = client.buildCookieString?.() || ''
    if (cookieStr) {
      try {
        await setLocalProxyConfig(cookieStr)
        lines.push('代理配置: ✅ 已重新设置')
      } catch (e) {
        lines.push(`代理配置: ❌ 设置失败(${e.message})`)
      }
    } else {
      lines.push('代理配置: ⏭ 无cookie')
    }
  }
  lines.push('')

  // 4. WebSocket status — with detailed auth info
  lines.push('【WebSocket状态】')
  lines.push(`client.token: ${client.token ? '✅ ' + client.token.substring(0, 16) + '...' : '❌ 未登录'}`)
  lines.push(`client.signKey: ${client.signKey ? '✅ ' + client.signKey.substring(0, 12) + '...(len=' + client.signKey.length + ')' : '❌ 未设置'}`)
  lines.push(`client.backId: ${client.backId || '(无)'}`)
  lines.push(`client.sessionId: ${client.sessionId || '(无)'}`)
  lines.push(`ws状态: ${client.ws ? {0:'CONNECTING',1:'OPEN ✅',2:'CLOSING',3:'CLOSED ❌'}[client.ws.readyState] || 'UNKNOWN' : '❌ 无连接'}`)
  lines.push('')

  // 5. BabyBuddy API test
  lines.push('【BabyBuddy测试】')
  if (settingsStore.babybuddyUrl && settingsStore.babybuddyToken) {
    try {
      const url = settingsStore.babybuddyUrl.replace(/\/$/, '')
      const useProxy = import.meta.env.DEV && proxyTarget.value && url === proxyTarget.value
      const baseURL = useProxy ? '' : url
      const api = axios.create({
        baseURL,
        timeout: 8000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${settingsStore.babybuddyToken}`
        },
        ...(isNativePlatform() && isCapacitorHttpAvailable() ? { adapter: createCapacitorAxiosAdapter() } : {}),
      })
      const childRes = await api.get('/api/children/')
      const children = childRes.data.results || childRes.data
      lines.push(`连接: ✅ 成功, ${Array.isArray(children) ? children.length : 0}个宝宝`)
    } catch (e) {
      lines.push(`连接: ❌ ${e.response?.status || e.code || e.message}`)
    }
  } else {
    lines.push('连接: ⏭ 未配置')
  }
  lines.push('')

  // 6. fnOS HTTP API test — WITH authx signature!
  lines.push('【fnOS HTTP API测试】')
  if (settingsStore.fnosHost && client.token) {
    const params = {
      albumId: String(settingsStore.fnosAlbumId || '59'),
      startTime: '2000:01:01 00:00:00',
      endTime: '2099:12:31 23:59:59',
      offset: '0',
      limit: '1'
    }

    if (isNativePlatform()) {
      // Test via local proxy WITH authx signature
      try {
        const { url, headers, authxValue } = buildSignedApiRequest(client, 'album/baby/getList', params)
        lines.push(`authx签名: ${authxValue ? '✅ ' + authxValue.substring(0, 50) + '...' : '❌ 无签名'}`)
        const resp = await Promise.race([
          nativeFetch(url, { headers }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
        ])
        let body = ''
        try { body = await resp.text() } catch {}
        let code = ''
        try { code = JSON.parse(body).code } catch {}
        lines.push(`本地代理(签名): HTTP ${resp.status}${code !== '' ? ', code=' + code : ''}`)
        // Always show response preview (truncated) for debugging
        if (body.length > 0) {
          lines.push(`  响应: ${body.substring(0, 250)}`)
        }
      } catch (e) {
        lines.push(`本地代理(签名): ❌ ${e.message}`)
      }

      // Also test WITHOUT signature for comparison
      try {
        const resp = await Promise.race([
          nativeFetch('http://localhost:18080/fnos-proxy/api/album/baby/getList?limit=1', {
            headers: { 'Accept': 'application/json' }
          }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
        ])
        let body = ''
        try { body = await resp.text() } catch {}
        let code = ''
        try { code = JSON.parse(body).code } catch {}
        lines.push(`本地代理(无签名): HTTP ${resp.status}${code !== '' ? ', code=' + code : ''}`)
      } catch (e) {
        lines.push(`本地代理(无签名): ❌ ${e.message}`)
      }
    } else if (import.meta.env.DEV) {
      try {
        const { url, headers } = buildSignedApiRequest(client, 'album/baby/getList', params)
        const resp = await Promise.race([
          nativeFetch(url, { headers }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
        ])
        let body = ''
        try { body = await resp.text() } catch {}
        let code = ''
        try { code = JSON.parse(body).code } catch {}
        lines.push(`Vite代理(签名): HTTP ${resp.status}${code !== '' ? ', code=' + code : ''}`)
        if (body.length > 0 && body.length < 300) {
          lines.push(`  响应: ${body.substring(0, 200)}`)
        }
      } catch (e) {
        lines.push(`Vite代理: ❌ ${e.message}`)
      }
    } else {
      const host = settingsStore.fnosHost.replace(/^https?:\/\//, '').replace(/\/$/, '')
      const port = settingsStore.fnosPort || 5666
      const h = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
      try {
        const { url, headers } = buildSignedApiRequest(client, 'album/baby/getList', params)
        const resp = await Promise.race([
          nativeFetch(url, { headers }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
        ])
        let body = ''
        try { body = await resp.text() } catch {}
        let code = ''
        try { code = JSON.parse(body).code } catch {}
        lines.push(`直连(签名): HTTP ${resp.status}${code !== '' ? ', code=' + code : ''}`)
        if (body.length > 0 && body.length < 300) {
          lines.push(`  响应: ${body.substring(0, 200)}`)
        }
      } catch (e) {
        lines.push(`直连: ❌ ${e.message}`)
      }
    }
  } else {
    lines.push('⏭ fnOS未连接或未配置')
  }
  lines.push('')

  // 7. WebSocket API test
  lines.push('【WebSocket API测试】')
  if (client.ws && client.ws.readyState === WebSocket.OPEN) {
    // First test: user.info
    try {
      const info = await Promise.race([
        client.callApi('user.info', {}),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
      ])
      if (info.errno) {
        lines.push(`WS user.info: ❌ errno=${info.errno}`)
        lines.push(`  ⚠️ 可能原因: authToken未完成、签名错误、或该fnOS版本不支持此API`)
      } else {
        lines.push(`WS user.info: ✅ 用户=${info.username || info.name || 'ok'}`)
      }
    } catch (e) {
      lines.push(`WS user.info: ❌ ${e.message}${e.detail ? ', detail=' + e.detail.substring(0, 150) : ''}`)
    }

    // Second test: album API
    try {
      const result = await Promise.race([
        client.callApi('album.baby.getList', {
          albumId: String(settingsStore.fnosAlbumId || '59'),
          startTime: '2000:01:01 00:00:00',
          endTime: '2099:12:31 23:59:59',
          offset: '0',
          limit: '1'
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
      ])
      if (result.errno) {
        lines.push(`WS album.getList: ❌ errno=${result.errno}`)
        lines.push(`  detail: ${JSON.stringify(result).substring(0, 200)}`)
      } else {
        const data = result.data
        lines.push(`WS album.getList: ✅ 成功, ${Array.isArray(data) ? data.length + '条' : typeof data}`)
      }
    } catch (e) {
      lines.push(`WS album.getList: ❌ ${e.message}${e.detail ? ', detail=' + e.detail.substring(0, 150) : ''}`)
    }
  } else {
    lines.push('WS API: ⏭ WebSocket未连接')
  }
  lines.push('')

  // 8. DNS resolution test (only on native, with shorter timeout)
  if (isNativePlatform()) {
    lines.push('【DNS解析测试】')
    const fnosHostRaw = (settingsStore.fnosHost || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (fnosHostRaw && fnosHostRaw.includes('.') && !fnosHostRaw.match(/^\d/)) {
      lines.push(`域名: ${fnosHostRaw}`)
      // Fire both DNS queries in parallel with a shared 3-second timeout.
      // Don't block diagnostics for 10+ seconds if DNS-over-HTTPS is unavailable.
      const dnsServices = [
        { url: `https://dns.google/resolve?name=${encodeURIComponent(fnosHostRaw)}&type=AAAA`, label: 'Google' },
        { url: `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(fnosHostRaw)}&type=AAAA`, label: 'Cloudflare' }
      ]
      const dnsPromises = dnsServices.map(svc =>
        nativeFetch(svc.url, { headers: { 'Accept': 'application/dns-json' } })
          .then(async resp => {
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
            const dnsData = await resp.json()
            if (dnsData.Answer && dnsData.Answer.length > 0) {
              const records = dnsData.Answer.map(a => `${a.name} → ${a.data} (${a.type === 28 ? 'AAAA' : 'A'})`)
              return { label: svc.label, ok: true, records }
            }
            throw new Error('无DNS记录')
          })
          .catch(e => ({ label: svc.label, ok: false, error: e.message }))
      )
      const timeoutPromise = new Promise((_, rej) =>
        setTimeout(() => rej(new Error('timeout(3s)')), 3000)
      )
      try {
        const results = await Promise.race([Promise.all(dnsPromises), timeoutPromise])
        for (const r of results) {
          if (r.ok) {
            lines.push(`${r.label} DNS: ✅ ${r.records.join(', ')}`)
          } else {
            lines.push(`${r.label} DNS: ❌ ${r.error}`)
          }
        }
      } catch (e) {
        lines.push(`DNS查询: ❌ ${e.message}`)
      }
    } else {
      lines.push(`使用IP直连: ${fnosHostRaw || '(未设置)'}`)
    }
    lines.push('')
  }

  // 9. Time check — compare device time with HTTP server time
  lines.push('【时间检查】')
  lines.push(`设备时间: ${new Date().toISOString()}`)
  lines.push(`Date.now(): ${Date.now()}`)
  // Try to get a rough server time offset by checking HTTP Date header
  if (settingsStore.babybuddyUrl) {
    try {
      const t0 = Date.now()
      const resp = await Promise.race([
        fetch(settingsStore.babybuddyUrl.replace(/\/$/, '') + '/api/', { method: 'GET', mode: 'no-cors' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
      ])
      const t1 = Date.now()
      const serverDate = resp.headers?.get?.('date')
      if (serverDate) {
        const serverMs = new Date(serverDate).getTime()
        const offset = serverMs - (t0 + t1) / 2
        lines.push(`服务器时间: ${serverDate}`)
        lines.push(`时间偏移: ${offset > 0 ? '+' : ''}${Math.round(offset / 1000)}秒`)
        if (Math.abs(offset) > 300000) { // > 5 minutes
          lines.push(`⚠️ 设备时间与服务器差异超过5分钟！可能导致签名失败！`)
        }
      } else {
        lines.push(`服务器时间: 无法获取(no-cors响应无Date头)`)
      }
    } catch (e) {
      lines.push(`服务器时间: ❌ ${e.message}`)
    }
  } else {
    lines.push(`服务器时间: ⏭ BB地址未设置`)
  }
  lines.push('')

  lines.push('=== 诊断结束 ===')
  diagResult.value = lines.join('\n')
  diagRunning.value = false
}

function copyDiagResult() {
  if (!diagResult.value) return
  if (navigator.clipboard) {
    navigator.clipboard.writeText(diagResult.value).then(() => {
      showToast('诊断信息已复制到剪贴板')
    }).catch(() => {
      showToast('复制失败，请手动选择复制', 'error')
    })
  } else {
    // Fallback for environments without clipboard API
    try {
      const textarea = document.createElement('textarea')
      textarea.value = diagResult.value
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      showToast('诊断信息已复制到剪贴板')
    } catch {
      showToast('复制失败，请手动选择复制', 'error')
    }
  }
}

function clearAllData() {
  if (confirm('确定要清除所有本地数据吗？')) {
    settingsStore.$reset()
    bbUrl.value = ''
    bbToken.value = ''
    fnosHost.value = ''
    fnosPort.value = 5666
    fnosUser.value = ''
    fnosPass.value = ''
    fnosAlbumUrl.value = ''
    showToast('已清除所有数据')
  }
}
</script>

<style scoped>
.settings-root {
  padding: 16px;
  padding-bottom: calc(16px + 72px);
  max-width: 600px;
  margin: 0 auto;
}

.settings-title {
  font-size: 22px;
  font-weight: 800;
  color: #1f2937;
  margin: 0 0 24px 0;
}

.settings-section {
  margin-bottom: 20px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 0 4px;
}

.section-icon {
  font-size: 18px;
}

.section-label {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.section-status {
  margin-left: auto;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: 10px;
}

.section-status-ok {
  background: #d1fae5;
  color: #047857;
}

.section-card {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-card-flat {
  background: rgba(255, 255, 255, 0.5);
}

.section-card-danger {
  border-color: #fecaca;
  background: #fef2f2;
}

/* Field */
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
}

.field-input {
  padding: 10px 14px;
  font-size: 14px;
  border: 1.5px solid #e5e7eb;
  border-radius: 12px;
  background: #f9fafb;
  color: #1f2937;
  outline: none;
}

.field-input:focus {
  border-color: #93c5fd;
  background: #fff;
}

.field-input-mono {
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 12px;
}

.field-hint {
  font-size: 11px;
  color: #9ca3af;
  margin: 0;
}

.field-row {
  display: flex;
  gap: 10px;
}

.field-flex {
  flex: 1;
  min-width: 0;
}

.field-port {
  width: 100px;
  flex-shrink: 0;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 11px 20px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.btn:active {
  transform: scale(0.97);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-primary {
  background: #3b82f6;
  color: #fff;
}

.btn-primary:disabled {
  background: #93c5fd;
}

.btn-secondary {
  background: #f0f9ff;
  color: #0369a1;
  border: 1px solid #bae6fd;
}

.btn-danger {
  background: transparent;
  color: #dc2626;
  font-size: 13px;
  padding: 10px;
}

.btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.btn-secondary .btn-spinner {
  border-color: rgba(3,105,161,0.2);
  border-top-color: #0369a1;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.w-full {
  width: 100%;
}

/* Result box */
.result-box {
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-line;
}

.result-ok {
  background: #ecfdf5;
  color: #047857;
}

.result-err {
  background: #fef2f2;
  color: #dc2626;
}

.result-warn {
  background: #fffbeb;
  color: #b45309;
}

.dev-info {
  padding: 8px 12px;
  background: #fffbeb;
  border-radius: 8px;
  font-size: 11px;
  color: #92400e;
  margin: 0;
}

/* About */
.about-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
}

.about-row + .about-row {
  border-top: 1px solid rgba(0, 0, 0, 0.04);
}

.about-label {
  font-size: 13px;
  color: #9ca3af;
}

.about-value {
  font-size: 13px;
  color: #374151;
  font-weight: 500;
}

/* Small screen */
@media (max-width: 480px) {
  .settings-root {
    padding: 12px;
    padding-bottom: calc(12px + 72px);
  }
}

/* Diagnostics */
.diag-desc {
  font-size: 12px;
  color: #9ca3af;
  margin: 0;
}

.diag-result {
  background: #1f2937;
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  overflow: hidden;
}

.diag-pre {
  font-family: 'SF Mono', 'Menlo', 'Consolas', 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.6;
  color: #e5e7eb;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}

.diag-tap-hint {
  font-size: 11px;
  color: #9ca3af;
  text-align: center;
  margin: 8px 0 0 0;
}
</style>
