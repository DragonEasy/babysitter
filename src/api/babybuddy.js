import axios from 'axios'
import { useSettingsStore } from '../stores/settingsStore'
import { isNativePlatform, createCapacitorAxiosAdapter, isCapacitorHttpAvailable } from './nativeHttp'

// Cache the proxy target from .env for dev mode
let _devProxyTarget = ''

function getProxyTarget() {
  if (_devProxyTarget) return _devProxyTarget
  // Default from Vite's .env
  if (import.meta.env.DEV && import.meta.env.VITE_BB_URL) {
    _devProxyTarget = import.meta.env.VITE_BB_URL
  }
  return _devProxyTarget
}

/**
 * Update the dev proxy target at runtime.
 * Call this after the user changes the BB URL in settings (dev mode only).
 */
export function setDevProxyTarget(url) {
  _devProxyTarget = url.replace(/\/$/, '')
}

/**
 * Build the base URL for API requests.
 *
 * Strategy:
 *  - Always use the user-configured URL (settingsStore.babybuddyUrl).
 *  - In dev mode, if the configured URL matches the Vite proxy target,
 *    rewrite to a relative path so the proxy handles it (avoids CORS).
 *  - In production or if URL differs from proxy, use the absolute URL directly.
 */
function getBaseURL() {
  const settings = useSettingsStore()
  const userUrl = (settings.babybuddyUrl || '').replace(/\/$/, '')

  if (!userUrl) {
    // Fallback: try .env value in dev
    if (import.meta.env.DEV && import.meta.env.VITE_BB_URL) {
      return ''
    }
    return ''
  }

  // In dev mode: if the user URL matches the proxy target, use relative path (proxy)
  if (import.meta.env.DEV) {
    const proxyTarget = getProxyTarget()
    if (proxyTarget && userUrl === proxyTarget) {
      return ''  // let Vite proxy handle it
    }
  }

  // Otherwise use the user's URL directly (production, DDNS, or different dev URL)
  return userUrl
}

function getApiInstance() {
  const settings = useSettingsStore()
  const baseURL = getBaseURL()

  const instance = axios.create({
    baseURL,
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
    },
    // On native platforms (APK) with CapacitorHttp, use adapter to bypass WebView CORS
    ...(isNativePlatform() && isCapacitorHttpAvailable() ? { adapter: createCapacitorAxiosAdapter() } : {}),
  })

  instance.interceptors.request.use((config) => {
    if (settings.babybuddyToken) {
      config.headers['Authorization'] = `Token ${settings.babybuddyToken}`
    }
    return config
  })

  return instance
}

// ========== Timezone-aware date range helper ==========
/**
 * Convert a local date string (e.g., "2026-06-05") to UTC ISO range strings.
 * BabyBuddy stores times in UTC. Using naive date strings as filters
 * causes early-morning local records (before 8am in UTC+8) to be missed
 * because their UTC date is the previous day.
 *
 * Example for UTC+8: local "2026-06-05" →
 *   start: "2026-06-04T16:00:00.000Z" (local midnight in UTC)
 *   end:   "2026-06-05T15:59:59.999Z" (local 23:59:59 in UTC)
 */
function localDateToUTCRange(date) {
  const start = new Date(`${date}T00:00:00`)
  const end = new Date(`${date}T23:59:59.999`)
  return {
    start: start.toISOString(),
    end: end.toISOString()
  }
}

// ========== Children ==========
export async function fetchChildren() {
  const api = getApiInstance()
  const res = await api.get('/api/children/')
  return res.data.results
}

export async function fetchChild(slug) {
  const api = getApiInstance()
  const res = await api.get(`/api/children/${slug}/`)
  return res.data
}

// ========== Feedings ==========
export async function fetchFeedings(childId, date) {
  const api = getApiInstance()
  const params = { child: childId, limit: 100 }
  if (date) {
    const range = localDateToUTCRange(date)
    params.start_min = range.start
    params.start_max = range.end
  }
  const res = await api.get('/api/feedings/', { params })
  return res.data.results
}

export async function createFeeding(data) {
  const api = getApiInstance()
  const res = await api.post('/api/feedings/', data)
  return res.data
}

export async function updateFeeding(id, data) {
  const api = getApiInstance()
  const res = await api.patch(`/api/feedings/${id}/`, data)
  return res.data
}

export async function deleteFeeding(id) {
  const api = getApiInstance()
  await api.delete(`/api/feedings/${id}/`)
}

// ========== Changes (Diaper) ==========
export async function fetchChanges(childId, date) {
  const api = getApiInstance()
  const params = { child: childId, limit: 100 }
  if (date) {
    const range = localDateToUTCRange(date)
    params.date_min = range.start
    params.date_max = range.end
  }
  const res = await api.get('/api/changes/', { params })
  return res.data.results
}

export async function createChange(data) {
  const api = getApiInstance()
  const res = await api.post('/api/changes/', data)
  return res.data
}

export async function updateChange(id, data) {
  const api = getApiInstance()
  const res = await api.patch(`/api/changes/${id}/`, data)
  return res.data
}

