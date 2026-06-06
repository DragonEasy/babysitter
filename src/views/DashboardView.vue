<template>
  <div class="dashboard-root">
    <!-- ===== Not configured ===== -->
    <div v-if="!settingsStore.isConfigured()" class="unconfigured">
      <div class="unconfigured-icon">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
      </div>
      <p class="unconfigured-text">请先在设置中配置 BabyBuddy 服务器地址和 API Token</p>
      <button class="action-btn action-btn-primary" @click="$router.push('/settings')">去设置</button>
    </div>

    <!-- ===== Main dashboard ===== -->
    <template v-else>
      <!-- ========== SCREEN 1: Two-column grid ========== -->
      <div class="dashboard-grid">

        <!-- ========== LEFT COLUMN — Quick Actions ========== -->
        <div class="left-col">
          <!-- Baby avatar + name + age + lock -->
          <div class="baby-hero glass" v-if="child">
            <div class="baby-hero-avatar" @click="showEditName" title="点击编辑名字">
              {{ displayName?.charAt(0) || '?' }}
            </div>
            <div class="baby-hero-info">
              <h2 class="baby-hero-name" @click="showEditName" title="点击编辑名字">{{ displayName || '宝宝' }}</h2>
              <div class="baby-hero-meta">
                <span v-if="ageText" class="baby-hero-age">{{ ageText }}</span>
                <select
                  v-if="childStore.children.length > 1"
                  v-model="childStore.currentChildId"
                  class="baby-switch-select"
                >
                  <option v-for="c in childStore.children" :key="c.id" :value="c.id">{{ c.last_name }}{{ c.first_name }}</option>
                </select>
              </div>
            </div>
            <!-- Lock / Unlock toggle button -->
            <div
              class="baby-hero-lock"
              :class="{ 'baby-hero-lock-locked': !settingsStore.isAdminAuthenticated }"
              @click="toggleAdminLock"
              :title="settingsStore.isAdminAuthenticated ? '点击锁定' : '点击解锁'"
            >
              <svg v-if="settingsStore.isAdminAuthenticated" class="lock-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/>
              </svg>
              <svg v-else class="lock-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
            </div>
          </div>

          <!-- ── Feeding: Split left/right ── -->
          <div class="feed-split">
            <button class="feed-btn feed-btn-quick" @click="handleQuickFeed" :disabled="!canOperate || quickFeedCooldown">
              <span class="feed-btn-icon">🍼</span>
              <div class="feed-btn-label">
                <span class="feed-btn-text">快速喂奶</span>
                <span class="feed-btn-hint">{{ quickFeedHint }}</span>
              </div>
            </button>
            <button class="feed-btn feed-btn-detail" @click="openFeedingModal" :disabled="!canOperate">
              <span class="feed-btn-icon" style="font-size:20px;">✏️</span>
              <span class="feed-btn-text-sm">自定义</span>
            </button>
          </div>

          <!-- ── Sleep: Two buttons (睡了/醒了) ── -->
          <div class="glass action-group">
            <div class="action-group-header">
              <span class="action-group-label">💤 睡眠</span>
              <span v-if="isCurrentlySleeping" class="sleep-timer-badge">
                <span class="sleep-timer-dot"></span>
                {{ sleepDurationText }}
              </span>
            </div>

            <!-- Sleeping countdown bar -->
            <div v-if="isCurrentlySleeping" class="sleep-bar-track">
              <div class="sleep-bar-fill"></div>
            </div>

            <div class="sleep-btns">
              <button
                class="pill-btn pill-btn-sleep"
                @click="handleSleepStart"
                :disabled="!canOperate || isCurrentlySleeping"
              >💤 睡了</button>
              <button
                class="pill-btn pill-btn-wake"
                @click="handleWakeUp"
                :disabled="!canOperate || !isCurrentlySleeping"
              >☀️ 醒了</button>
            </div>
          </div>

          <!-- ── Diaper ── -->
          <div class="glass action-group">
            <div class="action-group-header">
              <span class="action-group-label">🧷 尿布</span>
              <span class="action-group-count">{{ todayStats.changes }}次</span>
            </div>
            <div class="diaper-btns">
              <button class="pill-btn pill-btn-wet" @click="handleQuickWet" :disabled="!canOperate">💦 尿了</button>
              <button class="pill-btn pill-btn-solid" @click="openSolidModal" :disabled="!canOperate">💩 拉臭了</button>
            </div>
          </div>

        </div>

        <!-- ========== RIGHT COLUMN — Data Dashboard ========== -->
        <div class="right-col">
          <!-- ── Prominent refresh button ── -->
          <button class="data-refresh-btn" @click="handleManualRefresh" :disabled="loading">
            <svg class="refresh-icon" :class="{ 'animate-spin': loading }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            <span>刷新数据</span>
          </button>

          <!-- ── Today total milk (hero) ── -->
          <div class="glass hero-stat" @click="goToDetail('feeding')">
            <div class="hero-stat-label">🥛 今日总奶量</div>
            <div class="hero-stat-value">{{ todayStats.feedingAmount }}<span class="hero-stat-unit">ml</span></div>
            <div class="hero-stat-sub">{{ todayStats.feedings }} 次喂奶 · 上次 {{ lastFeedingTime }}</div>
            <div v-if="lastFeedingElapsed" class="hero-stat-elapsed">{{ lastFeedingElapsed }}</div>
            <div v-if="todayStats.yesterdayMilk" class="hero-stat-yesterday">{{ todayStats.yesterdayMilk }}</div>
          </div>

          <!-- ── Sleep summary (hero style) ── -->
          <div class="glass hero-stat hero-stat-sleep" @click="goToDetail('sleep')">
            <div class="hero-stat-label">💤 今日睡眠</div>
            <div v-if="todayStats.sleepStatus" class="hero-stat-sleep-status">
              <span class="sleep-status-dot"></span>
              {{ todayStats.sleepStatus }}
              <span v-if="sleepDurationText" class="sleep-timer-inline">{{ sleepDurationText }}</span>
            </div>
            <div class="hero-stat-value hero-stat-value-sleep">今日已睡眠 {{ todayStats.sleepDuration }}</div>
            <div class="hero-stat-sub">{{ todayStats.sleepCount }} 次睡眠 · 上次 {{ lastSleepTime }}</div>
            <div v-if="todayStats.yesterdaySleep" class="hero-stat-yesterday">{{ todayStats.yesterdaySleep }}</div>
          </div>

          <!-- ── Last events: big cards with clear info ── -->
          <div class="last-events-grid">
            <!-- Last feeding -->
            <div class="glass last-event-card last-event-feeding" @click="goToDetail('feeding')">
              <div class="last-event-emoji">🍼</div>
              <div class="last-event-body">
                <div class="last-event-label">上次喂奶</div>
                <div class="last-event-main">{{ lastFeedingAmount }}</div>
                <div class="last-event-sub">{{ lastFeedingDetail }}</div>
              </div>
            </div>

            <!-- Last diaper -->
            <div class="glass last-event-card last-event-diaper" @click="goToDetail('change')">
              <div class="last-event-emoji">🧷</div>
              <div class="last-event-body">
                <div class="last-event-label">上次换尿布</div>
                <div class="last-event-main">{{ lastChangeInfo }}</div>
                <div class="last-event-sub">{{ lastChangeTime }}</div>
              </div>
            </div>

            <!-- Last sleep -->
            <div class="glass last-event-card last-event-sleep" @click="goToDetail('sleep')">
              <div class="last-event-emoji">💤</div>
              <div class="last-event-body">
                <div class="last-event-label">上次睡眠</div>
                <div class="last-event-main">{{ lastCompletedSleepInfo }}</div>
                <div class="last-event-sub">{{ lastSleepTime }}</div>
              </div>
            </div>
          </div>

          <!-- ── Measurement cards: redesigned big tiles ── -->
          <div class="measure-tiles">
            <div class="glass measure-tile" @click="goToDetail('height')">
              <div class="measure-tile-top">
                <span class="measure-tile-emoji">📏</span>
                <span class="measure-tile-label">身高</span>
              </div>
              <div class="measure-tile-value">{{ todayStats.latestHeight }}</div>
              <div v-if="todayStats.heightDate" class="measure-tile-date">{{ todayStats.heightDate }}</div>
            </div>
            <div class="glass measure-tile" @click="goToDetail('weight')">
              <div class="measure-tile-top">
                <span class="measure-tile-emoji">⚖️</span>
                <span class="measure-tile-label">体重</span>
              </div>
              <div class="measure-tile-value">{{ todayStats.latestWeight }}</div>
              <div v-if="todayStats.weightDate" class="measure-tile-date">{{ todayStats.weightDate }}</div>
            </div>
            <div class="glass measure-tile" @click="goToDetail('temperature')">
              <div class="measure-tile-top">
                <span class="measure-tile-emoji">🌡️</span>
                <span class="measure-tile-label">体温</span>
              </div>
              <div class="measure-tile-value">{{ todayStats.latestTemp }}</div>
              <div v-if="todayStats.tempDate" class="measure-tile-date">{{ todayStats.tempDate }}</div>
            </div>
            <div class="glass measure-tile" @click="goToDetail('head')">
              <div class="measure-tile-top">
                <span class="measure-tile-emoji">🧢</span>
                <span class="measure-tile-label">头围</span>
              </div>
              <div class="measure-tile-value">{{ todayStats.latestHead }}</div>
              <div v-if="todayStats.headDate" class="measure-tile-date">{{ todayStats.headDate }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ========== SCREEN 2: Today's Detail Timeline ========== -->
      <div class="detail-section">
        <div class="detail-header">
          <h3 class="detail-title">📋 今日明细</h3>
          <button class="detail-refresh-btn" @click="loadTodayData" :disabled="loading">
            <svg class="w-4 h-4" :class="{ 'animate-spin': loading }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
        </div>

        <div v-if="todayTimeline.length === 0" class="detail-empty">
          <span class="text-4xl">📝</span>
          <p class="text-gray-400 text-sm mt-2">今天还没有记录</p>
        </div>

        <div v-else class="timeline-list">
          <div
            v-for="(item, idx) in todayTimeline"
            :key="item.id + '-' + item.type + '-' + idx"
            class="timeline-item"
            :class="{ 'timeline-item-ongoing': item.isOngoing }"
          >
            <div class="timeline-item-left">
              <span class="timeline-emoji">{{ item.emoji }}</span>
              <div class="timeline-time">{{ item.timeStr }}</div>
            </div>
            <div class="timeline-item-content">
              <div class="timeline-title">{{ item.title }}</div>
              <div v-if="item.detail" class="timeline-detail">{{ item.detail }}</div>
            </div>
            <button class="timeline-delete" @click="handleDeleteItem(item)" :disabled="!settingsStore.isAdminAuthenticated" title="删除记录">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- Time Picker Modal (for sleep start/end) -->
    <div v-if="showTimePicker" class="time-picker-overlay" @click.self="cancelTimePicker">
      <div class="time-picker-panel">
        <h3 class="time-picker-title">{{ timePickerMode === 'sleep' ? '💤 宝宝什么时候睡的？' : '☀️ 宝宝什么时候醒的？' }}</h3>
        <input
          ref="timePickerInput"
          v-model="timePickerValue"
          type="datetime-local"
          class="time-picker-input"
        />
        <div class="time-picker-btns">
          <button class="time-picker-btn time-picker-btn-cancel" @click="cancelTimePicker">取消</button>
          <button class="time-picker-btn time-picker-btn-confirm" @click="confirmTimePicker">确认</button>
        </div>
      </div>
    </div>

    <!-- Solid Diaper Quick Modal -->
    <div v-if="showSolidModal" class="time-picker-overlay" @click.self="showSolidModal = false">
      <div class="time-picker-panel solid-modal-panel">
        <h3 class="solid-modal-title">💩 拉臭了</h3>

        <!-- Color selection -->
        <div class="solid-section">
          <div class="solid-section-label">颜色</div>
          <div class="solid-color-grid">
            <button
              v-for="color in solidColorOptions"
              :key="color.value"
              @click="solidForm.color = solidForm.color === color.value ? '' : color.value"
              class="solid-color-btn"
              :class="{ 'solid-color-active': solidForm.color === color.value }"
            >
              <span class="solid-color-emoji">{{ color.emoji }}</span>
              <span class="solid-color-label">{{ color.label }}</span>
            </button>
          </div>
        </div>

        <!-- Time -->
        <div class="solid-section">
          <div class="solid-section-label">时间</div>
          <input
            v-model="solidForm.time"
            type="datetime-local"
            class="solid-time-input"
          />
        </div>

        <!-- Actions -->
        <div class="solid-btns">
          <button class="solid-btn solid-btn-cancel" @click="showSolidModal = false">取消</button>
          <button class="solid-btn solid-btn-confirm" @click="submitSolid" :disabled="solidSubmitting">
            {{ solidSubmitting ? '保存中...' : '确认' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch, onUnmounted, defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
import { inject } from 'vue'
import { useChildStore } from '../stores/childStore'
import { useSettingsStore } from '../stores/settingsStore'
import {
  fetchFeedings, fetchChanges, fetchSleep,
  fetchHeight, fetchWeight, fetchTemperature, fetchHeadCircumference,
  createFeeding, createChange, createSleep,
  createTummyTime, updateSleep,
  deleteFeeding, deleteChange, deleteSleep,
  deleteTummyTime
} from '../api/babybuddy'

const router = useRouter()
const childStore = useChildStore()
const settingsStore = useSettingsStore()
const showToast = inject('showToast')
const openModal = inject('openModal')

const child = computed(() => childStore.currentChild)

// Use LOCAL date (not UTC) — critical for Chinese timezone (UTC+8)
function getLocalDateString(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
const today = computed(() => getLocalDateString())
const yesterday = computed(() => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return getLocalDateString(d)
})
const canOperate = computed(() => child.value && settingsStore.isAdminAuthenticated)

// Baby name display: Chinese order (family name first), support custom override
const displayName = computed(() => {
  if (!child.value) return ''
  // Use custom display name if set
  if (childStore.getDisplayName(child.value.id)) {
    return childStore.getDisplayName(child.value.id)
  }
  return `${child.value.last_name || ''}${child.value.first_name || ''}`
})

// --- Data ---
const feedings = ref([])
const changes = ref([])
const sleeps = ref([])
const heights = ref([])
const weights = ref([])
const temperatures = ref([])
const heads = ref([])
const loading = ref(false)

// Yesterday data for comparison
const yesterdayFeedings = ref([])
const yesterdaySleeps = ref([])

// Recent records (not limited by today's date) for "上次" display
const recentFeeding = ref(null)
const recentChange = ref(null)
const recentSleep = ref(null)

// --- Time picker for sleep ---
const showTimePicker = ref(false)
const timePickerValue = ref('')
const timePickerMode = ref('sleep') // 'sleep' or 'wake'
const timePickerInput = ref(null)

// --- Quick feed cooldown (based on actual last feeding record, not limited by date) ---
const QUICK_FEED_COOLDOWN_MS = 30 * 60 * 1000 // 30 minutes

const quickFeedCooldown = computed(() => {
  // Use recentFeeding (no date filter) so cooldown works across midnight
  const lastFeeding = recentFeeding.value || (feedings.value.length > 0 ? feedings.value[0] : null)
  if (!lastFeeding || !lastFeeding.start) return false
  const lastStart = new Date(lastFeeding.start).getTime()
  return (Date.now() - lastStart) < QUICK_FEED_COOLDOWN_MS
})

const quickFeedRemainingMin = computed(() => {
  const lastFeeding = recentFeeding.value || (feedings.value.length > 0 ? feedings.value[0] : null)
  if (!lastFeeding || !lastFeeding.start) return 0
  const lastStart = new Date(lastFeeding.start).getTime()
  const remaining = QUICK_FEED_COOLDOWN_MS - (Date.now() - lastStart)
  return Math.max(0, Math.ceil(remaining / 60000))
})

// --- Sleep state (checks both app state and server-side state) ---
const isCurrentlySleeping = computed(() => {
  // Primary: app-level sleep tracking
  if (settingsStore.isSleeping()) return true
  // Fallback: check the most recent sleep record on the server
  // If it has no end time, baby is still sleeping (may have been started on another device)
  if (recentSleep.value && !recentSleep.value.end) return true
  return false
})

// Sleep duration timer (live update)
const sleepNow = ref(new Date())
let sleepTimer = null

// Feeding elapsed timer (live update for "距离上次喂奶")
const feedingNow = ref(new Date())
let feedingTimer = null

function startSleepTick() {
  if (sleepTimer) clearInterval(sleepTimer)
  sleepTimer = setInterval(() => { sleepNow.value = new Date() }, 1000)
}
function stopSleepTick() {
  if (sleepTimer) { clearInterval(sleepTimer); sleepTimer = null }
}
function startFeedingTick() {
  if (feedingTimer) clearInterval(feedingTimer)
  feedingTimer = setInterval(() => { feedingNow.value = new Date() }, 1000)
}
function stopFeedingTick() {
  if (feedingTimer) { clearInterval(feedingTimer); feedingTimer = null }
}

// --- Today stats ---
const yesterdayStats = computed(() => {
  const totalFeedAmount = yesterdayFeedings.value.reduce((sum, f) => sum + (f.amount || 0), 0)
  // For yesterday's sleep, we need to consider sleeps that started yesterday and may cross midnight
  // Merge yesterday's + today's + recent sleep records to catch cross-midnight sleeps
  const allRelevantSleeps = [...sleeps.value, ...yesterdaySleeps.value]
  const yesterdaySleepMin = calcSleepMinutesForDate(allRelevantSleeps, yesterday.value)
  return {
    feedings: yesterdayFeedings.value.length,
    feedingAmount: Math.round(totalFeedAmount),
    sleepDuration: formatSleepMinutes(yesterdaySleepMin),
  }
})

const todayStats = computed(() => {
  const totalFeedAmount = feedings.value.reduce((sum, f) => sum + (f.amount || 0), 0)
  const wetCount = changes.value.filter(c => c.wet).length
  const solidCount = changes.value.filter(c => c.solid).length
  // Today's sleep: consider today's + yesterday's sleeps (may cross midnight)
  const allRelevantSleeps = [...sleeps.value, ...yesterdaySleeps.value]
  // Include ongoing sleep in duration calculation when currently sleeping
  const todaySleepMin = calcSleepMinutesForDate(allRelevantSleeps, today.value, isCurrentlySleeping.value)

  // Measurement data — show latest regardless of date (not cleared at midnight)
  const latestHeight = heights.value.length > 0 ? heights.value[0] : null
  const latestWeight = weights.value.length > 0 ? weights.value[0] : null
  const latestTemp = temperatures.value.length > 0 ? temperatures.value[0] : null
  const latestHead = heads.value.length > 0 ? heads.value[0] : null

  return {
    feedings: feedings.value.length,
    feedingAmount: Math.round(totalFeedAmount),
    changes: changes.value.length,
    wetCount,
    solidCount,
    sleepCount: sleeps.value.filter(s => s.end).length,
    sleepDuration: formatSleepMinutes(todaySleepMin),
    sleepStatus: isCurrentlySleeping.value ? '正在睡眠' : '',
    yesterdayMilk: yesterdayStats.value.feedingAmount > 0 ? `昨日 ${yesterdayStats.value.feedingAmount}ml` : '',
    yesterdaySleep: yesterdayStats.value.sleepDuration !== '无记录' ? `昨日 ${yesterdayStats.value.sleepDuration}` : '',
    latestHeight: latestHeight ? `${latestHeight.height}cm` : '--',
    latestWeight: latestWeight ? `${latestWeight.weight}kg` : '--',
    latestTemp: latestTemp ? `${latestTemp.temperature}°C` : '--',
    latestHead: latestHead ? `${latestHead.head_circumference}cm` : '--',
    heightDate: latestHeight ? formatMeasureDate(latestHeight.date) : '',
    weightDate: latestWeight ? formatMeasureDate(latestWeight.date) : '',
    tempDate: latestTemp ? formatMeasureDate(latestTemp.time) : '',
    headDate: latestHead ? formatMeasureDate(latestHead.date) : ''
  }
})

// --- Last event computeds ---
const lastFeedingText = computed(() => {
  const f = recentFeeding.value || (feedings.value.length > 0 ? feedings.value[0] : null)
  if (!f) return '暂无记录'
  const type = getTypeLabel(f.type)
  return `${type} ${f.amount || ''}${f.amount ? 'ml' : ''}`
})

const quickFeedHint = computed(() => {
  if (quickFeedCooldown.value) return `${quickFeedRemainingMin.value}分钟后可再喂`
  // Use recentFeeding (no date filter) so hint works across midnight
  const last = recentFeeding.value || (feedings.value.length > 0 ? feedings.value[0] : null)
  if (!last) return '无上次记录'
  const type = getTypeLabel(last.type)
  return `${type} ${last.amount || ''}${last.amount ? 'ml' : ''}`
})

const lastFeedingTime = computed(() => {
  // Use recent record (not limited by today's date)
  if (recentFeeding.value) return formatTime(recentFeeding.value.start)
  if (feedings.value.length > 0) return formatTime(feedings.value[0].start)
  return '--'
})

const lastFeedingAmount = computed(() => {
  const f = recentFeeding.value || (feedings.value.length > 0 ? feedings.value[0] : null)
  if (!f) return '--'
  return f.amount ? `${f.amount}ml` : '--'
})

const lastFeedingDetail = computed(() => {
  const f = recentFeeding.value || (feedings.value.length > 0 ? feedings.value[0] : null)
  if (!f) return '暂无记录'
  return `${getTypeLabel(f.type)} · ${formatTime(f.start)}`
})

// Elapsed time since last feeding (live-updated)
const lastFeedingElapsed = computed(() => {
  const f = recentFeeding.value || (feedings.value.length > 0 ? feedings.value[0] : null)
  if (!f || !f.start) return ''
  const lastStart = new Date(f.start).getTime()
  const now = feedingNow.value.getTime()
  const diffMs = now - lastStart
  if (diffMs < 0) return ''
  const totalMin = Math.floor(diffMs / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `距上次 ${h}时${m}分`
  if (m > 0) return `距上次 ${m}分钟`
  return '刚刚喂过'
})

const lastChangeInfo = computed(() => {
  const c = recentChange.value || (changes.value.length > 0 ? changes.value[0] : null)
  if (!c) return '--'
  const types = []
  if (c.wet) types.push('湿')
  if (c.solid) types.push('屎')
  return types.length > 0 ? types.join('+') : '--'
})

const lastChangeTime = computed(() => {
  const c = recentChange.value || (changes.value.length > 0 ? changes.value[0] : null)
  if (!c) return '--'
  return formatTime(c.date || c.time)
})

const lastSleepInfo = computed(() => {
  if (isCurrentlySleeping.value) {
    // Show duration of ongoing sleep
    const s = recentSleep.value || (sleeps.value.length > 0 ? sleeps.value[0] : null)
    if (s && s.start) {
      return '正在睡觉... · ' + formatTime(s.start) + '开始'
    }
    return '正在睡觉...'
  }
  // Use recent sleep record (not limited by today's date)
  const s = recentSleep.value || (sleeps.value.length > 0 ? sleeps.value[0] : null)
  if (!s) return '--'
  return s.end ? formatDuration(s.start, s.end) : '进行中'
})

// "上次睡眠" card shows the last COMPLETED sleep when currently sleeping,
// or the most recent sleep (completed or not) otherwise
const lastCompletedSleepInfo = computed(() => {
  if (!isCurrentlySleeping.value) {
    // Not sleeping — show the most recent sleep record as-is
    return lastSleepInfo.value
  }
  // Currently sleeping — find the last completed sleep (not the ongoing one)
  // Search in sleeps (today's) first, then in recentSleep
  const completedSleeps = sleeps.value.filter(s => s.end)
  if (completedSleeps.length > 0) {
    const s = completedSleeps[0] // Most recent completed sleep (sorted by API)
    return formatDuration(s.start, s.end)
  }
  return '无上次记录'
})

const lastSleepTime = computed(() => {
  const s = recentSleep.value || (sleeps.value.length > 0 ? sleeps.value[0] : null)
  if (!s) return '--'
  return formatTime(s.start)
})

// --- Today timeline (for Screen 2) ---
const todayTimeline = computed(() => {
  const items = []

  // Feedings
  feedings.value.forEach(f => {
    items.push({
      id: f.id,
      type: 'feeding',
      emoji: '🍼',
      time: new Date(f.start),
      timeStr: formatTime(f.start),
      title: `喂奶 - ${getTypeLabel(f.type)}`,
      detail: f.amount ? `${f.amount}ml` : undefined,
      deleteFn: () => deleteFeeding(f.id)
    })
  })

  // Sleep
  sleeps.value.forEach(s => {
    const isOngoing = !s.end
    items.push({
      id: s.id,
      type: 'sleep',
      emoji: '💤',
      time: new Date(s.start),
      timeStr: formatTime(s.start),
      title: isOngoing ? '睡眠中 💤' : '睡眠（已结束）',
      detail: liveSleepDuration(s),
      isOngoing,
      deleteFn: () => deleteSleep(s.id)
    })
  })

  // Changes (diaper)
  changes.value.forEach(c => {
    const types = []
    if (c.wet) types.push('湿')
    if (c.solid) types.push('屎')
    items.push({
      id: c.id,
      type: 'change',
      emoji: '🧷',
      time: new Date(c.date || c.time),
      timeStr: formatTime(c.date || c.time),
      title: `换尿布 - ${types.join('+') || '未知'}`,
      detail: undefined,
      deleteFn: () => deleteChange(c.id)
    })
  })

  // Sort by time descending (newest first)
  items.sort((a, b) => b.time - a.time)
  return items
})

// --- Age ---
const ageText = computed(() => {
  if (!child.value?.birth_date) return ''
  const birth = new Date(child.value.birth_date)
  const now = new Date()
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth())
  const days = now.getDate() - birth.getDate()
  if (months < 1) return `${Math.abs(days)}天`
  if (months < 12) return `${months}个月${Math.abs(days)}天`
  const years = Math.floor(months / 12)
  const remMonths = months % 12
  return `${years}岁${remMonths}个月`
})

// --- Sleep duration ---
const sleepDurationText = computed(() => {
  let startTime = settingsStore.sleepStartTime
  // Fallback: if no app-level tracking but server shows ongoing sleep
  if (!startTime && recentSleep.value && !recentSleep.value.end) {
    startTime = recentSleep.value.start
  }
  if (!startTime) return ''
  const start = new Date(startTime)
  const now = sleepNow.value  // Use reactive ref for live updates
  const diff = now - start
  if (diff < 0) return '0:00:00'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

// Live sleep duration text for timeline items (data-driven, works across devices)
function liveSleepDuration(sleepRecord) {
  if (sleepRecord.end) return formatDuration(sleepRecord.start, sleepRecord.end)
  // Ongoing sleep — calculate from data
  const start = new Date(sleepRecord.start)
  const now = sleepNow.value
  const diff = now - start
  if (diff < 0) return '0分'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}时${m}分` : `${m}分`
}

// --- Helpers ---
function getTypeLabel(type) {
  const map = { 'breast milk': '母乳', 'formula': '配方奶', 'fortified breast milk': '强化母乳', 'solid food': '辅食' }
  return map[type] || type || '喂奶'
}

function formatTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function formatDuration(start, end) {
  const diff = new Date(end) - new Date(start)
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}时${m}分` : `${m}分`
}

/**
 * Calculate total sleep minutes for a given LOCAL date string (e.g., "2026-06-05").
 * Handles midnight crossover: if a sleep starts before midnight and ends after,
 * only the portion within the target date is counted.
 *
 * @param {Array} sleepRecords - All relevant sleep records (may span multiple days)
 * @param {string} dateStr - The local date to calculate for (YYYY-MM-DD)
 * @returns {number} Total sleep minutes on that date
 */
function calcSleepMinutesForDate(sleepRecords, dateStr, includeOngoing = false) {
  const dayStart = new Date(`${dateStr}T00:00:00`)
  const dayEnd = new Date(`${dateStr}T23:59:59.999`)
  const now = new Date()
  let totalMin = 0

  for (const s of sleepRecords) {
    if (!s.end && !includeOngoing) continue // ongoing sleep, skip unless explicitly included
    const sStart = new Date(s.start)
    const sEnd = s.end ? new Date(s.end) : (includeOngoing ? now : null)
    if (!sEnd) continue

    // No overlap with this date
    if (sEnd <= dayStart || sStart > dayEnd) continue

    // Calculate the overlap between [sStart, sEnd] and [dayStart, dayEnd]
    const overlapStart = sStart < dayStart ? dayStart : sStart
    const overlapEnd = sEnd > dayEnd ? dayEnd : sEnd
    const overlapMin = (overlapEnd - overlapStart) / 60000
    if (overlapMin > 0) totalMin += overlapMin
  }

  return totalMin
}

function formatSleepMinutes(min) {
  if (min <= 0) return '无记录'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}时${m}分` : `${m}分`
}

/**
 * Format measurement date for display.
 * Shows "今天 HH:mm", "昨天 HH:mm", "M/D HH:mm", or "YYYY/M/D HH:mm"
 * Measurement data is NOT limited by today — shows the latest regardless of date.
 */
function formatMeasureDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr

  const now = new Date()
  const localToday = getLocalDateString(now)
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const localYesterday = getLocalDateString(yesterday)

  const measureDate = getLocalDateString(d)
  const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`

  if (measureDate === localToday) return `今天 ${time}`
  if (measureDate === localYesterday) return `昨天 ${time}`
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()} ${time}`
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${time}`
}

// --- Load data ---
// Dedup guard: prevent concurrent loadTodayData calls (race condition causes data jitter)
let _loadPromise = null

async function loadTodayData() {
  if (!child.value) return
  if (_loadPromise) return _loadPromise // Reuse in-flight request
  _loadPromise = _doLoadTodayData()
  try {
    return await _loadPromise
  } finally {
    _loadPromise = null
  }
}

async function _doLoadTodayData() {
  loading.value = true
  try {
    const cid = child.value.id
    const [f, c, s, h, w, t, hc, yf, ys, rf, rc, rs] = await Promise.allSettled([
      fetchFeedings(cid, today.value),
      fetchChanges(cid, today.value),
      fetchSleep(cid, today.value),
      fetchHeight(cid),
      fetchWeight(cid),
      fetchTemperature(cid),
      fetchHeadCircumference(cid),
      fetchFeedings(cid, yesterday.value),
      fetchSleep(cid, yesterday.value),
      // Recent records (no date filter, limit=1) for "上次" display
      fetchFeedings(cid, null),
      fetchChanges(cid, null),
      fetchSleep(cid, null),
    ])
    if (f.status === 'fulfilled') {
      feedings.value = f.value
      console.log(`[Dashboard] Today feedings loaded: ${f.value.length} records for ${today.value}`)
      if (f.value.length > 0) {
        console.log(`[Dashboard] Feeding details:`, f.value.map(x => `${x.start} amount=${x.amount} type=${x.type}`).join(' | '))
      }
    }
    if (c.status === 'fulfilled') changes.value = c.value
    if (s.status === 'fulfilled') sleeps.value = s.value
    if (h.status === 'fulfilled') heights.value = h.value
    if (w.status === 'fulfilled') weights.value = w.value
    if (t.status === 'fulfilled') temperatures.value = t.value
    if (hc.status === 'fulfilled') heads.value = hc.value
    if (yf.status === 'fulfilled') yesterdayFeedings.value = yf.value
    if (ys.status === 'fulfilled') yesterdaySleeps.value = ys.value
    // Recent records: only keep the first one
    if (rf.status === 'fulfilled') recentFeeding.value = rf.value[0] || null
    if (rc.status === 'fulfilled') recentChange.value = rc.value[0] || null
    if (rs.status === 'fulfilled') recentSleep.value = rs.value[0] || null

    // After loading data, check if we need to start/stop sleep timer (cross-device sync)
    if (isCurrentlySleeping.value) {
      if (!settingsStore.activeSleepId && recentSleep.value && !recentSleep.value.end) {
        // Server has ongoing sleep but app doesn't know — take over tracking
        settingsStore.startSleepTracking(recentSleep.value.id)
      }
      if (!sleepTimer) startSleepTick()
    } else {
      if (sleepTimer) stopSleepTick()
    }
  } catch (e) {
    console.error('Failed to load data:', e)
  } finally {
    loading.value = false
  }
}

function goToDetail(type) {
  router.push(`/dashboard/${type}`)
}

// --- Quick feed (one-click, uses last feeding data) ---
async function handleQuickFeed() {
  if (!child.value) {
    showToast('宝宝信息未加载，请检查网络连接', 'error')
    return
  }
  if (!settingsStore.isAdminAuthenticated) {
    toggleAdminLock()
    return
  }

  // Use recentFeeding (no date filter) so quick feed works across midnight
  const lastFeeding = recentFeeding.value || (feedings.value.length > 0 ? feedings.value[0] : null)
  if (quickFeedCooldown.value || !lastFeeding) {
    if (!lastFeeding) {
      showToast('还没有喂奶记录，请用自定义按钮', 'error')
    }
    return
  }

  try {
    const now = new Date()
    const endISO = new Date(now.getTime() + 20 * 60000).toISOString()
    const payload = {
      child: child.value.id,
      type: lastFeeding.type,
      start: now.toISOString(),
      end: endISO
    }
    // Only include optional fields if they have valid values
    if (lastFeeding.method) payload.method = lastFeeding.method
    if (lastFeeding.amount) payload.amount = lastFeeding.amount

    console.log('[QuickFeed] Creating:', JSON.stringify(payload))
    const result = await createFeeding(payload)
    console.log('[QuickFeed] Created feeding:', result?.id, 'amount:', lastFeeding.amount)
    showToast(`快速喂奶已记录: ${getTypeLabel(lastFeeding.type)} ${lastFeeding.amount || ''}ml`)
    await loadTodayData()
  } catch (e) {
    console.error('[QuickFeed] Error:', e.response?.data || e.message)
    showToast('快速喂奶失败: ' + (e.response?.data?.detail || e.message), 'error')
  }
}

// --- Time picker helpers ---
function openTimePicker(mode) {
  timePickerMode.value = mode
  const now = new Date()
  // Format for datetime-local: YYYY-MM-DDTHH:mm
  const pad = (n) => String(n).padStart(2, '0')
  timePickerValue.value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
  showTimePicker.value = true
}

function cancelTimePicker() {
  showTimePicker.value = false
}

async function confirmTimePicker() {
  if (!timePickerValue.value) {
    showToast('请选择时间', 'error')
    return
  }
  const selectedTime = new Date(timePickerValue.value).toISOString()
  showTimePicker.value = false

  if (timePickerMode.value === 'sleep') {
    await doSleepStart(selectedTime)
  } else {
    await doWakeUp(selectedTime)
  }
}

// --- Sleep start / end ---
async function handleSleepStart() {
  if (!child.value) {
    showToast('宝宝信息未加载，请检查网络连接', 'error')
    return
  }
  if (!settingsStore.isAdminAuthenticated) {
    toggleAdminLock()
    return
  }
  openTimePicker('sleep')
}

async function doSleepStart(startTime) {
  try {
    // BabyBuddy requires 'end' field, so set end = start initially (0 min duration)
    const record = await createSleep({
      child: child.value.id,
      start: startTime,
      end: startTime
    })
    settingsStore.startSleepTracking(record.id)
    startSleepTick()
    showToast('宝宝睡着了 💤')
    await loadTodayData()
  } catch (e) {
    console.error('[Sleep] Start error details:', e.response?.data || e.response?.statusText || e)
    const detail = e.response?.data
    let msg = '操作失败'
    if (detail) {
      if (typeof detail === 'object' && !Array.isArray(detail)) {
        const firstField = Object.keys(detail)[0]
        const firstError = Array.isArray(detail[firstField]) ? detail[firstField][0] : detail[firstField]
        msg = `操作失败: ${firstField} - ${firstError}`
      } else {
        msg = `操作失败: ${JSON.stringify(detail).substring(0, 200)}`
      }
    } else {
      msg = `操作失败: ${e.message}`
    }
    showToast(msg, 'error')
  }
}

async function handleWakeUp() {
  if (!isCurrentlySleeping.value) return
  if (!settingsStore.isAdminAuthenticated) {
    toggleAdminLock()
    return
  }

  // If app has an active sleep ID, use it
  if (settingsStore.activeSleepId) {
    openTimePicker('wake')
    return
  }

  // If no app-level tracking but server shows ongoing sleep, use the server record's ID
  if (recentSleep.value && !recentSleep.value.end && recentSleep.value.id) {
    // Take over the ongoing sleep from the server
    settingsStore.startSleepTracking(recentSleep.value.id)
    openTimePicker('wake')
    return
  }

  showToast('没有找到进行中的睡眠记录', 'error')
}

async function doWakeUp(endTime) {
  try {
    await updateSleep(settingsStore.activeSleepId, {
      end: endTime
    })
    settingsStore.stopSleepTracking()
    stopSleepTick()
    showToast('宝宝起床了 ☀️')
    await loadTodayData()
  } catch (e) {
    showToast('操作失败: ' + e.message, 'error')
  }
}

// --- Delete item from timeline ---
async function handleDeleteItem(item) {
  if (!settingsStore.isAdminAuthenticated) {
    toggleAdminLock()
    return
  }
  const typeNames = {
    feeding: '喂奶记录',
    sleep: '睡眠记录',
    change: '换尿布记录'
  }
  const typeName = typeNames[item.type] || '记录'

  if (!confirm(`确定要删除这条${typeName}吗？\n${item.timeStr} ${item.title}`)) {
    return
  }

  try {
    await item.deleteFn()
    showToast(`${typeName}已删除`)
    await loadTodayData()
  } catch (e) {
    showToast('删除失败: ' + e.message, 'error')
  }
}

// --- Modals ---
function openFeedingModal() {
  const FeedingModal = defineAsyncComponent(() => import('../components/FeedingModal.vue'))
  const lastFeeding = recentFeeding.value || (feedings.value.length > 0 ? feedings.value[0] : null)
  openModal(FeedingModal, { childId: child.value.id, lastFeeding }).then(() => loadTodayData())
}

function openChangeModal(type) {
  const ChangeModal = defineAsyncComponent(() => import('../components/ChangeModal.vue'))
  openModal(ChangeModal, { childId: child.value.id, defaultType: type }).then(() => loadTodayData())
}

// ── Quick wet: one-click, no confirmation ──
async function handleQuickWet() {
  if (!child.value) {
    showToast('宝宝信息未加载，请检查网络连接', 'error')
    return
  }
  if (!settingsStore.isAdminAuthenticated) {
    toggleAdminLock()
    return
  }
  try {
    await createChange({
      child: child.value.id,
      wet: true,
      solid: false,
      time: new Date().toISOString()
    })
    showToast('尿布已记录 💦')
    await loadTodayData()
  } catch (e) {
    showToast('记录失败: ' + e.message, 'error')
  }
}

// ── Solid diaper modal ──
const showSolidModal = ref(false)
const solidSubmitting = ref(false)
const solidColorOptions = [
  { value: 'black', label: '黑色', emoji: '⚫' },
  { value: 'brown', label: '棕色', emoji: '🟤' },
  { value: 'green', label: '绿色', emoji: '🟢' },
  { value: 'yellow', label: '黄色', emoji: '🟡' }
]
const solidForm = reactive({
  color: '',
  time: ''
})

function openSolidModal() {
  if (!child.value) {
    showToast('宝宝信息未加载，请检查网络连接', 'error')
    return
  }
  if (!settingsStore.isAdminAuthenticated) {
    toggleAdminLock()
    return
  }
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  solidForm.time = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
  solidForm.color = ''
  showSolidModal.value = true
}

async function submitSolid() {
  solidSubmitting.value = true
  try {
    await createChange({
      child: child.value.id,
      wet: false,
      solid: true,
      color: solidForm.color || undefined,
      time: new Date(solidForm.time).toISOString()
    })
    showToast('拉臭已记录 💩')
    showSolidModal.value = false
    await loadTodayData()
  } catch (e) {
    showToast('记录失败: ' + e.message, 'error')
  } finally {
    solidSubmitting.value = false
  }
}

function openTummyTimeModal() {
  const MeasurementModal = defineAsyncComponent(() => import('../components/MeasurementModal.vue'))
  openModal(MeasurementModal, { childId: child.value.id, type: 'tummy-time' }).then(() => loadTodayData())
}

// --- Admin lock/unlock toggle ---
function toggleAdminLock() {
  if (settingsStore.isAdminAuthenticated) {
    // Already unlocked → lock it
    settingsStore.lockAdmin()
    showToast('已锁定 🔒')
    return
  }
  // Locked → prompt for password to unlock
  const password = prompt('请输入管理员密码:')
  if (password === null) return  // cancelled
  if (settingsStore.verifyAdmin(password)) {
    showToast('已解锁 🔓')
  } else {
    showToast('密码错误', 'error')
  }
}

// --- Edit baby name ---
function showEditName() {
  if (!child.value) return
  const currentName = displayName.value
  const newName = prompt('修改宝宝名字:', currentName)
  if (newName === null || newName === currentName) return
  if (newName.trim().length === 0) {
    showToast('名字不能为空', 'error')
    return
  }
  // Save locally in the store (not synced to server, just display override)
  childStore.setDisplayName(child.value.id, newName.trim())
  showToast(`名字已修改为「${newName.trim()}」`)
}

// --- Manual refresh (no auto-sync, prevents data jitter) ---
async function handleManualRefresh() {
  if (loading.value) return
  showToast('正在刷新数据...')
  await loadTodayData()
  showToast('数据已刷新')
}

// --- Auto sync disabled (removed to prevent data jitter) ---
// --- Lifecycle ---
onMounted(async () => {
  if (settingsStore.isConfigured()) {
    await childStore.loadChildren()
    if (child.value) {
      await loadTodayData()
      // Start sleep timer if currently sleeping (app-level or server-level)
      if (isCurrentlySleeping.value) {
        // If server shows ongoing sleep but app doesn't track it, take over
        if (!settingsStore.activeSleepId && recentSleep.value && !recentSleep.value.end) {
          settingsStore.startSleepTracking(recentSleep.value.id)
        }
        startSleepTick()
      }
      // Start feeding elapsed timer (always running)
      startFeedingTick()
    }
  }
})

onUnmounted(() => {
  stopSleepTick()
  stopFeedingTick()
})

watch(() => childStore.currentChildId, () => {
  if (child.value) loadTodayData()
})
</script>

<style scoped>
/* ──────────── Variables ──────────── */
:root {
  --peach: #E8A87C;
  --warm-orange: #F2C078;
  --soft-blue: #95C8D8;
  --bg-start: #FDF6F0;
  --bg-end: #F0E6FF;
  --glass-bg: rgba(255, 255, 255, 0.55);
  --glass-border: rgba(255, 255, 255, 0.6);
  --glass-shadow: 0 2px 16px rgba(0, 0, 0, 0.04);
}

/* ──────────── Lock toggle in hero ──────────── */
.baby-hero-lock {
  margin-left: auto;
  width: 40px; height: 40px;
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all 0.25s;
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
  flex-shrink: 0;
}
.baby-hero-lock:hover {
  background: rgba(16, 185, 129, 0.18);
  transform: scale(1.08);
}
.baby-hero-lock:active {
  transform: scale(0.95);
}
.baby-hero-lock-locked {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}
.baby-hero-lock-locked:hover {
  background: rgba(245, 158, 11, 0.2);
}
.lock-icon {
  width: 20px; height: 20px;
}

/* ──────────── Root ──────────── */
.dashboard-root {
  min-height: 100vh;
  background: linear-gradient(135deg, var(--bg-start) 0%, var(--bg-end) 100%);
  padding: 16px;
  padding-bottom: calc(16px + 72px); /* Extra bottom padding for mobile bottom nav */
}

/* Reduce padding on small screens */
@media (max-width: 480px) {
  .dashboard-root {
    padding: 10px;
    padding-bottom: calc(10px + 72px);
  }
}

/* ──────────── Glass card ──────────── */
.glass {
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  box-shadow: var(--glass-shadow);
}

/* ──────────── Unconfigured ──────────── */
.unconfigured {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  gap: 16px;
}
.unconfigured-icon {
  width: 80px; height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, #fce4d6 0%, #e8d5f5 100%);
  display: flex; align-items: center; justify-content: center;
}
.unconfigured-icon svg {
  width: 40px; height: 40px;
  color: var(--peach);
}
.unconfigured-text {
  color: #9ca3af;
  font-size: 14px;
  text-align: center;
}

.action-btn {
  padding: 10px 28px;
  border-radius: 14px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}
.action-btn-primary {
  background: linear-gradient(135deg, var(--peach), var(--warm-orange));
  color: #fff;
  box-shadow: 0 4px 14px rgba(232, 168, 124, 0.35);
}
.action-btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(232, 168, 124, 0.45);
}

/* ──────────── Grid layout (2:3 ratio) ──────────── */
.dashboard-grid {
  display: grid;
  grid-template-columns: 2fr 3fr;
  gap: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

/* Responsive: portrait / narrow screens → single column */
@media (max-width: 900px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}

/* Small screens: tighter spacing */
@media (max-width: 480px) {
  .dashboard-grid {
    gap: 12px;
  }
}

/* ──────────── Left Column ──────────── */
.left-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-self: start;
}

/* Sticky only on wider screens */
@media (min-width: 1024px) {
  .left-col {
    position: sticky;
    top: 16px;
  }
}

/* Baby hero */
.baby-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
}
.baby-hero-avatar {
  width: 56px; height: 56px;
  border-radius: 18px;
  background: linear-gradient(135deg, #93c5fd, #60a5fa);
  display: flex; align-items: center; justify-content: center;
  font-size: 24px;
  color: #fff;
  font-weight: 700;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35);
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  position: relative;
}
.baby-hero-avatar:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 18px rgba(59, 130, 246, 0.45);
}
.baby-hero-avatar::after {
  content: '✏️';
  position: absolute;
  bottom: -4px;
  right: -4px;
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.2s;
}
.baby-hero-avatar:hover::after {
  opacity: 1;
}
.baby-hero-name {
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
  margin: 0;
  line-height: 1.3;
  cursor: pointer;
  transition: color 0.2s;
}
.baby-hero-name:hover {
  color: var(--peach);
}
.baby-hero-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}
.baby-hero-age {
  font-size: 13px;
  color: var(--peach);
  font-weight: 600;
  background: rgba(232, 168, 124, 0.1);
  padding: 2px 10px;
  border-radius: 20px;
}
.baby-switch-select {
  appearance: none;
  background: rgba(232, 168, 124, 0.1);
  border: none;
  color: var(--peach);
  font-size: 12px;
  font-weight: 600;
  padding: 4px 24px 4px 10px;
  border-radius: 10px;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23E8A87C' viewBox='0 0 16 16'%3E%3Cpath d='M1.5 5.5l6.5 6.5 6.5-6.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
}

