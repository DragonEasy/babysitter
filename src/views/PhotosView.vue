<template>
  <div class="px-4 py-4">
    <!-- Not configured -->
    <div v-if="!settingsStore.isFnosConfigured() || !settingsStore.isAlbumConfigured()" class="flex flex-col items-center justify-center py-20 gap-4">
      <div class="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
        <svg class="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
      </div>
      <p class="text-gray-500 text-center text-sm leading-relaxed px-8">
        请先在设置中配置飞牛 NAS 的连接信息和宝宝相册地址
      </p>
      <button @click="$router.push('/settings')" class="action-btn action-btn-info">
        去设置
      </button>
    </div>

    <!-- Connecting / Loading -->
    <div v-else-if="connecting || loading" class="flex flex-col items-center justify-center py-20 gap-3">
      <div class="spinner"></div>
      <p class="text-gray-400 text-sm">{{ connecting ? '正在连接飞牛 NAS...' : '正在加载照片...' }}</p>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="flex flex-col items-center justify-center py-20 gap-4">
      <div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
        <svg class="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
        </svg>
      </div>
      <p class="text-red-500 text-center text-sm leading-relaxed px-8">{{ error }}</p>
      <button @click="refreshPhotos" class="action-btn action-btn-primary">
        重试
      </button>
    </div>

    <!-- Photo waterfall timeline -->
    <template v-else>
      <!-- Header with refresh -->
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold text-gray-800">
          宝宝相册
          <span v-if="allPhotos.length" class="text-sm font-normal text-gray-400 ml-2">{{ allPhotos.length }} 张 ({{ groupedPhotos.length }}天)</span>
        </h2>
        <button @click="refreshPhotos" :disabled="refreshing" class="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:bg-gray-200 transition-colors">
          <svg class="w-4 h-4 text-gray-500" :class="{ 'animate-spin': refreshing }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </button>
      </div>

      <!-- Empty -->
      <div v-if="!allPhotos.length && !loading" class="flex flex-col items-center justify-center py-20 gap-3">
        <div class="text-6xl">📷</div>
        <p class="text-gray-400 text-sm">这个相册还没有照片</p>
      </div>

      <!-- Timeline layout -->
      <div class="timeline-wrapper">
        <div
          v-for="(group, gi) in groupedPhotos"
          :key="gi"
          class="timeline-section"
          :class="{ 'timeline-section-last': gi === groupedPhotos.length - 1 }"
        >
          <!-- Left: timeline dot + line -->
          <div class="timeline-left">
            <div class="timeline-dot"></div>
            <div class="timeline-connector"></div>
          </div>

          <!-- Right: date header + photos -->
          <div class="timeline-right">
            <!-- Date header -->
            <div class="timeline-date-header">
              <span class="timeline-day-number">{{ group.dayLabel }}</span>
              <span class="timeline-relative-tag" :class="group.relativeClass">{{ group.relativeTag }}</span>
              <span class="text-xs text-gray-400 ml-1">{{ group.date }} ({{ group.photos.length }}张)</span>
            </div>

            <!-- Waterfall grid for this date -->
            <div class="waterfall-grid">
              <div
                v-for="(photo, pi) in group.photos"
                :key="photo.id || pi"
                class="waterfall-item"
                @click="openPreview(group.photos, pi)"
              >
                <div class="waterfall-card">
                  <img
                    v-if="getPhotoSrc(photo)"
                    :src="getPhotoSrc(photo)"
                    :alt="photo.name"
                    loading="lazy"
                    decoding="async"
                    class="w-full block rounded-lg photo-img"
                    style="min-height:120px;background:#f3f4f6;"
                    @error="onImgError($event, photo)"
                  />
                  <div v-else class="w-full aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
                    <span class="text-3xl">❓</span>
                  </div>

                  <!-- Video badge with play icon + duration -->
                  <div v-if="photo.isVideo" class="video-badge">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"/>
                    </svg>
                    <span v-if="photo.duration" class="video-duration">{{ formatDuration(photo.duration) }}</span>
                  </div>

                  <!-- Download button on thumbnail -->
                  <button class="thumb-download-btn" @click.stop="handleDownload(photo)" :title="'下载'">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Load more trigger (intersection observer sentinel) -->
      <div v-if="hasMore" ref="loadMoreTrigger" class="flex justify-center py-4" style="min-height:40px;">
        <!-- Loading spinner -->
        <div v-if="loadingMore" class="flex items-center gap-2 text-gray-400 text-sm">
          <span class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
          加载更多照片...
        </div>
        <!-- Manual load button -->
        <button v-else-if="!autoLoadEnabled" @click="loadMorePhotos" class="action-btn text-sm">
          加载更多
        </button>
        <!-- Auto-load sentinel (invisible but has height for intersection observer) -->
        <div v-else class="text-gray-300 text-xs">下滑加载更多</div>
      </div>

      <!-- End of album -->
      <div v-else-if="allPhotos.length > 0 && !loading" class="text-center py-8 text-gray-400 text-sm">
        已加载全部 {{ allPhotos.length }} 张照片
      </div>
    </template>

    <!-- Fullscreen preview overlay -->
    <Teleport to="body">
      <div v-if="previewVisible" class="preview-overlay" @click.self="closePreview">
        <!-- Close button -->
        <button class="preview-close" @click="closePreview">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>

        <!-- Counter -->
        <div class="preview-counter">{{ previewIndex + 1 }} / {{ previewPhotos.length }}</div>

        <!-- Download button -->
        <button class="preview-download" @click.stop="handleDownload(previewCurrentPhoto)" :disabled="downloadState.downloading" :title="downloadState.downloading ? '下载中...' : '下载到本地'">
          <svg v-if="!downloadState.downloading" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
          <div v-else class="download-spinner-sm"></div>
        </button>

        <!-- Download progress bar -->
        <div v-if="downloadState.downloading" class="download-progress-wrap">
          <div class="download-progress-bar">
            <div class="download-progress-fill" :style="{ width: downloadState.progress + '%' }"></div>
          </div>
          <span class="download-progress-text">{{ downloadState.progress }}%</span>
        </div>

        <!-- Image / Video preview -->
        <div class="preview-image-wrap" @click.self="nextPhoto">
          <!-- Video: direct streaming (native WebViewClient adds cookie, browser Vite proxy handles auth) -->
          <div v-if="previewIsVideo" class="preview-video-container" @click.self="nextPhoto">
            <video
              v-if="videoBlobReady && getVideoDisplayUrl(previewCurrentPhoto)"
              ref="videoElement"
              :src="getVideoDisplayUrl(previewCurrentPhoto)"
              class="preview-image"
              controls
              playsinline
              webkit-playsinline
              x5-video-player-type="h5"
              x5-video-player-fullscreen="true"
              preload="metadata"
              @loadedmetadata="onVideoReady"
              @canplay="onVideoCanPlay"
              @error="onVideoError"
              @waiting="videoBuffering = true"
              @playing="videoBuffering = false"
            ></video>
            <!-- Buffering indicator (during playback) -->
            <div v-if="videoBuffering" class="preview-buffering">
              <div class="spinner spinner-sm"></div>
            </div>
          </div>
          <!-- Image -->
          <img
            v-else-if="previewSrc"
            :src="previewSrc"
            class="preview-image"
            @load="previewLoading = false"
            @error="previewLoading = false"
          />
          <div v-if="previewLoading && !previewIsVideo" class="flex items-center justify-center h-full">
            <div class="spinner"></div>
          </div>
        </div>

        <!-- Nav buttons -->
        <button v-if="previewIndex > 0" class="preview-nav preview-nav-left" @click.stop="prevPhoto">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <button v-if="previewIndex < previewPhotos.length - 1" class="preview-nav preview-nav-right" @click.stop="nextPhoto">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, inject, nextTick, reactive } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { useChildStore } from '../stores/childStore'
