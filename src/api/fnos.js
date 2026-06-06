import JSEncrypt from 'jsencrypt'
import CryptoJS from 'crypto-js'
import { nativeFetch, isNativePlatform, isCapacitorHttpAvailable } from './nativeHttp'
import { Capacitor, CapacitorHttp } from '@capacitor/core'

// Authx signing constants (reverse-engineered from fnOS web UI bundle)
// See signing functions below for the full algorithm.

export class FnOSClient {
  constructor() {
    this.ws = null
    this.token = null
    this.longToken = null   // HTTP photo API auth
    this.secret = null
    this.backId = '0000000000000000'
    this.sessionId = null
    this.reqIndex = 0
    this.pendingRequests = new Map()
    this.listeners = new Map()
    this.reconnectTimer = null

    // Encryption keys - generated per session (matching fnOS module-level pattern)
    this.rsaPub = null
    this.aesKey = this._generateRandomString(32)
    this.aesIv = CryptoJS.lib.WordArray.random(16)  // Use WordArray directly (like fnOS's os.random(16))
    this.ivBase64 = this.aesIv.toString(CryptoJS.enc.Base64)  // Pre-compute IV as Base64 (like fnOS's aHe)
    this.signKey = null  // Base64-encoded sign key (derived from login response secret)
  }

  // ========== Connection ==========