/* ── Feed split (left=quick, right=detail) ── */
.feed-split {
  display: flex;
  gap: 10px;
}

.feed-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px;
  border-radius: 22px;
  border: none;
  cursor: pointer;
  transition: all 0.3s;
}

.feed-btn:active {
  transform: scale(0.97);
}

.feed-btn-quick {
  flex: 3;
  background: linear-gradient(135deg, #fecdd3 0%, #fed7aa 100%);
  color: #7c2d12;
  box-shadow: 0 4px 16px rgba(252, 165, 165, 0.3);
}
.feed-btn-quick:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(252, 165, 165, 0.4);
}
.feed-btn-quick:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: 0 2px 8px rgba(252, 165, 165, 0.15);
}

.feed-btn-detail {
  flex: 1;
  background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
  color: #4338ca;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.2);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.feed-btn-detail:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(99, 102, 241, 0.3);
}

.feed-btn-icon {
  font-size: 28px;
}
.feed-btn-label {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.feed-btn-text {
  font-size: 18px;
  font-weight: 700;
}
.feed-btn-text-sm {
  font-size: 13px;
  font-weight: 600;
}
.feed-btn-hint {
  font-size: 12px;
  opacity: 0.75;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Action group (sleep / diaper) */
.action-group {
  padding: 16px;
}
.action-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.action-group-label {
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
}
.action-group-count {
  font-size: 12px;
  color: #9ca3af;
  background: rgba(156, 163, 175, 0.12);
  padding: 2px 10px;
  border-radius: 12px;
}

/* Sleep timer badge */
.sleep-timer-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #10b981;
  font-variant-numeric: tabular-nums;
}
.sleep-timer-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #10b981;
  animation: sleep-pulse 1.5s ease-in-out infinite;
}
@keyframes sleep-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.7); }
}