import { getFnOSClient, fetchAlbumPhotos, buildProxiedPhotoUrl, buildProxiedVideoUrl, buildPhotoUrl } from '../api/fnos'
import { isNativePlatform, setLocalProxyConfig } from '../api/nativeHttp'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'

const settingsStore = useSettingsStore()
const childStore = useChildStore()
const showToast = inject('showToast')

// URL cache to avoid rebuilding URLs repeatedly
const _urlCache = new Map()
function getCachedPhotoUrl(photo, size = 'medium') {
  const key = `${photo.id || photo.guid}-${size}`
  if (!_urlCache.has(key)) {
    _urlCache.set(key, buildProxiedPhotoUrl(photo, size))
  }
  return _urlCache.get(key)
}

// Blob URL cache (legacy, no longer used for images but kept for video cache)
const _blobUrlCache = new Map()

/**
 * Get a displayable URL for an image.
 * On native platforms: uses local proxy URL (http://localhost:18080/fnos-proxy/...).
 * The proxy forwards to fnOS with cookie auth and supports JPEG sizes (not HEIC).
 * On browser/dev: uses Vite proxy URL.
 */
function getPhotoSrc(photo) {
  const id = photo.id || photo.guid
  if (!id) return null

  // Already have a display URL cached
  if (displayUrlMap[id]) return displayUrlMap[id]

  // Get the URL (proxied on browser, direct on native)
  const url = getCachedPhotoUrl(photo, 'medium')
  if (!url) return null

  // Cache and return
  displayUrlMap[id] = url
  return url
}