  /**
   * Normalize a host string for use in URLs.
   * Handles IPv6 addresses by wrapping them in brackets.
   * e.g. "2408:8210:6023:be30:aaa1:59ff:fe22:7885" → "[2408:8210:6023:be30:aaa1:59ff:fe22:7885]"
   * e.g. "192.168.1.100" → "192.168.1.100"
   */
  static normalizeHost(host) {
    const clean = host.replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^\[/, '').replace(/\]$/, '')
    // IPv6 addresses contain colons (and no dots like IPv4)
    if (clean.includes(':') && !clean.startsWith('[')) {
      return `[${clean}]`
    }
    return clean
  }

  async connect(host, port = 5666) {
    // Store host/port for reconnection
    this._host = host
    this._port = port

    const protocol = host.startsWith('https') ? 'wss' : 'ws'
    const cleanHost = FnOSClient.normalizeHost(host)
    let wsUrl = `${protocol}://${cleanHost}:${port}/websocket?type=main`

    console.log('[FnOS] Connecting to:', wsUrl)

    // NOTE: We used to do a DNS pre-check here via CapacitorHttp before opening
    // the WebSocket. This was removed because:
    // 1. CapacitorHttp.request() cannot be cancelled by JS Promise.race — the
    //    native request continues running in background even after JS timeout,
    //    blocking subsequent requests and causing 20+ second delays.
    // 2. On this phone's network, DNS-over-HTTPS is blocked, but OS DNS works
    //    fine (browser and WebSocket both resolve the domain instantly).
    // 3. The pre-check added no value — if OS DNS fails, WebSocket will fail
    //    quickly anyway; if OS DNS works, the pre-check just wastes time.
    //
    // We now connect WebSocket directly. If it fails with a DNS error, the
    // onerror handler will report it immediately.

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl)

      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'))
      }, 10000)

      this.ws.onopen = () => {
        clearTimeout(timeout)
        console.log('[FnOS] WebSocket connected')
        this._getRSAPub()
          .then(() => resolve())
          .catch(reject)
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this._handleMessage(data)
        } catch (e) {
          console.error('[FnOS] Parse error:', e)
        }
      }

      this.ws.onerror = (error) => {
        clearTimeout(timeout)
        console.error('[FnOS] WebSocket error:', error)
        reject(new Error('WebSocket 连接失败，请确认 NAS 地址和端口正确'))
      }

      this.ws.onclose = (event) => {
        console.log('[FnOS] WebSocket closed:', event.code, event.reason)
        if (this.token && !this.reconnectTimer) {
          console.log('[FnOS] Reconnecting in 3s...')
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null
            this.connect(this._host, this._port).catch(console.error)
          }, 3000)
        }
      }
    })
  }

  // ========== DNS Resolution ==========

  /**
   * Try to resolve a domain name to an IP address using external DNS services.
   * This is used as a fallback when WebView's WebSocket can't resolve IPv6-only domains.
   * Tries Google DNS-over-HTTPS first, then Cloudflare.
   * @param {string} domain - The domain to resolve (e.g. "fn.060608.xyz")
   * @returns {Promise<string|null>} The resolved IP address or null
   */
  async _resolveDomainToIp(domain) {
    // Only available when CapacitorHttp is present
    if (!CapacitorHttp?.request) {
      console.warn('[FnOS] Cannot resolve domain: CapacitorHttp not available')
      return null
    }

    const services = [
      // Google DNS-over-HTTPS
      {
        url: `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=AAAA`,
        extract: (data) => {
          const answer = data.Answer?.find(a => a.type === 28) // AAAA record
          return answer?.data || null
        }
      },
      // Also try A record (IPv4)
      {
        url: `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`,
        extract: (data) => {
          const answer = data.Answer?.find(a => a.type === 1) // A record
          return answer?.data || null
        }
      },
    ]

    // Race all DNS queries with a 3-second timeout — don't block for too long.
    // On some networks, external DNS-over-HTTPS is unavailable but local DNS works.
    const dnsPromises = services.map(svc =>
      CapacitorHttp.request({
        url: svc.url, method: 'GET', responseType: 'text',
        headers: { 'Accept': 'application/dns-json' }
      }).then(resp => {
        if (resp.status === 200 && resp.data) {
          const data = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data
          const ip = svc.extract(data)
          if (ip) {
            console.log('[FnOS] Resolved', domain, '→', ip, 'via', svc.url)
            return ip
          }
        }
        throw new Error('No record')
      }).catch(e => {
        console.warn('[FnOS] DNS resolve service failed:', svc.url, e?.message || e)
        return null
      })
    )

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 3000)
    )

    try {
      const results = await Promise.race([
        Promise.all(dnsPromises).then(ips => ips.find(ip => ip !== null)),
        timeoutPromise
      ])
      return results || null
    } catch (e) {
      console.warn('[FnOS] DNS resolution timeout or failed:', e?.message || e)
      return null
    }
  }

  // ========== Encryption ==========

  _generateRandomString(length) {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    let result = ''
    const randomValues = new Uint8Array(length)
    crypto.getRandomValues(randomValues)
    for (let i = 0; i < length; i++) {
      result += chars[randomValues[i] % chars.length]
    }
    return result
  }

  _generateRandomBytes(length) {
    const bytes = new Uint8Array(length)
    crypto.getRandomValues(bytes)
    return Array.from(bytes)
  }

  _generateReqId() {
    this.reqIndex++
    const t = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0')
    const e = this.reqIndex.toString(16).padStart(4, '0')
    return `${t}${this.backId}${e}`
  }

  // RSA PKCS1_v1_5 encryption
  _rsaEncrypt(plaintext) {
    const encrypt = new JSEncrypt()
    encrypt.setPublicKey(this.rsaPub)
    const encrypted = encrypt.encrypt(plaintext)
    if (!encrypted) {
      throw new Error('RSA encryption failed')
    }
    return encrypted
  }

  // AES-CBC encryption
  // CRITICAL: Use CryptoJS.enc.Utf8.parse() for the key (not Buffer.from().buffer).
  // In Node.js, Buffer.from().buffer returns a POOL ArrayBuffer (8KB), not a
  // precise-size buffer. This caused sigBytes=8192 and completely wrong encryption.
  // In the browser, new TextEncoder().encode().buffer is always exact-size.
  _aesEncrypt(data, key, iv) {
    const keyWA = CryptoJS.enc.Utf8.parse(key)
    // Use duck typing instead of instanceof (CryptoJS.lib.WordArray may not be available in browser)
    const ivWA = (iv && typeof iv === 'object' && iv.sigBytes !== undefined && iv.words !== undefined)
      ? iv
      : CryptoJS.lib.WordArray.create(new Uint8Array(iv))
    const encrypted = CryptoJS.AES.encrypt(data, keyWA, {
      iv: ivWA,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    })
    // Use .ciphertext.toString(Base64) for raw ciphertext (matching fnOS's .ciphertext.toString(Sd))
    return encrypted.ciphertext.toString(CryptoJS.enc.Base64)
  }

  // AES-CBC decryption
  // Returns the decrypted bytes encoded as Base64 (sign key is binary, not UTF-8 text).
  _aesDecrypt(ciphertext, key, iv) {
    const keyWA = CryptoJS.enc.Utf8.parse(key)
    // Use duck typing instead of instanceof (CryptoJS.lib.WordArray may not be available in browser)
    const ivWA = (iv && typeof iv === 'object' && iv.sigBytes !== undefined && iv.words !== undefined)
      ? iv
      : CryptoJS.lib.WordArray.create(new Uint8Array(iv))
    const decrypted = CryptoJS.AES.decrypt(ciphertext, keyWA, {
      iv: ivWA,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    })
    // Sign key is binary data — encode as Base64, NOT UTF-8
    // (fnOS stores the decrypted secret via .toString(Sd) where Sd=Base64)
    return decrypted.toString(CryptoJS.enc.Base64)
  }

  // HMAC-SHA256 signature
  _getSignature(dataStr, keyBase64) {
    const keyBytes = CryptoJS.enc.Base64.parse(keyBase64)
    const hmac = CryptoJS.HmacSHA256(dataStr, keyBytes)
    return CryptoJS.enc.Base64.stringify(hmac)
  }

  // Build signed request message
  _buildSignedMessage(data) {
    const noSignReqs = ['encrypted', 'util.getSI', 'util.crypto.getRSAPub']
    const jsonStr = JSON.stringify(data)

    if (noSignReqs.includes(data.req) || !this.signKey) {
      return jsonStr
    }

    const signature = this._getSignature(jsonStr, this.signKey)
    return signature + jsonStr
  }

  // ========== API Communication ==========

  _sendRequest(reqName, params = {}, timeout = 15000) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'))
        return
      }

      const reqid = this._generateReqId()
      const payload = { req: reqName, reqid, ...params }

      const message = this._buildSignedMessage(payload)

      this.pendingRequests.set(reqid, { resolve, reject })
      setTimeout(() => {
        if (this.pendingRequests.has(reqid)) {
          this.pendingRequests.delete(reqid)
          reject(new Error(`Request ${reqName} timeout`))
        }
      }, timeout)

      console.log('[FnOS] Sending:', reqName)
      this.ws.send(message)
    })
  }

  async _getRSAPub() {
    const result = await this._sendRequest('util.crypto.getRSAPub')
    this.sessionId = result.si
    this.rsaPub = result.pub
    console.log('[FnOS] Got RSA pub, si:', this.sessionId)
  }

  // ========== Login ==========

  async login(username, password) {
    const loginData = {
      req: 'user.login',
      reqid: this._generateReqId(),
      user: username,
      password: password,
      deviceType: 'Browser',
      deviceName: 'BabyBuddy-App',
      stay: true,
      si: this.sessionId
    }

    const loginJson = JSON.stringify(loginData)

    // Build encrypted payload (matching fnOS's FV function exactly)
    const rsaEncrypted = this._rsaEncrypt(this.aesKey)
    const aesEncrypted = this._aesEncrypt(loginJson, this.aesKey, this.aesIv)

    const encryptedPayload = {
      req: 'encrypted',
      iv: this.ivBase64,
      rsa: rsaEncrypted,
      aes: aesEncrypted
    }

    const message = JSON.stringify(encryptedPayload)

    const reqid = loginData.reqid
    const result = await new Promise((resolve, reject) => {
      this.pendingRequests.set(reqid, { resolve, reject })
      setTimeout(() => {
        if (this.pendingRequests.has(reqid)) {
          this.pendingRequests.delete(reqid)
          reject(new Error('Login timeout'))
        }
      }, 15000)

      console.log('[FnOS] Sending encrypted login')
      this.ws.send(message)
    })

    if (result.result === 'succ') {
      this.token = result.token
      this.secret = result.secret
      this.backId = result.backId

      // Extract longToken for HTTP API auth (try both camelCase and snake_case)
      this.longToken = result.longToken || (result.long_token != null ? String(result.long_token) : '')

      try {
        this.signKey = this._aesDecrypt(result.secret, this.aesKey, this.aesIv)
        console.log('[FnOS] Login success')
        console.log('[FnOS]   token:', this.token ? this.token.substring(0, 20) + '...' : 'none')
        console.log('[FnOS]   longToken:', this.longToken ? this.longToken.substring(0, 20) + '...' : 'none')
        console.log('[FnOS]   signKey:', this.signKey ? 'yes' : 'no')
      } catch (e) {
        console.error('[FnOS] Failed to decrypt sign_key:', e)
      }

      // Send authToken to complete authentication (matching fnOS flow)
      if (this.signKey && this.token) {
        try {
          // fnOS sends authToken with HMAC signature: hmac_base64 + jsonPayload
          // The si comes from util.getSI (separate from getRSAPub's si)
          const authPayload = {
            req: 'user.authToken',
            reqid: this._generateReqId(),
            token: this.token,
            si: this.sessionId
          }
          const authJson = JSON.stringify(authPayload)
          const sig = this._getSignature(authJson, this.signKey)
          this.ws.send(sig + authJson)
          console.log('[FnOS] Sent user.authToken')
        } catch (e) {
          console.error('[FnOS] authToken failed:', e)
        }

        // Save auth to localStorage for persistence
        try {
          localStorage.setItem('fnos-auth', JSON.stringify({
            token: this.token,
            longToken: this.longToken,
            signKey: this.signKey
          }))
          console.log('[FnOS] Auth saved to localStorage')
        } catch (e) {
          console.warn('[FnOS] Failed to save auth:', e)
        }
      }

      return result
    } else {
      throw new Error(`登录失败 (错误码: ${result.errno || 'unknown'})`)
    }
  }

  // ========== Message Handling ==========

  _handleMessage(data) {
    if (data.reqid && this.pendingRequests.has(data.reqid)) {
      const { resolve, reject } = this.pendingRequests.get(data.reqid)
      this.pendingRequests.delete(data.reqid)

      if (data.errno) {
        const detail = JSON.stringify(data).substring(0, 300)
        console.error('[FnOS] API error:', data.errno, detail)
        const err = new Error(`API error ${data.errno}`)
        err.detail = detail  // Attach full response for UI display
        reject(err)
      } else {
        resolve(data)
      }
      return
    }

    if (data.req && this.listeners.has(data.req)) {
      this.listeners.get(data.req).forEach(cb => cb(data))
    }
  }

  // ========== Public API ==========

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event).add(callback)
    return () => this.listeners.get(event)?.delete(callback)
  }

  async callApi(apiName, params = {}) {
    return this._sendRequest(apiName, params)
  }

  async getUserInfo() {
    return this._sendRequest('user.info')
  }

  /**
   * Build the full Cookie string for HTTP requests (matches FMphoto's buildFnApiCookieHeader)
   */
  buildCookieString() {
    let parts = []
    if (this.token) {
      parts.push(`fnos-token=${this.token}`)
      parts.push('language=zh-CN')
    }
    if (this.longToken) {
      parts.push(`fnos-long-token=${this.longToken}`)
    }
    if (this.token) {
      parts.push(`Trim-MC-token=${this.token}`)
    }
    parts.push('mode=relay')
    return parts.join('; ')
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      try { this.ws.close() } catch (e) { console.warn('[FnOS] Error closing WS:', e.message) }
      this.ws = null
    }
    this.token = null
    this.longToken = null
    this.secret = null
    this.signKey = null
    this.backId = '0000000000000000'
    this.pendingRequests.clear()
  }
}