/* Sleep bar */
.sleep-bar-track {
  width: 100%;
  height: 4px;
  background: rgba(16, 185, 129, 0.12);
  border-radius: 2px;
  margin-bottom: 12px;
  overflow: hidden;
}
.sleep-bar-fill {
  width: 100%;
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #10b981, #34d399);
  animation: sleep-shimmer 2s ease-in-out infinite;
}
@keyframes sleep-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* Pill buttons */
.pill-btn {
  flex: 1;
  padding: 12px 8px;
  border-radius: 14px;
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s;
}
.pill-btn:hover {
  transform: translateY(-1px);
}
.pill-btn:active {
  transform: scale(0.96);
}
.pill-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none !important;
}

.pill-btn-sleep {
  background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
  color: #4338ca;
}
.pill-btn-wake {
  background: linear-gradient(135deg, #d1fae5, #a7f3d0);
  color: #047857;
  animation: gentle-pulse 2s ease-in-out infinite;
}
@keyframes gentle-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.3); }
  50% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
}
.pill-btn-ghost {
  background: rgba(107, 114, 128, 0.08);
  color: #6b7280;
}
.pill-btn-wet {
  background: linear-gradient(135deg, #dbeafe, #bfdbfe);
  color: #2563eb;
}
.pill-btn-solid {
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  color: #b45309;
}
.pill-btn-both {
  background: rgba(107, 114, 128, 0.08);
  color: #6b7280;
}

.sleep-btns, .diaper-btns {
  display: flex;
  gap: 8px;
}

/* Tummy time button */
.tummy-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  cursor: pointer;
  transition: all 0.3s;
}
.tummy-btn:hover {
  transform: translateY(-1px);
}
.tummy-btn:active {
  transform: scale(0.98);
}
.tummy-btn-icon {
  font-size: 28px;
}
.tummy-btn-text {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: #374151;
}
.tummy-btn-arrow {
  width: 16px; height: 16px;
  color: #d1d5db;
  transition: transform 0.2s;
}
.tummy-btn:hover .tummy-btn-arrow {
  transform: translateX(2px);
  color: #10b981;
}

