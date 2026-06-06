/**
 * Native HTTP wrapper for Capacitor apps.
 *
 * In Capacitor Android WebView, the app runs from capacitor://localhost.
 * Direct HTTP requests to LAN servers (BabyBuddy, fnOS) are cross-origin
 * and blocked by CORS unless the servers send Access-Control-Allow-Origin headers.
 *
 * This module provides CapacitorHttp-based wrappers that bypass WebView CORS
 * by making requests through the native HTTP client (OkHttp on Android).
 *
 * In dev mode (browser), it falls back to standard fetch/axios (Vite proxy handles CORS).
 */

import { Capacitor, CapacitorHttp, CapacitorCookies, registerPlugin } from '@capacitor/core'

/**
 * Check if running inside a native Capacitor app (APK/IPA).
 */
export function isNativePlatform() {
  try {
    const isNative = Capacitor?.isNativePlatform?.()
    if (isNative === undefined || isNative === null) {
      const platform = Capacitor?.getPlatform?.()
      return platform === 'android' || platform === 'ios'
    }
    return isNative
  } catch {
    return false
  }
}

/**
 * Wrap a promise with a timeout. Rejects if the promise doesn't settle within ms.
 */
function withTimeout(promise, ms) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms)
    })
  ]).finally(() => clearTimeout(timer))
}

/**
 * Check if CapacitorHttp is available and functional.
 * On some platforms (e.g. HarmonyOS AOSP compat "卓易通"), Capacitor.isNativePlatform()
 * returns true but CapacitorHttp is not defined. This function detects that case.
 *
 * IMPORTANT: The ES module import { CapacitorHttp } from '@capacitor/core' may import
 * a Proxy/placeholder object that has .request as a function but throws at runtime.
 * So we do a layered check:
 * 1. Static check: does the object exist and have .request? (fast)
 * 2. Plugin registry check: is CapacitorHttp in Capacitor.Plugins or PluginHeaders?
 * 3. If both static checks pass, do a runtime probe: make a trivial HTTP request
 *    to verify CapacitorHttp.request() actually works.
 */
let _capacitorHttpAvailable = undefined
let _capacitorHttpProbing = false

export function isCapacitorHttpAvailable() {
  if (_capacitorHttpAvailable !== undefined) return _capacitorHttpAvailable

  // Static check — is the object there and does it have .request?
  try {
    if (!CapacitorHttp || typeof CapacitorHttp.request !== 'function') {
      console.log('[nativeHttp] CapacitorHttp available: false (static check failed)')
      _capacitorHttpAvailable = false
      return false
    }
  } catch {
    console.log('[nativeHttp] CapacitorHttp available: false (static check threw)')
    _capacitorHttpAvailable = false
    return false
  }

  // Plugin registry check — is the plugin actually registered by the native side?
  try {
    const plugins = Capacitor?.Plugins
    if (plugins && !plugins.CapacitorHttp) {
      console.log('[nativeHttp] CapacitorHttp available: false (not in Capacitor.Plugins)')
      _capacitorHttpAvailable = false
      return false
    }

    // Also check PluginHeaders
    const pluginHeaders = Capacitor?.PluginHeaders
    if (Array.isArray(pluginHeaders) && !pluginHeaders.some(p => p.name === 'CapacitorHttp')) {
      console.log('[nativeHttp] CapacitorHttp available: false (not in PluginHeaders)')
      _capacitorHttpAvailable = false
      return false
    }
  } catch (e) {
    // If we can't check the registry, assume it's there (conservative)
    console.log('[nativeHttp] Plugin registry check error:', e.message, '— proceeding with probe')
  }

  // The object looks valid, but we need to verify it works at runtime.
  // Launch an async probe — but return "unknown" (true) optimistically for now.
  // The probe will update _capacitorHttpAvailable if it fails.
  if (!_capacitorHttpProbing) {
    _capacitorHttpProbing = true
    _probeCapacitorHttp().then(available => {
      if (!available) {
        console.warn('[nativeHttp] Runtime probe FAILED — CapacitorHttp is NOT actually available!')
        _capacitorHttpAvailable = false
      } else {
        console.log('[nativeHttp] Runtime probe passed — CapacitorHttp works')
        _capacitorHttpAvailable = true
      }
      _capacitorHttpProbing = false
    })
  }

  // Return true optimistically — if the probe fails, it will update the flag
  // and subsequent calls will return false. The nativeFetch/axios adapter
  // also have runtime fallbacks for this case.
  _capacitorHttpAvailable = true
  console.log('[nativeHttp] CapacitorHttp available: true (pending runtime probe)')
  return true
}