// ========== Gallery Authx Signing ==========
// Reverse-engineered from DOqe_--ccRnf6RVD.js (fnOS web UI main bundle)
// Verified against real browser requests via Playwright interception.
// The web UI signs every gallery API request with an authx header.

const AUTHX_KEY = 'NDzZTVxnRKP8Z0jXg1VAMonaG8akvh'
const AUTHX_API_KEY = 'EAECCF25-80A6-4666-A7C2-A76904A74AB6'

/**
 * Xe equivalent: split URL by '?' → [rawPath, queryParamsObject]
 * Does NOT strip any prefix — uses the FULL path as-is.
 */
function _splitUrlPath(url) {
  const idx = url.indexOf('?')
  if (idx === -1) return [url, {}]
  const rawPath = url.substring(0, idx)
  const qs = url.substring(idx + 1)
  const params = {}
  new URLSearchParams(qs).forEach((v, k) => { params[k] = v })
  return [rawPath, params]
}

/**
 * Ye equivalent: sort keys → new URLSearchParams → toString() → replace(/\+/g, '%20')
 */
function _buildSortedQuery(params) {
  const keys = Object.keys(params)
    .filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
  const sp = new URLSearchParams()
  for (const k of keys) {
    sp.set(k, String(params[k]))
  }
  return sp.toString().replace(/\+/g, '%20')
}

/**
 * Ze equivalent: fix malformed percent-encoding → decodeURIComponent → MD5 (inner hash)
 */
function _innerHash(queryString) {
  // Fix malformed percent encoding (bare % not followed by two hex digits → %25)
  const fixed = queryString.replace(/%(?![0-9A-Fa-f]{2})/gi, '%25')
  try {
    const decoded = decodeURIComponent(fixed)
    return CryptoJS.MD5(decoded).toString()
  } catch {
    return CryptoJS.MD5(queryString).toString()
  }
}

/**
 * Generate a 6-digit padded random nonce: "100000" to "999999"
 * Matching: String(Math.floor(Math.random() * 900000) + 100000).padStart(6, '0')
 */
function _authxNonce() {
  return String(Math.floor(Math.random() * 900000) + 100000).padStart(6, '0')
}

/**
 * Build authx header value for a GET request.
 * @param {string} fullPath - Full URL path including prefix (e.g. '/p/api/v1/gallery/getList')
 * @param {object} params - Query parameters for sorting and signing
 * @returns {string} authx header value: "nonce=xxx&timestamp=xxx&sign=xxx"
 */
function _authxSignGet(fullPath, params = {}) {
  // Xe: split path, keep full path (do NOT strip /p/api/v1)
  const [pathOnly] = _splitUrlPath(fullPath)

  // Ye: sorted query string
  const sortedQs = _buildSortedQuery(params)

  // Ze: inner MD5 hash of decoded sorted query string
  const inner = sortedQs ? _innerHash(sortedQs) : CryptoJS.MD5('').toString()

  // Nonce and timestamp
  const nonce = _authxNonce()
  const timestamp = String(Date.now()) // Must be string, not number

  // Qe: chain = [KEY, path, nonce, timestamp, inner, apiKey].join('_')
  // 6th segment (apiKey) = UUID 'EAECCF25-80A6-4666-A7C2-A76904A74AB6' (NOT empty string!)
  const chain = `${AUTHX_KEY}_${pathOnly}_${nonce}_${timestamp}_${inner}_${AUTHX_API_KEY}`
  const sign = CryptoJS.MD5(chain).toString()

  console.log('[FnOS Authx] GET path:', pathOnly, 'inner:', inner.substring(0, 8) + '...', 'sign:', sign.substring(0, 12) + '...')

  return `nonce=${nonce}&timestamp=${timestamp}&sign=${sign}`
}

/**
 * Build authx header value for a POST request.
 * @param {string} fullPath - Full URL path including prefix
 * @param {string|object} body - Request body (stringified or object)
 * @returns {string} authx header value
 */
function _authxSignPost(fullPath, body) {
  const [pathOnly] = _splitUrlPath(fullPath)

  // For POST, inner hash is MD5 of the body string
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
  const inner = CryptoJS.MD5(bodyStr).toString()

  const nonce = _authxNonce()
  const timestamp = String(Date.now())

  const chain = `${AUTHX_KEY}_${pathOnly}_${nonce}_${timestamp}_${inner}_${AUTHX_API_KEY}`
  const sign = CryptoJS.MD5(chain).toString()

  console.log('[FnOS Authx] POST path:', pathOnly, 'inner:', inner.substring(0, 8) + '...', 'sign:', sign.substring(0, 12) + '...')

  return `nonce=${nonce}&timestamp=${timestamp}&sign=${sign}`
}