/* ──────────── Right Column ──────────── */
.right-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Hero stat — today milk */
.hero-stat {
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
  background: linear-gradient(135deg, rgba(254, 205, 211, 0.35) 0%, rgba(253, 230, 138, 0.25) 100%);
}
.hero-stat:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(232, 168, 124, 0.18);
}
.hero-stat-sleep {
  background: linear-gradient(135deg, rgba(199, 210, 254, 0.35) 0%, rgba(167, 243, 208, 0.25) 100%);
}
.hero-stat-label {
  font-size: 14px;
  color: #6b7280;
  font-weight: 500;
}
.hero-stat-value {
  font-size: 48px;
  font-weight: 800;
  color: var(--peach);
  line-height: 1.2;
  margin: 8px 0;
  font-variant-numeric: tabular-nums;
}
.hero-stat-value-sleep {
  font-size: 28px;
  color: #6366f1;
}
.hero-stat-sleep-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #10b981;
  margin-bottom: 4px;
}
.sleep-timer-inline {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: #059669;
}
.sleep-status-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #10b981;
  animation: sleep-pulse 1.5s ease-in-out infinite;
}
.hero-stat-unit {
  font-size: 20px;
  font-weight: 600;
  color: var(--warm-orange);
  margin-left: 4px;
}
.hero-stat-sub {
  font-size: 12px;
  color: #9ca3af;
}
.hero-stat-elapsed {
  font-size: 14px;
  color: #f59e0b;
  font-weight: 600;
  margin-top: 4px;
}
.hero-stat-yesterday {
  font-size: 11px;
  color: #b0b0b0;
  margin-top: 4px;
  font-style: italic;
}

