<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <header class="flex items-center justify-between px-5 py-3 bg-white/70 backdrop-blur-lg sticky top-0 z-50" style="padding-top: max(12px, env(safe-area-inset-top));">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-full bg-gradient-to-br from-warm-200 to-warm-400 flex items-center justify-center">
          <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </div>
        <div>
          <h1 class="text-lg font-bold text-gray-800 leading-tight">{{ pageTitle }}</h1>
          <p v-if="childStore.currentChild" class="text-xs text-gray-400 leading-tight">{{ childStore.currentChild.first_name }}</p>
        </div>
      </div>
      <button @click="showToast('coming soon')" class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
        <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
        </svg>
      </button>
    </header>

    <!-- Main content area -->
    <main class="flex-1 overflow-y-auto">
      <router-view v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- Bottom Navigation -->
    <nav class="bottom-nav shrink-0">
      <button
        v-for="item in navItems"
        :key="item.path"
        @click="$router.push(item.path)"
        class="bottom-nav-item"
        :class="{ active: currentPath === item.path }"
      >
        <component :is="item.iconComponent" />
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <!-- Toast container -->
    <div v-if="toastVisible" class="toast" :class="`toast-${toastType}`">
      {{ toastMessage }}
    </div>

    <!-- Modal -->
    <div v-if="modalVisible" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content">
        <component :is="modalComponent" v-bind="modalProps" @close="closeModal" @success="onModalSuccess" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, h, provide } from 'vue'
import { useRoute } from 'vue-router'
import { useChildStore } from './stores/childStore'
import { useSettingsStore } from './stores/settingsStore'

const route = useRoute()
const childStore = useChildStore()
const settingsStore = useSettingsStore()

const currentPath = computed(() => route.path)
const pageTitle = computed(() => route.meta.title || '宝宝管家')

// Toast system
const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref('success')

function showToast(message, type = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
  setTimeout(() => { toastVisible.value = false }, 2500)
}

// Modal system
const modalVisible = ref(false)
const modalComponent = ref(null)
const modalProps = ref({})
let modalResolve = null

function openModal(component, props = {}) {
  return new Promise((resolve) => {
    modalResolve = resolve
    modalComponent.value = component
    modalProps.value = props
    modalVisible.value = true
  })
}

function closeModal(result) {
  modalVisible.value = false
  if (modalResolve) {
    modalResolve(result)
    modalResolve = null
  }
}

function onModalSuccess(data) {
  closeModal(data)
  showToast('操作成功')
}

provide('showToast', showToast)
provide('openModal', openModal)
provide('closeModal', closeModal)

// Nav icons as functional components
const HomeIcon = {
  render() {
    return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' })
    ])
  }
}

const PhotosIcon = {
  render() {
    return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' })
    ])
  }
}

const SettingsIcon = {
  render() {
    return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }),
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z' })
    ])
  }
}

const navItems = [
  { path: '/dashboard', label: '首页', iconComponent: HomeIcon },
  { path: '/photos', label: '相册', iconComponent: PhotosIcon },
  { path: '/settings', label: '设置', iconComponent: SettingsIcon }
]
</script>