// ========== HTTP Photo API ==========

/**
 * Parse fnOS gallery API response envelope.
 * Handles: { code: 0, data: {...} }, { code: 0, data: [...] }, { data: {...} }, direct arrays
 * Returns { ok: boolean, data: any, errorMsg: string }
 */
function _parseGalleryResponse(body) {
  // Check code field (fnOS standard envelope)
  const code = body.code
  const hasCode = code !== undefined && code !== null
  if (hasCode && code !== 0) {
    const msgKeys = ['msg', 'message', 'errmsg', 'error', 'detail', 'errorMessage', 'reason']
    for (const k of msgKeys) {
      if (typeof body[k] === 'string' && body[k].length > 0) {
        return { ok: false, data: null, errorMsg: body[k] }
      }
    }
    return { ok: false, data: null, errorMsg: `API error code: ${code}` }
  }

  // Extract data
  const data = body.data !== undefined ? body.data
    : body.result !== undefined ? body.result
    : body

  return { ok: true, data }
}

/**
 * Extract photo list from parsed data (handles multiple response shapes).
 */
function _extractPhotoList(data) {
  if (Array.isArray(data)) return data

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    // Try list/items/photos/records/data/result inside data
    const keys = ['list', 'items', 'photos', 'records', 'photoList', 'mediaList', 'data', 'result']
    for (const k of keys) {
      if (Array.isArray(data[k]) && data[k].length > 0) {
        return data[k]
      }
    }
    // Return empty if all keys exist but are empty
    for (const k of keys) {
      if (Array.isArray(data[k])) return data[k]
    }
  }
  return []
}

/**
 * Try to reconnect and re-login the fnOS client when session expires.
 * Returns true if reconnection succeeded, throws on failure.
 */
async function _tryReconnect(client) {
  console.log('[FnOS API] Attempting reconnect...')
  // Close old WebSocket if still open
  if (client.ws && (client.ws.readyState === WebSocket.OPEN || client.ws.readyState === WebSocket.CONNECTING)) {
    client.ws.close()
  }
  client.token = null
  client.longToken = null
  client.signKey = null

  // Re-use stored credentials from settings
  // pinia-plugin-persistedstate v4 uses storeId as key (e.g. 'settings')
  const settings = JSON.parse(localStorage.getItem('settings') || '{}')
  if (!settings.fnosHost || !settings.fnosUsername || !settings.fnosPassword) {
    throw new Error('无法重新连接：缺少 fnOS 配置信息，请重新设置')
  }

  await client.connect(settings.fnosHost, settings.fnosPort)
  await client.login(settings.fnosUsername, settings.fnosPassword)

  if (!client.token) {
    throw new Error('fnOS 重新连接失败：登录未返回有效 token')
  }

  console.log('[FnOS API] Reconnect successful')
  return true
}

/**
 * Build headers for fnos HTTP requests.
 * Cookie is passed via X-Fnos-Cookie (converted to Cookie by Vite proxy).
 * authx is sent directly — Vite proxy converts X-Fnos-Authx → authx header.
 */
function _fnosRequestHeaders(client, authxValue) {
  const headers = {
    'X-Fnos-Cookie': client.buildCookieString(),
    'Accept': 'application/json'
  }
  if (authxValue) {
    headers['X-Fnos-Authx'] = authxValue
  }
  return headers
}

/**
 * Build the fnOS base URL from settings.
 * In dev mode, returns '' so Vite proxy handles it.
 * In production (APK/PWA), returns the full URL like 'http://your-nas:5666'.
 */
function _getFnosBaseUrl() {
  if (import.meta.env.DEV) return ''  // Use Vite proxy in dev mode
  const settings = JSON.parse(localStorage.getItem('settings') || '{}')
  const host = FnOSClient.normalizeHost(settings.fnosHost || '')
  const port = settings.fnosPort || 5666
  if (!host) return ''
  return `http://${host}:${port}`
}

/**
 * Determine the API base URL for fnOS gallery API requests.
 *
 * In dev mode: '' (Vite proxy handles /fnos-api/*)
 * On native platforms with CapacitorHttp: direct fnOS URL (CapacitorHttp bypasses CORS)
 * On native platforms WITHOUT CapacitorHttp (e.g. HarmonyOS 卓易通):
 *   uses local proxy at http://localhost:18080/fnos-proxy/api/ to bypass CORS
 * On browser/PWA: direct fnOS URL (assuming same-origin or CORS configured)
 */
function _getApiBaseUrl() {
  if (import.meta.env.DEV) return ''  // Use Vite proxy

  // On native platforms, ALWAYS use local proxy for API requests.
  // The local proxy (LocalMediaProxy.java) uses HttpURLConnection to forward
  // requests to fnOS, which avoids CORS issues AND works regardless of
  // CapacitorHttp availability. It also handles IPv6 connectivity properly
  // since it runs in the same JVM as the app.
  // Direct CapacitorHttp requests to fnOS sometimes fail with 502 on IPv6-only
  // networks, so routing through the local proxy is more reliable.
  if (isNativePlatform()) {
    return 'http://localhost:18080/fnos-proxy/api'
  }

  // Browser/PWA: direct fnOS URL (assuming same-origin or CORS configured)
  return _getFnosBaseUrl()
}

/**
 * Make a GET request to fnos gallery API with authx signing.
 * @param {string} proxyPath - path after /fnos-api (e.g. 'gallery/getList')
 * @param {string} signPath - full API path for signing (e.g. '/p/api/v1/gallery/getList')
 * @param {object} params - query parameters (will be sorted for signing)
 * @param {FnOSClient} client
 * @returns {Promise<object>} parsed response body
 */