/* ──────────── Last event cards (big, clear, elderly-friendly) ──────────── */
.last-events-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.last-event-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  cursor: pointer;
  transition: all 0.3s;
}
.last-event-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
}
.last-event-card:active {
  transform: scale(0.98);
}
.last-event-emoji {
  font-size: 32px;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.last-event-feeding .last-event-emoji {
  background: rgba(244, 114, 182, 0.12);
}
.last-event-diaper .last-event-emoji {
  background: rgba(96, 165, 250, 0.12);
}
.last-event-sleep .last-event-emoji {
  background: rgba(99, 102, 241, 0.12);
}
.last-event-body {
  flex: 1;
  min-width: 0;
}
.last-event-label {
  font-size: 13px;
  color: #9ca3af;
  font-weight: 500;
}
.last-event-main {
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
  margin-top: 2px;
  line-height: 1.3;
}
.last-event-feeding .last-event-main {
  color: #ec4899;
}
.last-event-diaper .last-event-main {
  color: #3b82f6;
}
.last-event-sleep .last-event-main {
  color: #6366f1;
}
.last-event-sub {
  font-size: 13px;
  color: #9ca3af;
  margin-top: 2px;
}

/* ──────────── Measurement tiles (2x2, big values) ──────────── */
.measure-tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.measure-tile {
  padding: 16px;
  cursor: pointer;
  transition: all 0.3s;
  text-align: center;
}
.measure-tile:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
}
.measure-tile:active {
  transform: scale(0.97);
}
.measure-tile-top {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 6px;
}
.measure-tile-emoji {
  font-size: 20px;
}
.measure-tile-label {
  font-size: 14px;
  color: #9ca3af;
  font-weight: 500;
}
.measure-tile-value {
  font-size: 24px;
  font-weight: 800;
  color: #1f2937;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
}
.measure-tile-date {
  font-size: 12px;
  color: #b0b0b0;
  margin-top: 4px;
  line-height: 1.3;
}