// Preload next preview image
function preloadPreview(photo) {
  if (!photo) return
  const url = getCachedPhotoUrl(photo, 'xl')
  if (url) {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
  }
}

const connecting = ref(false)
const loading = ref(false)
const loadingMore = ref(false)
const refreshing = ref(false)
const error = ref(null)
const allPhotos = ref([])
const currentOffset = ref(0)
const pageSize = 30
const hasMore = ref(true)
const autoLoadEnabled = ref(true)
const loadMoreTrigger = ref(null)
let loadMoreObserver = null

// Preview state
const previewVisible = ref(false)
const previewIndex = ref(0)
const previewPhotos = ref([])
const previewLoading = ref(false)

const fnosClient = getFnOSClient()

// Group photos by date with timeline labels
const groupedPhotos = computed(() => {
  const groups = []
  let currentGroup = null
  const birthDate = childStore.currentChild?.birth_date

  for (const photo of allPhotos.value) {
    const date = photo.date || '未知日期'
    if (!currentGroup || currentGroup.date !== date) {
      currentGroup = { date, photos: [], dayLabel: '', relativeTag: '', relativeClass: '' }
      // Compute day label (第X天)
      if (birthDate && date !== '未知日期') {
        const photoDate = new Date(date + 'T00:00:00')
        const birth = new Date(birthDate + 'T00:00:00')
        const daysDiff = Math.floor((photoDate - birth) / (1000 * 60 * 60 * 24)) + 1
        if (daysDiff > 0) {
          currentGroup.dayLabel = `第${daysDiff}天`
        }
      }
      // Compute relative tag (今天/昨天/前天/X天前)
      // CRITICAL: Use local date comparison, NOT UTC.
      // new Date("2026-06-05") parses as UTC midnight, which is 8am local time in UTC+8.
      // This causes dayDiff to be wrong (-1 for today). Use "T00:00:00" to force local parse.
      const now = new Date()
      const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      if (date !== '未知日期') {
        // Both dates in local timezone, direct comparison
        const todayMs = new Date(localToday + 'T00:00:00').getTime()
        const photoMs = new Date(date + 'T00:00:00').getTime()
        const dayDiff = Math.round((todayMs - photoMs) / (1000 * 60 * 60 * 24))
        if (dayDiff === 0) {
          currentGroup.relativeTag = '今天'
          currentGroup.relativeClass = 'tag-today'
        } else if (dayDiff === 1) {
          currentGroup.relativeTag = '昨天'
          currentGroup.relativeClass = 'tag-yesterday'
        } else if (dayDiff === 2) {
          currentGroup.relativeTag = '前天'
          currentGroup.relativeClass = 'tag-before'
        } else if (dayDiff > 2 && dayDiff < 30) {
          currentGroup.relativeTag = `${dayDiff}天前`
          currentGroup.relativeClass = 'tag-ago'
        }
      }
      groups.push(currentGroup)
    }
    currentGroup.photos.push(photo)
  }

  return groups
})

// Reactive URL map for image display URLs
const displayUrlMap = reactive({})