export async function deleteChange(id) {
  const api = getApiInstance()
  await api.delete(`/api/changes/${id}/`)
}

// ========== Sleep ==========
export async function fetchSleep(childId, date) {
  const api = getApiInstance()
  const params = { child: childId, limit: 100 }
  if (date) {
    const range = localDateToUTCRange(date)
    params.start_min = range.start
    params.start_max = range.end
  }
  const res = await api.get('/api/sleep/', { params })
  return res.data.results
}

export async function createSleep(data) {
  const api = getApiInstance()
  try {
    const res = await api.post('/api/sleep/', data)
    return res.data
  } catch (e) {
    // Attach the full error response data to the error for better error messages
    if (e.response?.data) {
      e._responseData = e.response.data
    }
    throw e
  }
}

export async function updateSleep(id, data) {
  const api = getApiInstance()
  const res = await api.patch(`/api/sleep/${id}/`, data)
  return res.data
}

export async function deleteSleep(id) {
  const api = getApiInstance()
  await api.delete(`/api/sleep/${id}/`)
}

// ========== Height ==========
export async function fetchHeight(childId) {
  const api = getApiInstance()
  const res = await api.get('/api/height/', { params: { child: childId, limit: 10, ordering: '-date' } })
  return res.data.results
}

export async function createHeight(data) {
  const api = getApiInstance()
  const res = await api.post('/api/height/', data)
  return res.data
}

export async function updateHeight(id, data) {
  const api = getApiInstance()
  const res = await api.patch(`/api/height/${id}/`, data)
  return res.data
}

export async function deleteHeight(id) {
  const api = getApiInstance()
  await api.delete(`/api/height/${id}/`)
}

// ========== Weight ==========
export async function fetchWeight(childId) {
  const api = getApiInstance()
  const res = await api.get('/api/weight/', { params: { child: childId, limit: 10, ordering: '-date' } })
  return res.data.results
}

export async function createWeight(data) {
  const api = getApiInstance()
  const res = await api.post('/api/weight/', data)
  return res.data
}

export async function updateWeight(id, data) {
  const api = getApiInstance()
  const res = await api.patch(`/api/weight/${id}/`, data)
  return res.data
}

export async function deleteWeight(id) {
  const api = getApiInstance()
  await api.delete(`/api/weight/${id}/`)
}

// ========== Temperature ==========
export async function fetchTemperature(childId, date) {
  const api = getApiInstance()
  const params = { child: childId, limit: 10, ordering: '-date' }
  if (date) {
    const range = localDateToUTCRange(date)
    params.date_min = range.start
    params.date_max = range.end
  }
  const res = await api.get('/api/temperature/', { params })
  return res.data.results
}

export async function createTemperature(data) {
  const api = getApiInstance()
  const res = await api.post('/api/temperature/', data)
  return res.data
}

export async function updateTemperature(id, data) {
  const api = getApiInstance()
  const res = await api.patch(`/api/temperature/${id}/`, data)
  return res.data
}

export async function deleteTemperature(id) {
  const api = getApiInstance()
  await api.delete(`/api/temperature/${id}/`)
}

// ========== Tummy Time ==========
export async function fetchTummyTime(childId, date) {
  const api = getApiInstance()
  const params = { child: childId, limit: 100 }
  if (date) {
    const range = localDateToUTCRange(date)
    params.start_min = range.start
    params.start_max = range.end
  }
  const res = await api.get('/api/tummy-time/', { params })
  return res.data.results
}

export async function createTummyTime(data) {
  const api = getApiInstance()
  const res = await api.post('/api/tummy-time/', data)
  return res.data
}

export async function updateTummyTime(id, data) {
  const api = getApiInstance()
  const res = await api.patch(`/api/tummy-time/${id}/`, data)
  return res.data
}

export async function deleteTummyTime(id) {
  const api = getApiInstance()
  await api.delete(`/api/tummy-time/${id}/`)
}

// ========== Head Circumference ==========
export async function fetchHeadCircumference(childId) {
  const api = getApiInstance()
  const res = await api.get('/api/head-circumference/', { params: { child: childId, limit: 10, ordering: '-date' } })
  return res.data.results
}

export async function createHeadCircumference(data) {
  const api = getApiInstance()
  const res = await api.post('/api/head-circumference/', data)
  return res.data
}

export async function updateHeadCircumference(id, data) {
  const api = getApiInstance()
  const res = await api.patch(`/api/head-circumference/${id}/`, data)
  return res.data
}

export async function deleteHeadCircumference(id) {
  const api = getApiInstance()
  await api.delete(`/api/head-circumference/${id}/`)
}

// ========== Timer ==========
export async function createTimer(childId) {
  const api = getApiInstance()
  const res = await api.post('/api/timers/', { child: childId })
  return res.data
}

export async function stopTimer(id) {
  const api = getApiInstance()
  const res = await api.patch(`/api/timers/${id}/`, { active: false })
  return res.data
}