/* ──────────── SCREEN 2: Detail Timeline ──────────── */
.detail-section {
  max-width: 1200px;
  margin: 32px auto 0;
  padding: 0 0 32px;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.detail-title {
  font-size: 18px;
  font-weight: 700;
  color: #374151;
  margin: 0;
}

.detail-refresh-btn {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #6b7280;
  transition: all 0.3s;
}
.detail-refresh-btn:hover {
  background: rgba(232, 168, 124, 0.15);
  color: var(--peach);
}

/* Prominent data refresh button */
.data-refresh-btn {
  width: 100%;
  padding: 10px 0;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(96, 165, 250, 0.15), rgba(167, 139, 250, 0.15));
  backdrop-filter: blur(20px);
  border: 1px solid rgba(96, 165, 250, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  color: #60a5fa;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.3s;
  margin-bottom: 12px;
}
.data-refresh-btn:hover {
  background: linear-gradient(135deg, rgba(96, 165, 250, 0.25), rgba(167, 139, 250, 0.25));
  border-color: rgba(96, 165, 250, 0.4);
  transform: translateY(-1px);
}
.data-refresh-btn:active {
  transform: translateY(0);
}
.data-refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
.refresh-icon {
  width: 18px;
  height: 18px;
}

.detail-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
}

.timeline-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.timeline-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  transition: all 0.25s;
  animation: fadeInUp 0.3s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.timeline-item:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