function formatFileSize(bytes) {
  if (bytes <= 0) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatTime(dateTime) {
  if (!dateTime) return ''
  const time = dateTime.split(' ')[1]
  return time ? time.substring(0, 5) : ''
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return ''
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `0:${String(secs).padStart(2, '0')}`
}

function onImgError(event, photo) {
  console.warn('[Photos] Image failed:', photo.thumb || photo.id)
  // Try xl size URL on error (larger JPEG, avoids HEIC)
  const xlUrl = getCachedPhotoUrl(photo, 'xl')
  if (xlUrl && !event.target.src.includes('/xl/') && !event.target.src.includes('/l/')) {
    event.target.src = xlUrl
  }
}

async function connectFnOS() {
  // CRITICAL: Always ensure the local proxy server has the fnOS cookie.
  // The proxy runs on localhost:18080 and forwards all media requests
  // to fnOS with proper authentication. On app restart, token is restored
  // from localStorage, but the proxy config needs to be re-set.
  console.log('[Photos] connectFnOS called, isNative:', isNativePlatform(),
    'token:', fnosClient.token ? 'yes' : 'no',
    'wsState:', fnosClient.ws ? fnosClient.ws.readyState : 'no ws')

  // Step 1: Always configure local proxy first (needed for HTTP API on native)
  if (isNativePlatform()) {
    const cookieStr = fnosClient.buildCookieString?.() || ''
    console.log('[Photos] Cookie string length:', cookieStr.length, 'preview:', cookieStr.substring(0, 60))
    if (cookieStr) {
      try {
        await setLocalProxyConfig(cookieStr)
        console.log('[Photos] Local proxy config set successfully')
      } catch (e) {
        console.error('[Photos] Failed to set local proxy config:', e)
      }
    } else {
      console.warn('[Photos] No cookie string available for proxy')
    }
  }

  // Check if WebSocket is connected (readyState 1 = OPEN)
  const wsConnected = fnosClient.ws && fnosClient.ws.readyState === WebSocket.OPEN

  if (fnosClient.token && wsConnected) {
    console.log('[Photos] Token and WebSocket both available, skipping reconnect')
    return true
  }

  // If we have a token but WebSocket is not connected, we need to reconnect.
  // This happens on page reload — token is restored from localStorage but
  // WebSocket needs to be re-established (especially on HarmonyOS 卓易通 where
  // CapacitorHttp is unavailable and we rely on WebSocket API fallback).
  if (fnosClient.token && !wsConnected) {
    console.log('[Photos] Token exists but WebSocket disconnected, reconnecting...')
  }

  connecting.value = true
  error.value = null
  try {
    const host = settingsStore.fnosHost
    const port = settingsStore.fnosPort
    await fnosClient.connect(host, port)
    await fnosClient.login(settingsStore.fnosUsername, settingsStore.fnosPassword)

    if (fnosClient.token) {
      connecting.value = false
      // On native: configure local proxy with the new cookie
      if (isNativePlatform()) {
        const cookieStr = fnosClient.buildCookieString?.() || ''
        await setLocalProxyConfig(cookieStr)
        console.log('[Photos] Proxy config set after fresh login')
      }
      return true
    } else {
      throw new Error('登录未返回有效 token')
    }
  } catch (e) {
    connecting.value = false
    const msg = e.message || '连接失败'

    // IMPORTANT: Even if WS connection/login fails, we may still be able to
    // load photos via HTTP API (local proxy + authx signature). Only show
    // error if we truly have no auth at all.
    if (fnosClient.token) {
      console.warn('[Photos] WS connect/login failed but token exists — HTTP API may still work:', msg)
      // Don't show error — let loadPhotos() try via HTTP API
      return true
    }

    error.value = `飞牛 NAS 连接失败: ${msg}`
    console.error('[Photos] Connect error:', e)
    return false
  }
}

async function loadPhotos(offset = 0) {
  if (!settingsStore.fnosAlbumId) return

  if (offset === 0) {
    loading.value = true
  } else {
    loadingMore.value = true
  }
  error.value = null

  try {
    console.log('[Photos] Fetching albumId=', settingsStore.fnosAlbumId, 'offset=', offset, 'pageSize=', pageSize)
    console.log('[Photos] Client auth state - token:', fnosClient.token ? 'yes' : 'no',
      'longToken:', fnosClient.longToken ? 'yes' : 'no', 'signKey:', fnosClient.signKey ? 'yes' : 'no')

    const photos = await fetchAlbumPhotos(fnosClient, settingsStore.fnosAlbumId, offset, pageSize)
    console.log(`[Photos] Loaded ${photos.length} photos from offset ${offset}, total now: ${offset === 0 ? photos.length : allPhotos.value.length + photos.length}`)
    // Debug: log dates of returned photos
    if (photos.length > 0) {
      console.log(`[Photos] Photo date range: ${photos[photos.length-1].date || '?'} to ${photos[0].date || '?'}`)
    } else if (offset === 0) {
      // Empty album is valid — don't show error, just empty state
      console.log('[Photos] Album returned 0 photos (empty album)')
    }

    if (offset === 0) {
      allPhotos.value = photos
    } else {
      allPhotos.value.push(...photos)
    }

    currentOffset.value = offset + photos.length
    hasMore.value = photos.length >= pageSize

    // Re-setup intersection observer after DOM updates
    if (autoLoadEnabled.value) {
      setTimeout(() => setupInfiniteScroll(), 100)
    }

    // Debug: log first photo structure
    if (photos.length > 0) {
      console.log('[Photos] First photo sample:', JSON.stringify(photos[0]).substring(0, 300))
      const videoCount = photos.filter(p => p.isVideo).length
      const photoCount = photos.length - videoCount
      console.log(`[Photos] Stats: ${photoCount} photos, ${videoCount} videos`)
    }
  } catch (e) {
    const status = e.message || ''
    const isAlbumLoadFailure = e.isAlbumLoadFailure

    if (status.includes('401')) {
      error.value = '认证失败 (HTTP 401): 请检查飞牛 NAS 账号密码是否正确，或在设置中重新测试连接'
    } else if (status.includes('404')) {
      error.value = '相册不存在 (HTTP 404): 请检查相册地址是否正确'
    } else if (isAlbumLoadFailure) {
      // Detailed diagnostic error from fetchAlbumPhotos
      const diagInfo = e.diagnosticErrors || []
      const wsFailed = diagInfo.some(e => e.includes('Strategy4'))
      const allHttpFailed = diagInfo.filter(e => e.includes('Strategy1') || e.includes('Strategy2') || e.includes('Strategy3')).length >= 3

      let msg = '相册加载失败。'
      if (allHttpFailed && wsFailed) {
        msg += '所有方式均失败，可能是相册ID不正确或连接异常。'
      } else if (allHttpFailed && !wsFailed) {
        msg += 'HTTP请求失败但WebSocket正常，可能是网络环境兼容问题。请尝试重新进入相册页。'
      }
      msg += `\n\n详情: ${diagInfo.join(' | ')}`
      error.value = msg
    } else {
      error.value = `加载照片失败: ${status}`
    }
    console.error('[Photos] Load error:', e)
  } finally {
    loading.value = false
    loadingMore.value = false
    refreshing.value = false
  }
}

async function refreshPhotos() {
  refreshing.value = true
  currentOffset.value = 0
  allPhotos.value = []
  hasMore.value = true

  const connected = await connectFnOS()
  if (connected) {
    await loadPhotos(0)
  }
  if (!refreshing.value) refreshing.value = false

  // Setup infinite scroll after initial load
  if (autoLoadEnabled.value) {
    setTimeout(() => setupInfiniteScroll(), 200)
  }
}

async function loadMorePhotos() {
  await loadPhotos(currentOffset.value)
}

function openPreview(photos, index) {
  const photo = photos[index]

  previewPhotos.value = photos
  previewIndex.value = index
  previewVisible.value = true
  previewLoading.value = true
  videoBlobReady.value = false
  videoBuffering.value = false

  if (photo?.isVideo) {
    // Video: use direct fnOS URL for streaming playback.
    // Native WebViewClient.shouldInterceptRequest adds cookie automatically.
    // Browser: Vite proxy handles auth.
    videoPlaying.value = true
    videoBlobReady.value = true  // Immediately enable <video> tag (streaming)
    previewLoading.value = false
  }

  // Preload next image
  nextTick(() => {
    if (index < photos.length - 1) {
      preloadPreview(photos[index + 1])
    }
  })
}

function closePreview() {
  previewVisible.value = false
  previewPhotos.value = []
  previewIndex.value = 0
  videoPlaying.value = false
  videoBlobReady.value = false
  videoBuffering.value = false
}

function nextPhoto() {
  if (previewIndex.value < previewPhotos.value.length - 1) {
    previewIndex.value++
    const photo = previewPhotos.value[previewIndex.value]

    previewLoading.value = true
    videoBlobReady.value = false
    videoBuffering.value = false
    videoPlaying.value = !!photo?.isVideo

    if (photo?.isVideo) {
      // Video: use direct URL (native WebViewClient handles auth)
      videoBlobReady.value = true
      previewLoading.value = false
    }
    nextTick(() => {
      if (previewIndex.value < previewPhotos.value.length - 1) {
        preloadPreview(previewPhotos.value[previewIndex.value + 1])
      }
    })
  }
}

function prevPhoto() {
  if (previewIndex.value > 0) {
    previewIndex.value--
    const photo = previewPhotos.value[previewIndex.value]

    previewLoading.value = true
    videoBlobReady.value = false
    videoBuffering.value = false
    videoPlaying.value = !!photo?.isVideo

    if (photo?.isVideo) {
      // Video: use direct URL (native WebViewClient handles auth)
      videoBlobReady.value = true
      previewLoading.value = false
    }
  }
}

const previewIsVideo = computed(() => {
  const photo = previewPhotos.value[previewIndex.value]
  return photo?.isVideo || false
})

const previewCurrentPhoto = computed(() => {
  return previewPhotos.value[previewIndex.value] || null
})

// Video playback state
const videoPlaying = ref(false)
const videoBlobReady = ref(false)
const videoBuffering = ref(false)
const videoElement = ref(null)

/**
 * Get video display URL for preview.
 * Returns the direct fnOS URL. On native, WebViewClient.shouldInterceptRequest
 * intercepts and adds cookie headers for streaming playback.
 * On browser, Vite proxy handles auth.
 */
function getVideoDisplayUrl(photo) {
  if (!photo) return ''
  return buildProxiedVideoUrl(photo) || ''
}

function onVideoReady() {
  // Video metadata loaded — try to auto-play.
  // Some WebView environments (HarmonyOS 4.2) have issues with the autoplay attribute
  // on <video>. Instead, we manually call play() after metadata is loaded.
  const video = videoElement.value
  if (video) {
    console.log('[Photos] Video metadata loaded, attempting play()')
    try {
      const p = video.play()
      // play() returns a Promise in modern browsers
      if (p && typeof p.catch === 'function') {
        p.catch(err => {
          console.warn('[Photos] Auto-play blocked:', err.name, err.message)
          // Auto-play was blocked (common on mobile/WebView). User must tap play button.
          // This is fine — the controls are visible so they can tap play.
        })
      }
    } catch (e) {
      console.warn('[Photos] play() exception:', e?.message)
    }
  }
}

function onVideoCanPlay() {
  // Enough data buffered to start playback
  previewLoading.value = false
}

function onVideoError(e) {
  console.error('[Photos] Video playback error:', e, 'src:', getVideoDisplayUrl(previewCurrentPhoto)?.substring(0, 100))
  // Don't show error toast immediately — the native interceptor might still be initializing
  // or the video might need a moment to buffer. Just log the error.
  videoPlaying.value = false
  videoBlobReady.value = false
  previewLoading.value = false
}

// ========== Download functionality ==========
const downloadState = reactive({
  downloading: false,
  progress: 0,
  fileName: ''
})

async function handleDownload(photo) {
  if (!photo || downloadState.downloading) return

  downloadState.downloading = true
  downloadState.progress = 0
  downloadState.fileName = ''

  try {
    const isVideo = photo.isVideo
    // Clean filename: use original name or generate one
    let fileName = photo.name || ''
    if (!fileName || fileName.length < 2) {
      const ext = isVideo ? '.mp4' : '.jpg'
      fileName = `${isVideo ? 'video' : 'photo'}_${photo.id}${ext}`
    }
    // Ensure extension
    if (isVideo && !fileName.match(/\.(mp4|mov|avi|mkv)$/i)) fileName += '.mp4'
    if (!isVideo && !fileName.match(/\.(jpg|jpeg|png|heic|gif|webp)$/i)) fileName += '.jpg'

    // Build download URL — always use local proxy on native
    const url = isVideo
      ? buildProxiedVideoUrl(photo)
      : buildProxiedPhotoUrl(photo, 'xl')

    if (!url) {
      showToast('无法获取下载地址', 'error')
      return
    }

    downloadState.fileName = fileName

    if (isNativePlatform()) {
      // Native: use CapacitorHttp.request with responseType:'arraybuffer' to get raw data,
      // then convert to base64 and save via Filesystem.
      // CapacitorHttp patches window.fetch/XHR, so responseType:'blob' is unreliable on Android.
      // Using responseType:'arraybuffer' returns the data as a base64 string in Capacitor 8.
      downloadState.progress = 5

      const response = await CapacitorHttp.request({
        url: url,
        method: 'GET',
        responseType: 'arraybuffer'
      })

      downloadState.progress = 70

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`HTTP ${response.status}`)
      }

      let base64Data = response.data
      if (!base64Data) {
        throw new Error('下载数据为空')
      }

      // CapacitorHttp with responseType 'arraybuffer' returns base64 string
      // If it's already a string, use it directly; if it's binary, convert
      if (typeof base64Data !== 'string') {
        // Fallback: try base64 responseType
        const resp2 = await CapacitorHttp.request({
          url: url,
          method: 'GET',
          responseType: 'base64'
        })
        base64Data = resp2.data
        if (!base64Data) throw new Error('下载数据为空')
      }

      downloadState.progress = 90

      // Save to app's Documents directory (Android scoped storage compatible)
      // Path: /storage/emulated/0/Android/data/com.babybuddy.app/files/Documents/宝宝管家/
      const result = await Filesystem.writeFile({
        path: `宝宝管家/${fileName}`,
        data: base64Data,
        directory: Directory.Documents,
        recursive: true
      })

      downloadState.progress = 100
      console.log('[Photos] File saved to:', result.uri)
      showToast(`已保存: ${fileName}`)
    } else {
      // Browser: fetch + blob download with progress
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const contentLength = response.headers.get('content-length')
        const total = contentLength ? parseInt(contentLength, 10) : 0
        let loaded = 0

        const reader = response.body.getReader()
        const chunks = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          loaded += value.length
          if (total > 0) {
            downloadState.progress = Math.round((loaded / total) * 100)
          } else {
            downloadState.progress = Math.min(90, Math.round(loaded / 10000))
          }
        }

        downloadState.progress = 95
        const blob = new Blob(chunks)
        const blobUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(blobUrl)

        showToast(`正在下载 ${fileName}`)
      } catch (e) {
        // Fallback: open in new tab
        window.open(url, '_blank')
      }
    }
  } catch (e) {
    console.error('[Photos] Download error:', e)
    showToast('下载失败: ' + (e.message || '未知错误'), 'error')
  } finally {
    downloadState.downloading = false
    downloadState.progress = 0
  }
}