async function _fnosGalleryGet(proxyPath, signPath, params, client, _retryCount = 0) {
  // Build authx signature using FULL path (includes /p/api/v1 prefix)
  const authxValue = _authxSignGet(signPath, params)

  // Query string contains ONLY actual API parameters (NOT nonce/timestamp/sign).
  // The authx value goes ONLY in the header — matching fnOS browser behavior.
  const qs = _buildSortedQuery(params)

  const apiBaseUrl = _getApiBaseUrl()
  const apiPath = `/p/api/v1/${proxyPath}`

  let url, headers
  if (apiBaseUrl === '') {
    // Dev mode: Vite proxy
    url = qs ? `/fnos-api/${proxyPath}?${qs}` : `/fnos-api/${proxyPath}`
    headers = _fnosRequestHeaders(client, authxValue)
  } else if (apiBaseUrl === 'http://localhost:18080/fnos-proxy/api') {
    // Local proxy mode (HarmonyOS 卓易通 etc): proxy adds Cookie, we send authx
    url = `${apiBaseUrl}/${proxyPath}${qs ? '?' + qs : ''}`
    headers = { 'Accept': 'application/json', ...(authxValue ? { 'authx': authxValue } : {}) }
  } else {
    // Direct fnOS URL (CapacitorHttp or browser)
    url = `${apiBaseUrl}${apiPath}${qs ? '?' + qs : ''}`
    headers = { 'Cookie': client.buildCookieString(), 'Accept': 'application/json', ...(authxValue ? { 'authx': authxValue } : {}) }
  }

  console.log(`[FnOS API] GET ${proxyPath} url:`, url.substring(0, 120),
    apiBaseUrl === 'http://localhost:18080/fnos-proxy/api' ? '(via local proxy)' : '')

  const response = await nativeFetch(url, { headers })

  console.log(`[FnOS API] GET ${proxyPath} status:`, response.status)
  if (!response.ok) {
    // Auto-reconnect on 401
    if (response.status === 401 && _retryCount < 1) {
      console.warn(`[FnOS API] Got 401, attempting reconnect...`)
      await _tryReconnect(client)
      return _fnosGalleryGet(proxyPath, signPath, params, client, 1)
    }
    const text = await response.text().catch(() => '')
    console.warn(`[FnOS API] GET ${proxyPath} error body:`, text.substring(0, 300))
    throw new Error(`HTTP ${response.status}`)
  }

  const body = await response.json()
  console.log(`[FnOS API] GET ${proxyPath} response code:`, body.code, 'data type:', typeof body.data, Array.isArray(body.data) ? 'array[' + body.data?.length + ']' : '')

  // Auto-reconnect on invalid sign (code 5000)
  if (body.code === 5000 && _retryCount < 1) {
    console.warn(`[FnOS API] Got invalid sign (code 5000), attempting reconnect...`)
    await _tryReconnect(client)
    return _fnosGalleryGet(proxyPath, signPath, params, client, 1)
  }

  return body
}

/**
 * Make a POST request to fnos gallery API with authx signing.
 */
async function _fnosGalleryPost(proxyPath, signPath, bodyObj, client, _retryCount = 0) {
  const bodyStr = JSON.stringify(bodyObj)
  // Build authx signature using FULL path
  const authxValue = _authxSignPost(signPath, bodyStr)

  const apiBaseUrl = _getApiBaseUrl()
  const apiPath = `/p/api/v1/${proxyPath}`

  let url, headers
  if (apiBaseUrl === '') {
    // Dev mode: Vite proxy
    url = `/fnos-api/${proxyPath}`
    headers = { ..._fnosRequestHeaders(client, authxValue), 'Content-Type': 'application/json' }
  } else if (apiBaseUrl === 'http://localhost:18080/fnos-proxy/api') {
    // Local proxy mode: proxy adds Cookie, we send authx
    url = `${apiBaseUrl}/${proxyPath}`
    headers = { 'Accept': 'application/json', 'Content-Type': 'application/json', ...(authxValue ? { 'authx': authxValue } : {}) }
  } else {
    // Direct fnOS URL
    url = `${apiBaseUrl}${apiPath}`
    headers = { 'Cookie': client.buildCookieString(), 'Accept': 'application/json', 'Content-Type': 'application/json', ...(authxValue ? { 'authx': authxValue } : {}) }
  }

  console.log(`[FnOS API] POST ${proxyPath} url:`, url.substring(0, 120),
    apiBaseUrl === 'http://localhost:18080/fnos-proxy/api' ? '(via local proxy)' : '')

  const response = await nativeFetch(url, {
    method: 'POST',
    headers,
    body: bodyStr
  })

  console.log(`[FnOS API] POST ${proxyPath} status:`, response.status)
  if (!response.ok) {
    if (response.status === 401 && _retryCount < 1) {
      console.warn(`[FnOS API] Got 401 on POST, attempting reconnect...`)
      await _tryReconnect(client)
      return _fnosGalleryPost(proxyPath, signPath, bodyObj, client, 1)
    }
    const text = await response.text().catch(() => '')
    console.warn(`[FnOS API] POST ${proxyPath} error body:`, text.substring(0, 300))
    throw new Error(`HTTP ${response.status}`)
  }

  const body = await response.json()
  console.log(`[FnOS API] POST ${proxyPath} response code:`, body.code, 'data type:', typeof body.data)

  if (body.code === 5000 && _retryCount < 1) {
    console.warn(`[FnOS API] Got invalid sign on POST, attempting reconnect...`)
    await _tryReconnect(client)
    return _fnosGalleryPost(proxyPath, signPath, bodyObj, client, 1)
  }

  return body
}

/**
 * Fetch gallery photos using getList API.
 * Note: fnOS updated from gallery/getList to album/baby/getList in newer versions.
 */
export async function fetchGalleryPhotos(client, params = {}) {
  const body = await _fnosGalleryGet('album/baby/getList', '/p/api/v1/album/baby/getList', params, client)
  const parsed = _parseGalleryResponse(body)
  if (!parsed.ok) {
    throw new Error(parsed.errorMsg)
  }
  const photos = _extractPhotoList(parsed.data)
  console.log(`[FnOS API] fetchGalleryPhotos got ${photos.length} photos`)
  return photos.map(p => normalizePhotoItem(p)).filter(Boolean)
}

/**
 * Fetch photos from a specific album.
 *
 * Updated for new fnOS API (verified via Playwright interception):
 * 1. GET /p/api/v1/album/baby/getList with albumId + time range (primary)
 * 2. GET /p/api/v1/album/item with album_id + sort (fallback)
 * 3. GET /p/api/v1/gallery/getList without album_id (legacy fallback)
 *
 * The album URL is like http://host:5666/p/album/59 where 59 is the album ID.
 */
/**
 * Fetch album photos via WebSocket API (fallback for when HTTP API fails).
 * Some environments (e.g. HarmonyOS AOSP compat) may have issues with CapacitorHttp,
 * but WebSocket communication works fine.
 */