/**
 * Async runtime probe: try a trivial CapacitorHttp request to verify it works.
 * Returns true if CapacitorHttp.request() completes without throwing.
 */
async function _probeCapacitorHttp() {
  try {
    await CapacitorHttp.request({
      url: 'https://httpbin.org/status/200',
      method: 'GET',
      responseType: 'text',
      headers: { 'Accept': 'text/plain' }
    })
    return true
  } catch (e) {
    const msg = e?.message || ''
    if (msg.includes('not defined') || msg.includes('not available') || msg.includes('is not a function') || msg.includes('CapacitorHttp')) {
      return false
    }
    // Network errors are fine — CapacitorHttp itself works, just the URL wasn't reachable
    if (msg.includes('timeout') || msg.includes('network') || msg.includes('connect') || msg.includes('resolve')) {
      return true
    }
    // HTTP errors are fine — CapacitorHttp itself works
    if (e?.status && e.status > 0) {
      return true
    }
    // Unknown error — be conservative and mark as unavailable
    console.warn('[nativeHttp] Probe error (unexpected):', msg)
    return false
  }
}

/**
 * Native fetch wrapper.
 * On native platforms with CapacitorHttp, uses it to bypass WebView CORS.
 * On native platforms WITHOUT CapacitorHttp (e.g. HarmonyOS 卓易通), falls back to
 * standard fetch. This may hit CORS issues for API requests, but WebSocket and
 * local proxy paths (localhost) still work.
 * On browser/dev, uses standard fetch.
 */
export async function nativeFetch(url, options = {}) {
  // Local proxy requests (localhost) don't need CapacitorHttp — no CORS issues
  // and more reliable than going through the native HTTP client.
  if (!isNativePlatform() || !isCapacitorHttpAvailable() || url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:')) {
    return fetch(url, options)
  }

  console.log(`[nativeHttp] Native fetch: ${(options.method || 'GET').toUpperCase()} ${url}`)

  const method = (options.method || 'GET').toUpperCase()

  const headers = {}
  if (options.headers) {
    if (typeof options.headers.forEach === 'function') {
      options.headers.forEach((v, k) => { if (v != null) headers[k] = v })
    } else {
      for (const [k, v] of Object.entries(options.headers)) {
        if (v != null) headers[k] = String(v)
      }
    }
  }

  // Parse URL — but don't use new URL() which may fail on IPv6-only domains
  // in WebView. Instead, manually split URL into base + query params.
  let baseUrl = url
  let params = {}

  const qIndex = url.indexOf('?')
  if (qIndex !== -1) {
    baseUrl = url.substring(0, qIndex)
    const qs = url.substring(qIndex + 1)
    const sp = new URLSearchParams(qs)
    sp.forEach((v, k) => { params[k] = v })
  }

  const reqConfig = {
    url: baseUrl,
    method,
    headers,
    responseType: 'text',
  }

  if (Object.keys(params).length > 0) {
    reqConfig.params = params
  }

  if (options.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    if (typeof options.body === 'string') {
      try { reqConfig.data = JSON.parse(options.body) } catch { reqConfig.data = options.body }
    } else {
      reqConfig.data = options.body
    }
  }

  try {
    const response = await withTimeout(CapacitorHttp.request(reqConfig), 15000)

    const body = typeof response.data === 'string'
      ? response.data
      : JSON.stringify(response.data)

    return new Response(body, {
      status: response.status,
      statusText: '',
      headers: response.headers || {},
    })
  } catch (error) {
    // If CapacitorHttp throws "CapacitorHttp is not defined" at runtime,
    // it means the static check was wrong — the plugin isn't actually available.
    // Update the cached flag and fall back to standard fetch.
    const errMsg = error?.message || ''
    if (errMsg.includes('CapacitorHttp') || errMsg.includes('not defined') || errMsg.includes('is not a function')) {
      console.warn(`[nativeHttp] CapacitorHttp failed at runtime, marking as unavailable and retrying with fetch`)
      _capacitorHttpAvailable = false
      return fetch(url, options)
    }

    console.warn(`[nativeHttp] Request failed:`, errMsg)
    const status = error?.status || 502
    const data = error?.data || null

    return new Response(data ? JSON.stringify(data) : '', {
      status,
      statusText: errMsg || 'Native HTTP error',
    })
  }
}

/**
 * Axios adapter that uses CapacitorHttp on native platforms.
 */