const previewSrc = computed(() => {
  const photo = previewPhotos.value[previewIndex.value]
  if (!photo || photo.isVideo) return null
  // Use 'xl' instead of 'original' — original photos may be HEIC format
  // which Android WebView cannot render. 'xl' gives a large JPEG that's
  // visually identical but universally supported.
  return getCachedPhotoUrl(photo, 'xl')
})

function setupInfiniteScroll() {
  if (loadMoreObserver) {
    loadMoreObserver.disconnect()
    loadMoreObserver = null
  }

  if (!loadMoreTrigger.value || !autoLoadEnabled.value) return

  // The App layout uses <main class="flex-1 overflow-y-auto"> as the scroll container,
  // not the window. We must observe intersections relative to that element.
  const scrollRoot = document.querySelector('main.overflow-y-auto')

  loadMoreObserver = new IntersectionObserver((entries) => {
    const entry = entries[0]
    if (entry.isIntersecting && hasMore.value && !loadingMore.value && !loading.value) {
      console.log('[Photos] Intersection triggered, loading more photos...')
      loadMorePhotos()
    }
  }, {
    root: scrollRoot || null,
    rootMargin: '200px 0px',
    threshold: 0
  })

  loadMoreObserver.observe(loadMoreTrigger.value)
}

onMounted(() => {
  if (settingsStore.isFnosConfigured() && settingsStore.isAlbumConfigured()) {
    refreshPhotos()
  }
})