async function _fetchAlbumPhotosViaWs(client, albumId, offset = 0, limit = 200) {
  if (!client.ws || client.ws.readyState !== WebSocket.OPEN) {
    throw new Error('WebSocket not connected')
  }

  console.log(`[FnOS API] Trying WebSocket fallback for albumId=${albumId}`)

  try {
    const result = await client.callApi('album.baby.getList', {
      albumId: String(albumId),
      startTime: '2000:01:01 00:00:00',
      endTime: '2099:12:31 23:59:59',
      offset: String(offset),
      limit: String(limit)
    })

    if (result.errno) {
      throw new Error(`WebSocket API error: ${result.errno}`)
    }

    const parsed = _parseGalleryResponse(result)
    if (parsed.ok) {
      const photos = _extractPhotoList(parsed.data)
      console.log(`[FnOS API] WebSocket fallback: got ${photos.length} photos`)
      return photos.map(p => normalizePhotoItem(p)).filter(Boolean)
    } else {
      throw new Error(parsed.errorMsg)
    }
  } catch (e) {
    console.warn(`[FnOS API] WebSocket fallback error:`, e.message)
    throw e
  }
}

export async function fetchAlbumPhotos(client, albumId, offset = 0, limit = 200) {
  console.log(`[FnOS API] fetchAlbumPhotos albumId=${albumId} offset=${offset} limit=${limit}`)
  const errors = []

  // --- Strategy 1: GET album/baby/getList with albumId + time range (new fnOS API) ---
  try {
    const params = {
      albumId: String(albumId),
      startTime: '2000:01:01 00:00:00',
      endTime: '2099:12:31 23:59:59',
      offset: String(offset),
      limit: String(limit)
    }
    const body = await _fnosGalleryGet('album/baby/getList', '/p/api/v1/album/baby/getList', params, client)
    const parsed = _parseGalleryResponse(body)
    if (parsed.ok) {
      const photos = _extractPhotoList(parsed.data)
      console.log(`[FnOS API] Strategy 1 (album/baby/getList): got ${photos.length} photos`)
      if (photos.length > 0) {
        return photos.map(p => normalizePhotoItem(p)).filter(Boolean)
      }
      // Empty result on first page might be genuine
      if (offset === 0) {
        console.log(`[FnOS API] Strategy 1 returned 0 photos, trying strategy 2...`)
        errors.push('Strategy1: 0 photos')
      } else {
        return [] // Empty page > 0 is expected (end of data)
      }
    } else {
      console.warn(`[FnOS API] Strategy 1 failed: ${parsed.errorMsg}`)
      errors.push(`Strategy1: ${parsed.errorMsg}`)
    }
  } catch (e) {
    console.warn(`[FnOS API] Strategy 1 (album/baby/getList) error:`, e.message)
    errors.push(`Strategy1: ${e.message}`)
  }

  // --- Strategy 2: GET album/item with album_id + sort ---
  try {
    const params = {
      album_id: String(albumId),
      sort_by: 'date_time',
      sort_direction: 'desc'
    }
    const body = await _fnosGalleryGet('album/item', '/p/api/v1/album/item', params, client)
    const parsed = _parseGalleryResponse(body)
    if (parsed.ok) {
      const photos = _extractPhotoList(parsed.data)
      console.log(`[FnOS API] Strategy 2 (album/item): got ${photos.length} photos`)
      if (photos.length > 0) {
        return photos.map(p => normalizePhotoItem(p)).filter(Boolean)
      }
      errors.push('Strategy2: 0 photos')
    } else {
      console.warn(`[FnOS API] Strategy 2 failed: ${parsed.errorMsg}`)
      errors.push(`Strategy2: ${parsed.errorMsg}`)
    }
  } catch (e) {
    console.warn(`[FnOS API] Strategy 2 (album/item) error:`, e.message)
    errors.push(`Strategy2: ${e.message}`)
  }

  // --- Strategy 3: GET gallery/getList (legacy fallback) ---
  try {
    const params = {
      start_time: '2000:01:01 00:00:00',
      end_time: '2099:12:31 23:59:59',
      mode: 'index',
      offset,
      limit
    }
    const body = await _fnosGalleryGet('gallery/getList', '/p/api/v1/gallery/getList', params, client)
    const parsed = _parseGalleryResponse(body)
    if (parsed.ok) {
      const photos = _extractPhotoList(parsed.data)
      console.log(`[FnOS API] Strategy 3 (gallery/getList legacy): got ${photos.length} photos`)
      if (photos.length > 0) {
        return photos.map(p => normalizePhotoItem(p)).filter(Boolean)
      }
      errors.push('Strategy3: 0 photos')
    } else {
      console.warn(`[FnOS API] Strategy 3 failed: ${parsed.errorMsg}`)
      errors.push(`Strategy3: ${parsed.errorMsg}`)
    }
  } catch (e) {
    console.warn(`[FnOS API] Strategy 3 (gallery/getList) error:`, e.message)
    errors.push(`Strategy3: ${e.message}`)
  }

  // --- Strategy 4: WebSocket API fallback ---
  // If all HTTP API strategies failed (possibly due to CapacitorHttp issues on
  // some platforms like HarmonyOS AOSP compat), try via WebSocket which uses a
  // different code path and doesn't depend on CapacitorHttp.
  try {
    const photos = await _fetchAlbumPhotosViaWs(client, albumId, offset, limit)
    if (photos.length > 0) {
      return photos
    }
    errors.push('Strategy4(WS): 0 photos')
  } catch (e) {
    console.warn(`[FnOS API] Strategy 4 (WebSocket) error:`, e.message)
    errors.push(`Strategy4(WS): ${e.message}`)
  }

  console.warn('[FnOS API] All strategies returned 0 photos or failed:', errors.join('; '))

  // Throw with detailed diagnostic info so UI can display helpful error
  const err = new Error(`所有加载策略失败: ${errors.join('; ')}`)
  err.diagnosticErrors = errors
  err.isAlbumLoadFailure = true
  throw err
}

/**
 * Fetch gallery timeline (used to get date groups with photo counts).
 */
export async function fetchGalleryTimeline(client, extraParams = {}) {
  const body = await _fnosGalleryGet('gallery/timeline', '/p/api/v1/gallery/timeline', extraParams, client)
  return body
}

/**
 * Build a photo thumbnail or original URL.
 */
export function buildPhotoUrl(baseUrl, photo, size = 'medium') {
  const base = baseUrl.replace(/\/$/, '')

  if (size === 'original' && photo.originalUrl) {
    return `${base}${photo.originalUrl}`
  }
  if (photo.thumb) {
    // If thumb already starts with /p/api/v1/ it's a full path
    if (photo.thumb.startsWith('/p/') || photo.thumb.startsWith('http')) {
      return photo.thumb.startsWith('http') ? photo.thumb : `${base}${photo.thumb}`
    }
    return `${base}${photo.thumb}`
  }

  const id = photo.id || photo.guid
  const uuid = photo.photoUUID || photo.uuid || photo.session || ''
  if (!id) return null

  const sizeMap = { small: 's', medium: 'm', large: 'l', xl: 'xl', original: 'o' }
  const s = sizeMap[size] || 'm'

  return `${base}/p/api/v1/stream/p/t/${id}/${s}/${uuid}`
}