export function createCapacitorAxiosAdapter() {
  return async function capacitorAdapter(config) {
    if (!isNativePlatform() || !isCapacitorHttpAvailable()) {
      throw new Error('Not native platform or CapacitorHttp unavailable, skip CapacitorHttp adapter')
    }

    const method = (config.method || 'GET').toUpperCase()
    const baseURL = config.baseURL || ''
    const url = config.url || ''
    const fullUrl = url.startsWith('http') ? url : baseURL + url

    const headers = {}
    if (config.headers) {
      if (typeof config.headers.forEach === 'function') {
        config.headers.forEach((v, k) => { if (v != null) headers[k] = v })
      } else {
        for (const [k, v] of Object.entries(config.headers)) {
          if (k.startsWith('X-Requested-With') || k.startsWith('axios-')) continue
          if (v != null && typeof v !== 'function') headers[k] = String(v)
        }
      }
    }

    const reqConfig = {
      method,
      url: fullUrl,
      headers,
      responseType: 'text',
    }

    if (config.params && Object.keys(config.params).length > 0) {
      reqConfig.params = config.params
    }

    if (config.data !== undefined && ['POST', 'PUT', 'PATCH'].includes(method)) {
      reqConfig.data = config.data
    }

    const timeout = config.timeout || 120000

    try {
      const response = await withTimeout(CapacitorHttp.request(reqConfig), timeout)

      return {
        data: response.data,
        status: response.status,
        statusText: '',
        headers: response.headers || {},
        config,
        request: {},
      }
    } catch (error) {
      const errMsg = error?.message || ''
      // If CapacitorHttp fails at runtime, update the cached flag
      if (errMsg.includes('CapacitorHttp') || errMsg.includes('not defined') || errMsg.includes('is not a function')) {
        console.warn('[nativeHttp] CapacitorHttp failed at runtime in axios adapter, marking as unavailable')
        _capacitorHttpAvailable = false
      }
      const axiosError = new Error(errMsg || `HTTP ${error?.status || 'unknown'}`)
      axiosError.isAxiosError = true
      axiosError.config = config
      axiosError.code = error?.code || 'ERR_NETWORK'
      axiosError.response = {
        data: error?.data,
        status: error?.status || 0,
        statusText: errMsg || '',
        headers: error?.headers || {},
        config,
      }
      throw axiosError
    }
  }
}

/**
 * Download binary content as Blob with progress tracking.
 * On native: uses XMLHttpRequest (patched by CapacitorHttp → OkHttp) with onprogress.
 * On browser: uses standard fetch.
 *
 * @param {string} url
 * @param {object} options - { headers, timeout (ms), onProgress(loaded, total) }
 * @returns {Promise<Blob>}
 */
export async function nativeFetchBlobWithProgress(url, options = {}) {
  const { headers = {}, timeout = 600000, onProgress } = options

  if (!isNativePlatform() || !isCapacitorHttpAvailable()) {
    const resp = await fetch(url, { headers })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return await resp.blob()
  }

  console.log(`[nativeHttp] Download with progress: ${url.substring(0, 120)}`)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, true)
    xhr.responseType = 'blob'
    xhr.timeout = timeout

    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (v != null) xhr.setRequestHeader(k, String(v))
      }
    }

    xhr.onprogress = (e) => {
      if (onProgress) {
        if (e.lengthComputable) {
          onProgress(e.loaded, e.total)
        } else {
          onProgress(e.loaded, -1)
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const blob = xhr.response
        if (blob instanceof Blob) {
          resolve(blob)
        } else {
          reject(new Error('Response is not a Blob'))
        }
      } else {
        reject(new Error(`HTTP ${xhr.status}`))
      }
    }

    xhr.onerror = () => reject(new Error('Network error'))
    xhr.ontimeout = () => reject(new Error('Download timed out'))
    xhr.send()
  })
}

/**
 * Download binary content (image/video) using native HTTP client.
 * Returns a Blob that can be used with URL.createObjectURL().
 * On browser/dev, uses standard fetch with blob responseType.
 */
