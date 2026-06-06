<template>
  <div class="px-4 py-4">
    <!-- Header -->
    <div class="flex items-center gap-3 mb-4">
      <button @click="$router.back()" class="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center">
        <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
      </button>
      <h2 class="text-lg font-bold text-gray-800">{{ typeConfig.title }}</h2>
      <div class="flex-1"></div>
      <button v-if="typeConfig.canAdd && !typeConfig.isSleep" @click="openAddModal" class="action-btn action-btn-primary action-btn-sm">
        + 新增
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="spinner"></div>
    </div>

    <!-- Empty -->
    <div v-else-if="items.length === 0" class="flex flex-col items-center py-20 text-gray-300">
      <span class="text-4xl mb-3">{{ typeConfig.emoji }}</span>
      <p class="text-sm">暂无记录</p>
    </div>

    <!-- List -->
    <div v-else class="space-y-2">
      <div
        v-for="item in items"
        :key="item.id"
        class="glass-card p-4"
      >
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium text-gray-800">{{ getItemTitle(item) }}</p>
            <p class="text-sm text-gray-400 mt-1">{{ getItemSubtitle(item) }}</p>
          </div>
          <div class="flex items-center gap-2">
            <button
              v-if="type !== 'height' && type !== 'weight' && type !== 'temperature' && type !== 'head'"
              @click="editItem(item)"
              class="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center"
            >
              <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
              </svg>
            </button>
            <button
              @click="deleteItem(item)"
              class="w-8 h-8 rounded-lg bg-pink-50 flex items-center justify-center"
            >
              <svg class="w-4 h-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import { inject } from 'vue'
import { useChildStore } from '../stores/childStore'
import {
  fetchFeedings, updateFeeding, deleteFeeding,
  fetchChanges, updateChange, deleteChange,
  fetchSleep, updateSleep, deleteSleep,
  fetchHeight, fetchWeight, fetchTemperature, fetchHeadCircumference,
  deleteHeight, deleteWeight, deleteTemperature, deleteHeadCircumference
} from '../api/babybuddy'

const props = defineProps({
  type: { type: String, required: true }
})

const route = useRoute()
const childStore = useChildStore()
const showToast = inject('showToast')
const openModal = inject('openModal')

const items = ref([])
const loading = ref(false)

const typeConfig = computed(() => {
  const configs = {
    feeding: {
      title: '喂奶记录',
      emoji: '🍼',
      canAdd: true,
      isSleep: false,
      fetch: (id, date) => fetchFeedings(id, date),
      update: (id, data) => updateFeeding(id, data),
      remove: (id) => deleteFeeding(id),
    },
    change: {
      title: '换尿布记录',
      emoji: '🧷',
      canAdd: true,
      isSleep: false,
      fetch: (id, date) => fetchChanges(id, date),
      update: (id, data) => updateChange(id, data),
      remove: (id) => deleteChange(id),
    },
    sleep: {
      title: '睡眠记录',
      emoji: '💤',
      canAdd: true,
      isSleep: true,
      fetch: (id, date) => fetchSleep(id, date),
      update: (id, data) => updateSleep(id, data),
      remove: (id) => deleteSleep(id),
    },
    height: {
      title: '身高记录',
      emoji: '📏',
      canAdd: true,
      isSleep: false,
      fetch: (id) => fetchHeight(id),
      update: null,
      remove: (id) => deleteHeight(id),
    },
    weight: {
      title: '体重记录',
      emoji: '⚖️',
      canAdd: true,
      isSleep: false,
      fetch: (id) => fetchWeight(id),
      update: null,
      remove: (id) => deleteWeight(id),
    },
    temperature: {
      title: '体温记录',
      emoji: '🌡️',
      canAdd: true,
      isSleep: false,
      fetch: (id, date) => fetchTemperature(id, date),
      update: null,
      remove: (id) => deleteTemperature(id),
    },
    head: {
      title: '头围记录',
      emoji: '🧠',
      canAdd: true,
      isSleep: false,
      fetch: (id) => fetchHeadCircumference(id),
      update: null,
      remove: (id) => deleteHeadCircumference(id),
    }
  }
  return configs[props.type] || configs.feeding
})

const today = computed(() => new Date().toISOString().split('T')[0])

async function loadData() {
  const child = childStore.currentChild
  if (!child) return

  loading.value = true
  try {
    items.value = await typeConfig.value.fetch(child.id, today.value)
  } catch (e) {
    showToast('加载失败: ' + e.message, 'error')
  } finally {
    loading.value = false
  }
}

function getItemTitle(item) {
  switch (props.type) {
    case 'feeding':
      return `${item.type === 'breast milk' ? '母乳' : item.type === 'formula' ? '配方奶' : item.type === 'solid food' ? '辅食' : item.type || '喂奶'}`
    case 'change': {
      const types = []
      if (item.wet) types.push('湿了')
      if (item.solid) types.push('有屎')
      return types.join(' + ') || '换尿布'
    }
    case 'sleep':
      return item.end ? `睡了 ${getSleepDuration(item)}` : '正在睡觉...'
    case 'height':
      return `${item.height} cm`
    case 'weight':
      return `${item.weight} kg`
    case 'temperature':
      return `${item.temperature} °C`
    case 'head':
      return `${item.head_circumference} cm`
    default:
      return ''
  }
}

function getItemSubtitle(item) {
  const date = item.start || item.date || item.time
  if (!date) return ''
  const d = new Date(date)
  const formatted = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`

  let extra = ''
  if (props.type === 'feeding' && item.method) {
    extra = ` · ${item.method}`
  }
  if (props.type === 'feeding' && item.amount) {
    extra += ` · ${item.amount}ml`
  }
  if (props.type === 'change' && item.color) {
    extra = ` · 颜色: ${item.color}`
  }
  return formatted + extra
}

function getSleepDuration(item) {
  if (!item.start || !item.end) return ''
  const diff = new Date(item.end) - new Date(item.start)
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}时${m}分` : `${m}分`
}

async function deleteItem(item) {
  if (!confirm('确定要删除这条记录吗？')) return
  try {
    await typeConfig.value.remove(item.id)
    items.value = items.value.filter(i => i.id !== item.id)
    showToast('已删除')
  } catch (e) {
    showToast('删除失败', 'error')
  }
}

function editItem(item) {
  // Simple edit - could expand to full modal
  const newText = prompt('修改备注 (留空取消):', item.notes || '')
  if (newText === null) return
  if (typeConfig.value.update) {
    typeConfig.value.update(item.id, { notes: newText }).then(() => {
      showToast('已更新')
      loadData()
    })
  }
}

function openAddModal() {
  const type = props.type
  const childId = childStore.currentChild?.id

  let modalComp
  let modalProps = { childId }

  if (type === 'feeding') {
    modalComp = defineAsyncComponent(() => import('../components/FeedingModal.vue'))
  } else if (type === 'change') {
    modalComp = defineAsyncComponent(() => import('../components/ChangeModal.vue'))
  } else if (type === 'height' || type === 'weight' || type === 'temperature' || type === 'head') {
    modalComp = defineAsyncComponent(() => import('../components/MeasurementModal.vue'))
    modalProps.type = type
  }

  if (modalComp) {
    openModal(modalComp, modalProps).then(() => loadData())
  }
}

onMounted(loadData)
watch(() => props.type, loadData)
</script>