/**
 * Build a proxied photo URL (for use in browser where CORS is an issue).
 * Appends _fc query param with fnos cookies so <img> tags can load images
 * (img tags can't set custom headers, so Vite proxy injects cookies from _fc param).
 *
 * In production (APK), builds full URL with cookies as query params.
 * In dev mode, uses Vite proxy path.
 */
/**
 * Build a photo URL for display in <img> tags.
 *
 * In production (APK): uses local proxy server (localhost:18080) which
 * forwards requests to fnOS with proper authentication. This solves:
 * - Cross-origin cookie issues (proxy is same-origin)
 * - HEIC format issues (proxy requests JPEG sizes from fnOS)
 * - Video streaming (proxy handles Range requests natively)
 *
 * In dev mode: uses Vite proxy with _fc cookie param.
 */
export function buildProxiedPhotoUrl(photo, size = 'medium') {
  let streamPath = ''

  if (size === 'original' && photo.originalUrl) {
    streamPath = photo.originalUrl.startsWith('http')
      ? new URL(photo.originalUrl).pathname
      : photo.originalUrl
  } else if (photo.thumb && (photo.thumb.startsWith('/p/') || photo.thumb.startsWith('http'))) {
    streamPath = photo.thumb.startsWith('http')
      ? new URL(photo.thumb).pathname
      : photo.thumb
  } else {
    const id = photo.id || photo.guid
    const uuid = photo.photoUUID || photo.uuid || photo.session || ''
    if (!id) return null
    // Use 'xl' instead of 'o' (original) — original may be HEIC which WebView can't render
    // NEVER request 'o' (original) size on native — fnOS returns raw HEIC
    const sizeMap = { small: 's', medium: 'm', large: 'l', xl: 'xl', original: 'xl' }
    const s = sizeMap[size] || 'm'
    streamPath = `/p/api/v1/stream/p/t/${id}/${s}/${uuid}`
  }

  const baseUrl = _getFnosBaseUrl()

  if (baseUrl) {
    // Production: route through local proxy server
    const id = photo.id || photo.guid
    const uuid = photo.photoUUID || photo.uuid || photo.session || ''
    if (streamPath.includes('/stream/p/t/')) {
      // Use our proxy route: /fnos-proxy/photo/{id}/{size}/{uuid}
      const sizeMatch = streamPath.match(/\/stream\/p\/t\/\d+\/([^/]+)/)
      const size = sizeMatch ? sizeMatch[1] : 'm'
      return `http://localhost:18080/fnos-proxy/photo/${id}/${size}/${uuid}`
    } else {
      // Generic passthrough for thumb/originalUrl paths
      return `http://localhost:18080/fnos-proxy/raw?p=${encodeURIComponent(streamPath)}`
    }
  }

  // Dev mode: use Vite proxy (proxy understands _fc and converts to Cookie header)
  const cookieStr = _currentClient?.buildCookieString?.()
  if (cookieStr) {
    const separator = streamPath.includes('?') ? '&' : '?'
    return `/fnos-stream${streamPath}${separator}_fc=${encodeURIComponent(cookieStr)}`
  }
  return `/fnos-stream${streamPath}`
}

/**
 * Build a video URL for <video> tag streaming playback.
 *
 * fnOS uses /p/api/v1/stream/v/{photoId} for video streaming.
 * Returns 206 video/mp4 with Range request support.
 *
 * In production (APK): routes through local proxy which handles Range requests.
 * In dev mode: uses Vite proxy path.
 */
export function buildProxiedVideoUrl(photo) {
  const id = photo.id || photo.guid

  if (!id) return null

  const baseUrl = _getFnosBaseUrl()

  if (baseUrl) {
    // Production: route through local proxy (supports proper Range requests for video)
    return `http://localhost:18080/fnos-proxy/video/${id}`
  }

  // Dev mode: Vite proxy
  const cookieStr = _currentClient?.buildCookieString?.() || ''
  const qs = cookieStr ? `?_fc=${encodeURIComponent(cookieStr)}` : ''
  return `/fnos-stream/p/api/v1/stream/v/${id}${qs}`
}

/**
 * Normalize a photo item from API response to a consistent format.
 * Handles multiple response shapes from different fnOS API versions.
 */