onUnmounted(() => {
  if (loadMoreObserver) {
    loadMoreObserver.disconnect()
    loadMoreObserver = null
  }
})
</script>

<style scoped>
/* ──────────── Timeline layout ──────────── */
.timeline-wrapper {
  padding-left: 0;
}

.timeline-section {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.timeline-section-last .timeline-connector {
  display: none;
}

/* Left: dot + vertical line */
.timeline-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 20px;
  position: relative;
}

.timeline-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #3b82f6;
  border: 2px solid #dbeafe;
  flex-shrink: 0;
  margin-top: 6px;
  z-index: 2;
}

.timeline-connector {
  flex: 1;
  width: 2px;
  background: #e5e7eb;
  min-height: 20px;
  margin-top: 4px;
}

/* Right: date header + photos */
.timeline-right {
  flex: 1;
  min-width: 0;
}

.timeline-date-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.timeline-day-number {
  font-size: 15px;
  font-weight: 700;
  color: #1f2937;
}

.timeline-relative-tag {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 10px;
}

.tag-today {
  background: #dbeafe;
  color: #2563eb;
}

.tag-yesterday {
  background: #fef3c7;
  color: #b45309;
}

.tag-before {
  background: #f3e8ff;
  color: #7c3aed;
}

.tag-ago {
  background: #f3f4f6;
  color: #6b7280;
}