export async function nativeFetchBlob(url, options = {}) {
  const timeout = options.timeout || 120000
  if (!isNativePlatform() || !isCapacitorHttpAvailable()) {
    const resp = await fetch(url, options)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return await resp.blob()
  }

  console.log(`[nativeHttp] Fetching blob: ${url.substring(0, 120)}`)

  const urlObj = new URL(url)
  const params = {}
  urlObj.searchParams.forEach((v, k) => { params[k] = v })

  const headers = {}
  if (options.headers) {
    if (typeof options.headers.forEach === 'function') {
      options.headers.forEach((v, k) => { if (v != null) headers[k] = v })
    } else {
      for (const [k, v] of Object.entries(options.headers)) {
        if (v != null) headers[k] = String(v)
      }
    }
  }

  const reqConfig = {
    url: urlObj.origin + urlObj.pathname,
    method: 'GET',
    headers,
    responseType: 'blob',
  }

  if (Object.keys(params).length > 0) {
    reqConfig.params = params
  }

  const response = await withTimeout(CapacitorHttp.request(reqConfig), timeout)

  console.log(`[nativeHttp] Blob response: status=${response.status}, data type=${typeof response.data}, isBlob=${response.data instanceof Blob}`)

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status}`)
  }

  const data = response.data
  if (data instanceof Blob) {
    return data
  }
  if (typeof data === 'string') {
    const binaryStr = atob(data)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    return new Blob([bytes])
  }

  throw new Error('Unexpected response data type')
}

// Cache for DNS resolution results (domain → IP, expires after 5 minutes)
const _dnsCache = new Map()
const DNS_CACHE_TTL = 5 * 60 * 1000

/**
 * Resolve a domain name to an IP address using DNS-over-HTTPS.
 * On Android, Java's HttpURLConnection only queries A (IPv4) records by default,
 * and cannot resolve IPv6-only domains. This function uses CapacitorHttp (OkHttp)
 * to query Google DNS-over-HTTPS, which returns AAAA (IPv6) records.
 * 
 * Results are cached for 5 minutes to avoid repeated lookups.
 * 
 * Returns the IP address (e.g. "2408:8210:6023:be30::b4e") or null if resolution fails.
 */
export async function resolveDomainToIp(domain, timeoutMs = 5000) {
  const rawDomain = domain.replace(/^\[/, '').replace(/\]$/, '').replace(/^https?:\/\//, '').replace(/\/$/, '')
  // Only resolve domain names, not IP addresses
  if (!rawDomain.includes('.') || rawDomain.match(/^\d+\.\d+\.\d+\.\d+$/) || rawDomain.includes(':')) {
    return rawDomain // Already an IP address or localhost
  }

  // Check cache
  const cached = _dnsCache.get(rawDomain)
  if (cached && Date.now() - cached.timestamp < DNS_CACHE_TTL) {
    console.log(`[nativeHttp] DNS cache hit: ${rawDomain} → ${cached.ip}`)
    return cached.ip
  }

  // Race all DNS queries against a global timeout.
  // If the network doesn't allow DNS-over-HTTPS, we don't want to block for 30+ seconds.
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timeoutId = setTimeout(() => controller?.abort(), timeoutMs)

  try {
    // Try DNS resolution using nativeFetch (which handles CapacitorHttp / fallback automatically)
    const services = [
      { url: `https://dns.google/resolve?name=${encodeURIComponent(rawDomain)}&type=AAAA`, type: 28, label: 'Google AAAA' },
      { url: `https://dns.google/resolve?name=${encodeURIComponent(rawDomain)}&type=A`, type: 1, label: 'Google A' },
      { url: `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(rawDomain)}&type=AAAA`, type: 28, label: 'Cloudflare AAAA' },
      { url: `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(rawDomain)}&type=A`, type: 1, label: 'Cloudflare A' },
    ]

    // Fire ALL queries concurrently and race them — first successful answer wins
    const racePromises = services.map(svc =>
      nativeFetch(svc.url, {
        headers: { 'Accept': 'application/dns-json' },
        signal: controller?.signal
      }).then(async resp => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const body = await resp.text()
        const data = typeof body === 'string' ? JSON.parse(body) : body
        const answer = data.Answer?.find(a => a.type === svc.type)
        if (!answer?.data) throw new Error('No matching record')
        return { ip: answer.data, label: svc.label, type: svc.type }
      }).catch(e => {
        console.warn(`[nativeHttp] DNS ${svc.label} failed:`, e?.message || e)
        return null // Don't throw — let other promises compete
      })
    )

    // Wait for all to settle, then pick the first successful result
    // (Prefer AAAA over A for IPv6 networks)
    const results = await Promise.all(racePromises)
    clearTimeout(timeoutId)

    // Prefer AAAA (IPv6) results first, then A (IPv4)
    const aaaaResult = results.find(r => r && r.type === 28)
    const aResult = results.find(r => r && r.type === 1)
    const best = aaaaResult || aResult

    if (best) {
      console.log(`[nativeHttp] DNS resolved ${rawDomain} → ${best.ip} (${best.label})`)
      _dnsCache.set(rawDomain, { ip: best.ip, timestamp: Date.now() })
      return best.ip
    }
  } catch (e) {
    clearTimeout(timeoutId)
    if (e.name === 'AbortError') {
      console.warn(`[nativeHttp] DNS resolution timed out after ${timeoutMs}ms for ${rawDomain}`)
    } else {
      console.warn('[nativeHttp] DNS resolution error:', e?.message || e)
    }
  }

  console.warn('[nativeHttp] Could not resolve domain:', rawDomain)
  return null
}