function normalizePhotoItem(raw) {
  if (!raw || typeof raw !== 'object') {
    console.warn('[FnOS] normalizePhotoItem: invalid item:', raw)
    return null
  }

  const additional = raw.additional
  const thumbnail = additional?.thumbnail || raw.thumbnail

  // Extract thumbnail URL
  let thumb = ''
  if (typeof thumbnail === 'string') {
    thumb = thumbnail
  } else if (thumbnail && typeof thumbnail === 'object') {
    thumb = thumbnail.mUrl || thumbnail.sUrl || thumbnail.xsUrl || thumbnail.xxsUrl || thumbnail.originalUrl || thumbnail.videoUrl || thumbnail.url || ''
  }
  if (!thumb && raw.thumb) thumb = raw.thumb
  if (!thumb && raw.small_thumb) thumb = raw.small_thumb
  if (!thumb && raw.thumb_url) thumb = raw.thumb_url
  if (!thumb && raw.poster) thumb = raw.poster
  if (!thumb && raw.cover) thumb = raw.cover

  // Build thumb from photoId + uuid if nothing else available
  if (!thumb && (raw.photoId || raw.id) && (raw.photoUUID || raw.uuid || raw.session)) {
    const pid = raw.photoId || raw.id
    const puuid = raw.photoUUID || raw.uuid || raw.session
    if (pid && puuid && String(pid) !== 'null' && String(puuid) !== 'null') {
      thumb = `/p/api/v1/stream/p/t/${pid}/m/${puuid}`
    }
  }

  let originalUrl = ''
  if (typeof thumbnail === 'object' && thumbnail) {
    originalUrl = thumbnail.originalUrl || thumbnail.videoUrl || thumbnail.url || ''
  }
  if (!originalUrl && raw.originalUrl) originalUrl = raw.originalUrl
  if (!originalUrl && raw.url) originalUrl = raw.url
  if (!originalUrl && raw.src) originalUrl = raw.src

  if (!originalUrl && (raw.photoId || raw.id) && (raw.photoUUID || raw.uuid || raw.session)) {
    const pid = raw.photoId || raw.id
    const puuid = raw.photoUUID || raw.uuid || raw.session
    if (pid && puuid && String(pid) !== 'null' && String(puuid) !== 'null') {
      originalUrl = `/p/api/v1/stream/p/t/${pid}/o/${puuid}`
    }
  }

  // Parse date - fnOS uses "2026:04:18 12:18:00" format (year:month:day)
  // IMPORTANT: fnOS stores dateTime in UTC. For UTC+8, early-morning photos
  // (e.g., 7:00 AM local = 23:00 UTC previous day) would be assigned to wrong day
  // if we just parse the date string. Must convert UTC to local date.
  let date = ''
  let dateTime = raw.dateTime || raw.photoDateTime || raw.createdAt || raw.create_time || raw.createTime || ''
  if (!dateTime && raw.date) dateTime = raw.date
  if (!dateTime && raw.photo_time) dateTime = raw.photo_time
  if (!dateTime && raw.shoot_time) dateTime = raw.shoot_time
  if (dateTime) {
    // Format: "2026:04:18 12:18:00" or "2026-04-18 12:18:00" or "2026/04/18 12:18:00"
    const parts = dateTime.split(' ')
    const rawDateStr = parts[0].replace(/:/g, '-').replace(/\//g, '-')
    const timeStr = parts[1] || ''

    if (timeStr && timeStr.includes(':')) {
      // fnOS dateTime may be UTC or local time.
      // We parse as UTC and convert to local date. If fnOS is actually local time,
      // the date won't shift backward (adding +8h only shifts forward in day).
      // If fnOS is UTC, this correctly converts to local date.
      try {
        const isoUtc = `${rawDateStr}T${timeStr}Z`
        const utcDate = new Date(isoUtc)
        if (!isNaN(utcDate.getTime())) {
          date = `${utcDate.getFullYear()}-${String(utcDate.getMonth() + 1).padStart(2, '0')}-${String(utcDate.getDate()).padStart(2, '0')}`
        } else {
          date = rawDateStr // Fallback to raw date
        }
        console.log(`[FnOS] DateTime parse: raw="${dateTime}" rawDate="${rawDateStr}" time="${timeStr}" → date="${date}"`)
      } catch {
        date = rawDateStr
      }
    } else {
      date = rawDateStr
    }
  }

  // Detect video - fnOS uses multiple field names across versions
  const fileType = raw.fileType || raw.category || raw.file_type || raw.fileType || ''
  const isVideo = (
    fileType === 'video' ||
    fileType?.startsWith('video') ||
    raw.category === 'video' ||
    raw.file_type === 'video' ||
    raw.fileType === 'mp4' ||
    raw.type === 'video' ||
    raw.mediaType === 2 ||
    raw.media_type === 2 ||
    raw.specialType === 2 ||
    raw.mime_type?.startsWith('video') ||
    (raw.duration && raw.duration > 0 && (raw.width || raw.height))
  )

  // Extract ID - prefer numeric id, fall back to string
  const id = raw.id || raw.guid || raw.photoId || raw.photo_id || ''
  const uuid = raw.photoUUID || raw.uuid || raw.session || raw.photo_uuid || ''

  // Extract dedicated video URL if available (separate from poster/originalUrl)
  let videoUrl = ''
  if (typeof thumbnail === 'object' && thumbnail) {
    videoUrl = thumbnail.videoUrl || ''
  }
  if (!videoUrl && raw.videoUrl) videoUrl = raw.videoUrl
  if (!videoUrl && raw.video_url) videoUrl = raw.video_url
  if (!videoUrl && raw.playUrl) videoUrl = raw.playUrl
  if (!videoUrl && raw.play_url) videoUrl = raw.play_url
  if (!videoUrl && raw.streamUrl) videoUrl = raw.streamUrl
  if (!videoUrl && raw.stream_url) videoUrl = raw.stream_url

  return {
    id,
    uuid,
    name: raw.name || raw.title || raw.filename || raw.fileName || raw.file_name || '',
    date,
    dateTime,
    thumb,
    originalUrl,
    videoUrl,
    fileType,
    width: raw.width || 0,
    height: raw.height || 0,
    duration: raw.mediaDuration || raw.duration || raw.videoDuration || 0,
    isVideo
  }
}

// Singleton
let client = null

// Reference to current client for buildProxiedPhotoUrl (needs cookies for img tags)
const _currentClient = {
  buildCookieString: () => client?.buildCookieString?.() || ''
}
export function getFnOSClient() {
  if (!client) {
    client = new FnOSClient()
    // Restore saved tokens from localStorage
    try {
      const saved = localStorage.getItem('fnos-auth')
      if (saved) {
        const data = JSON.parse(saved)
        if (data.token) client.token = data.token
        if (data.longToken) client.longToken = data.longToken
        if (data.signKey) client.signKey = data.signKey
        console.log('[FnOS] Restored saved auth state')
      }
    } catch (e) {
      console.warn('[FnOS] Failed to restore auth:', e)
    }
  }
  return client
}

/**
 * Save fnos auth state to localStorage for persistence across page reloads.
 */
export function saveFnOSAuth(client) {
  try {
    const data = {
      token: client.token,
      longToken: client.longToken,
      signKey: client.signKey
    }
    localStorage.setItem('fnos-auth', JSON.stringify(data))
    console.log('[FnOS] Auth state saved')
  } catch (e) {
    console.warn('[FnOS] Failed to save auth:', e)
  }
}

/**
 * Clear saved fnos auth state.
 */
export function clearFnOSAuth() {
  localStorage.removeItem('fnos-auth')
}

/**
 * Generate an authx-signed test URL for diagnostics.
 * This is used by the settings diagnostics panel to test fnOS HTTP API
 * with proper authentication.
 * @param {FnOSClient} client - The fnOS client instance
 * @param {string} proxyPath - API path (e.g. 'album/baby/getList')
 * @param {object} params - Query parameters
 * @returns {{ url: string, headers: object }} The signed URL and headers
 */
export function buildSignedApiRequest(client, proxyPath, params = {}) {
  const signPath = `/p/api/v1/${proxyPath}`
  const authxValue = _authxSignGet(signPath, params)
  const qs = _buildSortedQuery(params)

  const apiBaseUrl = _getApiBaseUrl()
  let url, headers

  if (apiBaseUrl === '') {
    url = qs ? `/fnos-api/${proxyPath}?${qs}` : `/fnos-api/${proxyPath}`
    headers = _fnosRequestHeaders(client, authxValue)
  } else if (apiBaseUrl === 'http://localhost:18080/fnos-proxy/api') {
    url = `${apiBaseUrl}/${proxyPath}${qs ? '?' + qs : ''}`
    headers = { 'Accept': 'application/json', ...(authxValue ? { 'authx': authxValue } : {}) }
  } else {
    const apiPath = `/p/api/v1/${proxyPath}`
    url = `${apiBaseUrl}${apiPath}${qs ? '?' + qs : ''}`
    headers = { 'Cookie': client.buildCookieString(), 'Accept': 'application/json', ...(authxValue ? { 'authx': authxValue } : {}) }
  }

  return { url, headers, authxValue }
}