/* Waterfall grid */
.waterfall-grid {
  column-count: 2;
  column-gap: 8px;
  width: 100%;
  padding-right: 12px; /* Right edge margin so images don't touch screen */
  box-sizing: border-box;
}

.waterfall-item {
  break-inside: avoid;
  margin-bottom: 8px;
}

.waterfall-card {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  background: white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  transition: transform 0.2s;
  width: 100%;
}

.waterfall-card:active {
  transform: scale(0.97);
}

/* Photo image with smooth loading */
.photo-img {
  width: 100%;
  display: block;
  min-height: 120px;
  object-fit: cover;
  background: #f3f4f6;
  transition: opacity 0.3s ease;
  opacity: 0;
}
.photo-img[src] {
  opacity: 1;
}

.waterfall-card img {
  width: 100%;
  display: block;
  min-height: 120px;
  object-fit: cover;
  background: #f3f4f6;
}

.video-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  height: 32px;
  padding: 0 8px;
  border-radius: 16px;
  background: rgba(0,0,0,0.65);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 11px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.video-duration {
  font-variant-numeric: tabular-nums;
}

/* Thumbnail download button */
.thumb-download-btn {
  position: absolute;
  bottom: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(0,0,0,0.5);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, background 0.2s;
  z-index: 2;
}
.waterfall-card:hover .thumb-download-btn {
  opacity: 1;
}
.thumb-download-btn:hover {
  background: rgba(0,0,0,0.75);
}
.thumb-download-btn:active {
  transform: scale(0.9);
}