.timeline-item-ongoing {
  background: linear-gradient(135deg, rgba(199, 210, 254, 0.3) 0%, rgba(167, 243, 208, 0.2) 100%);
  border-color: rgba(99, 102, 241, 0.2);
}

.timeline-item-ongoing .timeline-title {
  color: #4338ca;
}

.timeline-item-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 50px;
}

.timeline-emoji {
  font-size: 22px;
}

.timeline-time {
  font-size: 11px;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
}

.timeline-item-content {
  flex: 1;
  min-width: 0;
}

.timeline-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.timeline-detail {
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
}

.timeline-delete {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: transparent;
  border: none;
  color: #d1d5db;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.timeline-delete:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.timeline-delete:active {
  transform: scale(0.9);
}

/* ──────────── Time Picker Modal ──────────── */
.time-picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: fadeIn 0.2s ease;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.time-picker-panel {
  background: #fff;
  border-radius: 24px;
  padding: 28px 24px 24px;
  width: 90%;
  max-width: 360px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(30px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.time-picker-title {
  font-size: 17px;
  font-weight: 700;
  color: #1f2937;
  text-align: center;
  margin: 0 0 20px;
}
.time-picker-input {
  width: 100%;
  padding: 14px 16px;
  font-size: 16px;
  border: 1.5px solid #e5e7eb;
  border-radius: 16px;
  background: #f9fafb;
  color: #374151;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  margin-bottom: 20px;
}
.time-picker-input:focus {
  border-color: #93c5fd;
  box-shadow: 0 0 0 3px rgba(147, 197, 253, 0.25);
}
.time-picker-btns {
  display: flex;
  gap: 10px;
}
.time-picker-btn {
  flex: 1;
  padding: 12px;
  border-radius: 14px;
  border: none;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.time-picker-btn-cancel {
  background: #f3f4f6;
  color: #6b7280;
}
.time-picker-btn-cancel:hover {
  background: #e5e7eb;
}
.time-picker-btn-confirm {
  background: linear-gradient(135deg, #93c5fd, #60a5fa);
  color: #fff;
  box-shadow: 0 4px 14px rgba(96, 165, 250, 0.35);
}
.time-picker-btn-confirm:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(96, 165, 250, 0.45);
}
.time-picker-btn-confirm:active {
  transform: scale(0.96);
}

/* ──────────── Solid Diaper Modal ──────────── */
.solid-modal-panel {
  padding: 28px 24px 24px;
}
.solid-modal-title {
  font-size: 22px;
  font-weight: 700;
  color: #1f2937;
  text-align: center;
  margin: 0 0 20px;
}
.solid-section {
  margin-bottom: 18px;
}
.solid-section-label {
  font-size: 15px;
  font-weight: 600;
  color: #4b5563;
  margin-bottom: 10px;
}
.solid-color-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.solid-color-btn {
  padding: 16px 12px;
  border-radius: 16px;
  border: 2px solid #e5e7eb;
  background: #f9fafb;
  font-size: 16px;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.solid-color-btn:active { transform: scale(0.95); }
.solid-color-active {
  border-color: transparent;
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #fff;
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3);
}
.solid-color-emoji { font-size: 22px; }
.solid-color-label { font-size: 16px; font-weight: 600; }
.solid-time-input {
  width: 100%;
  padding: 14px 16px;
  font-size: 16px;
  border: 2px solid #e5e7eb;
  border-radius: 16px;
  background: #f9fafb;
  color: #374151;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.solid-time-input:focus { border-color: #fbbf24; box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.15); }
.solid-btns {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
.solid-btn {
  flex: 1;
  padding: 16px;
  border-radius: 18px;
  border: none;
  font-size: 17px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.solid-btn:active { transform: scale(0.96); }
.solid-btn-cancel {
  background: #f3f4f6;
  color: #6b7280;
}
.solid-btn-confirm {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #fff;
  box-shadow: 0 4px 16px rgba(245, 158, 11, 0.35);
}
.solid-btn-confirm:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
</style>
