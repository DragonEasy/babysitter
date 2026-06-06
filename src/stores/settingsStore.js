import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  // BabyBuddy
  const babybuddyUrl = ref('')
  const babybuddyToken = ref('')

  // FnOS
  const fnosHost = ref('')
  const fnosPort = ref(5666)
  const fnosUsername = ref('')
  const fnosPassword = ref('')
  const fnosConnected = ref(false)
  const fnosAlbumUrl = ref('')
  const fnosAlbumId = ref('')

  // Sleep tracking
  const activeSleepId = ref(null)
  const sleepStartTime = ref(null)

  // Admin lock
  const adminPassword = ref('')
  const isAdminAuthenticated = ref(false)

  function isConfigured() {
    return babybuddyUrl.value && babybuddyToken.value
  }

  function isFnosConfigured() {
    return fnosHost.value && fnosUsername.value
  }

  function isAlbumConfigured() {
    return fnosAlbumId.value
  }

  function parseAlbumUrl(url) {
    fnosAlbumUrl.value = url || ''
    // Extract album ID from URL like http://host:port/p/album/59
    const match = (url || '').match(/\/p\/album\/(\d+)/)
    fnosAlbumId.value = match ? match[1] : ''

    // Auto-extract NAS host and port from album URL if not already set
    if (url && !fnosHost.value) {
      try {
        const urlObj = new URL(url)
        fnosHost.value = urlObj.protocol + '//' + urlObj.hostname
        if (urlObj.port && urlObj.port !== '80' && urlObj.port !== '443') {
          fnosPort.value = parseInt(urlObj.port, 10)
        }
      } catch (e) {
        // Invalid URL, ignore
      }
    }
  }

  function startSleepTracking(id) {
    activeSleepId.value = id
    sleepStartTime.value = new Date().toISOString()
  }

  function stopSleepTracking() {
    activeSleepId.value = null
    sleepStartTime.value = null
  }

  function isSleeping() {
    return !!activeSleepId.value
  }

  function verifyAdmin(password) {
    if (password === adminPassword.value) {
      isAdminAuthenticated.value = true
      return true
    }
    return false
  }

  function lockAdmin() {
    isAdminAuthenticated.value = false
  }

  return {
    babybuddyUrl,
    babybuddyToken,
    fnosHost,
    fnosPort,
    fnosUsername,
    fnosPassword,
    fnosConnected,
    fnosAlbumUrl,
    fnosAlbumId,
    activeSleepId,
    sleepStartTime,
    adminPassword,
    isAdminAuthenticated,
    isConfigured,
    isFnosConfigured,
    isAlbumConfigured,
    parseAlbumUrl,
    startSleepTracking,
    stopSleepTracking,
    isSleeping,
    verifyAdmin,
    lockAdmin
  }
}, {
  persist: true
})