/**
 * Configure the local media proxy server with fnOS cookie and base URL.
 * The proxy runs on localhost:18080 and forwards all media requests to fnOS
 * with proper authentication, supporting Range requests for video streaming.
 *
 * IMPORTANT: On IPv6-only networks, Java's HttpURLConnection cannot resolve
 * IPv6-only domains (it only queries A/IPv4 records). So we resolve the domain
 * to an IP address using DNS-over-HTTPS first, then pass the IP to the proxy.
 */
export async function setLocalProxyConfig(cookieString) {
  if (!isNativePlatform()) {
    console.log('[nativeHttp] Not native platform, skipping proxy config')
    return
  }

  // On platforms without CapacitorHttp (e.g. HarmonyOS 卓易通), we need
  // the local proxy even more since standard fetch will hit CORS issues.
  // The proxy plugin (LocalMediaProxy) uses native Java code and doesn't
  // depend on CapacitorHttp, so it should still work.

  if (!cookieString) {
    console.warn('[nativeHttp] Empty cookie string, cannot set proxy config')
    return
  }

  try {
    const LocalMediaProxy = registerPlugin('LocalMediaProxy')
    const settings = JSON.parse(localStorage.getItem('settings') || '{}')
    const rawHost = (settings.fnosHost || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
    const port = settings.fnosPort || 5666

    if (!rawHost) {
      console.warn('[nativeHttp] No fnosHost configured, cannot set proxy config')
      return
    }

    // Use the original domain name directly for the proxy.
    //
    // We used to try DNS-over-HTTPS resolution here (resolveDomainToIp) because
    // Java's HttpURLConnection only queries A (IPv4) records by default and
    // cannot resolve IPv6-only domains. However:
    //
    // 1. DNS-over-HTTPS (Google/Cloudflare) is blocked on some networks,
    //    causing 3-second timeouts that block proxy configuration.
    // 2. On those same networks, OS-level DNS works fine (browser and
    //    WebSocket both resolve the domain instantly).
    // 3. Modern Android uses getaddrinfo() which supports IPv6 (AAAA records).
    //    Java's InetAddress.getAllByName() delegates to the OS resolver.
    // 4. Even if Java DNS fails, it's better to fail fast with a connection
    //    error than to waste 3+ seconds on DNS-over-HTTPS timeout.
    //
    // So we pass the original domain directly and let Java/OS handle resolution.
    const proxyHost = rawHost

    // Wrap IPv6 addresses in brackets for URL construction
    const host = proxyHost.includes(':') && !proxyHost.startsWith('[') ? `[${proxyHost}]` : proxyHost
    const nasUrl = host ? `http://${host}:${port}` : ''

    if (!nasUrl) {
      console.error('[nativeHttp] Failed to build nasUrl — cannot configure proxy')
      return
    }

    // Build originalHost for Host header — always use the user-configured domain:port,
    // even when connecting via resolved IP. This is important for virtual hosting.
    const originalHost = rawHost + ':' + port

    console.log('[nativeHttp] Calling LocalMediaProxy.setConfig...', 'cookie len:', cookieString.length, 'url:', nasUrl, 'host:', originalHost)
    const result = await LocalMediaProxy.setConfig({ cookie: cookieString, url: nasUrl, originalHost })
    console.log('[nativeHttp] LocalMediaProxy.setConfig result:', JSON.stringify(result))

    // Verify the proxy is now configured by checking its status
    try {
      const status = await LocalMediaProxy.getStatus()
      console.log('[nativeHttp] Proxy status after config: running=', status.running, 'hasCookie=', status.hasCookie)
      if (!status.hasCookie) {
        console.error('[nativeHttp] ⚠️ Proxy still reports "not configured" after setConfig!')
      }
    } catch (e) {
      console.warn('[nativeHttp] Could not verify proxy status:', e.message)
    }
  } catch (e) {
    console.error('[nativeHttp] Failed to set local proxy config:', e.message, e.stack)
  }
}

/**
 * Check if the local proxy server is running.
 */
export async function isLocalProxyRunning() {
  // Proxy plugin is Java-based, doesn't need CapacitorHttp
  if (!isNativePlatform()) return false
  try {
    const LocalMediaProxy = registerPlugin('LocalMediaProxy')
    const result = await LocalMediaProxy.getStatus()
    return result?.running || false
  } catch {
    return false
  }
}