/* Fullscreen preview */
.preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.95);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-video-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-loading-center {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.preview-buffering {
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.6);
  padding: 6px 14px;
  border-radius: 20px;
  z-index: 3;
}

.spinner-sm {
  width: 16px;
  height: 16px;
  border-width: 2px;
}

.video-progress-bar {
  width: 160px;
  height: 4px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 8px;
}

.video-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #60a5fa, #a78bfa);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.video-play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.3);
  z-index: 2;
}

.video-play-button {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(255,255,255,0.92);
  color: #333;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 24px rgba(0,0,0,0.35);
  transition: transform 0.2s, box-shadow 0.2s;
}
.video-play-button:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 32px rgba(0,0,0,0.45);
}
.video-play-button:active {
  transform: scale(0.96);
}

.video-play-button-disabled {
  background: rgba(255,255,255,0.5);
  cursor: default;
}

.preview-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255,255,255,0.1);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  z-index: 10;
  transition: background 0.2s;
}

.preview-close:hover {
  background: rgba(255,255,255,0.2);
}

.preview-counter {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255,255,255,0.7);
  font-size: 14px;
  z-index: 10;
}

/* Download button */
.preview-download {
  position: absolute;
  top: 12px;
  right: 60px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255,255,255,0.1);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  z-index: 10;
  transition: background 0.2s;
}
.preview-download:hover {
  background: rgba(255,255,255,0.2);
}
.preview-download:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Download progress bar */
.download-progress-wrap {
  position: absolute;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(0,0,0,0.7);
  padding: 8px 16px;
  border-radius: 20px;
  z-index: 10;
  min-width: 200px;
}
.download-progress-bar {
  flex: 1;
  height: 6px;
  background: rgba(255,255,255,0.15);
  border-radius: 3px;
  overflow: hidden;
}
.download-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #60a5fa, #a78bfa);
  border-radius: 3px;
  transition: width 0.3s ease;
}
.download-progress-text {
  color: rgba(255,255,255,0.9);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  min-width: 32px;
  text-align: right;
}

/* Download small spinner */
.download-spinner-sm {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255,255,255,0.2);
  border-top-color: white;
  border-radius: 50%;
  animation: download-spin 0.8s linear infinite;
}
@keyframes download-spin {
  to { transform: rotate(360deg); }
}

.preview-image-wrap {
  max-width: 95%;
  max-height: 90%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-image {
  max-width: 100%;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 4px;
}

.preview-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255,255,255,0.1);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  z-index: 10;
  transition: background 0.2s;
}

.preview-nav:hover {
  background: rgba(255,255,255,0.2);
}

.preview-nav-left {
  left: 12px;
}

.preview-nav-right {
  right: 12px;
}

/* Responsive */
@media (min-width: 768px) {
  .waterfall-grid {
    column-count: 3;
  }
}

@media (min-width: 1024px) {
  .waterfall-grid {
    column-count: 4;
  }
}
</style>
