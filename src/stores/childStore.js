import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchChildren } from '../api/babybuddy'

export const useChildStore = defineStore('child', () => {
  const children = ref([])
  const currentChildId = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const displayNames = ref({})  // Custom display name overrides: { childId: 'name' }

  const currentChild = computed(() => {
    return children.value.find(c => c.id === currentChildId.value) || children.value[0] || null
  })

  function setDisplayName(childId, name) {
    displayNames.value[childId] = name
  }

  function getDisplayName(childId) {
    return displayNames.value[childId] || ''
  }

  async function loadChildren() {
    loading.value = true
    error.value = null
    try {
      children.value = await fetchChildren()
      if (!currentChildId.value && children.value.length > 0) {
        currentChildId.value = children.value[0].id
      }
    } catch (e) {
      error.value = e.message
      console.error('Failed to load children:', e)
    } finally {
      loading.value = false
    }
  }

  function selectChild(id) {
    currentChildId.value = id
  }

  return {
    children,
    currentChildId,
    currentChild,
    loading,
    error,
    displayNames,
    loadChildren,
    selectChild,
    setDisplayName,
    getDisplayName
  }
}, {
  persist: {
    paths: ['currentChildId', 'displayNames']
  }
})
