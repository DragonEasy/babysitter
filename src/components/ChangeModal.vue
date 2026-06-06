<template>
  <div>
    <h3 class="text-lg font-bold text-gray-800 mb-4">记录换尿布</h3>

    <div class="space-y-4">
      <!-- Type -->
      <div>
        <label class="text-xs text-gray-500 mb-2 block">类型</label>
        <div class="flex flex-wrap gap-2">
          <button
            @click="toggleWet"
            class="px-5 py-3 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
            :class="form.wet ? 'bg-blue-400 text-white shadow-sm' : 'bg-gray-100 text-gray-500'"
          >
            💦 湿了
          </button>
          <button
            @click="toggleSolid"
            class="px-5 py-3 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
            :class="form.solid ? 'bg-yellow-400 text-white shadow-sm' : 'bg-gray-100 text-gray-500'"
          >
            💩 有屎
          </button>
        </div>
      </div>

      <!-- Color -->
      <div v-if="form.solid">
        <label class="text-xs text-gray-500 mb-2 block">颜色</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="color in colorOptions"
            :key="color.value"
            @click="form.color = form.color === color.value ? '' : color.value"
            class="px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
            :class="form.color === color.value ? 'bg-warm-300 text-white shadow-sm' : 'bg-gray-100 text-gray-500'"
          >
            {{ color.emoji }} {{ color.label }}
          </button>
        </div>
      </div>

      <!-- Amount -->
      <div>
        <label class="text-xs text-gray-500 mb-1 block">量 (可选)</label>
        <input
          v-model.number="form.amount"
          type="number"
          placeholder="可选"
          class="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:border-warm-300"
        />
      </div>

      <!-- Time -->
      <div>
        <label class="text-xs text-gray-500 mb-1 block">时间</label>
        <input
          v-model="form.time"
          type="datetime-local"
          class="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:border-warm-300"
        />
      </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-3 mt-6">
      <button @click="$emit('close')" class="flex-1 py-3 rounded-xl bg-gray-100 text-gray-500 font-medium text-sm">
        取消
      </button>
      <button @click="submit" :disabled="submitting" class="flex-1 action-btn action-btn-primary justify-center">
        {{ submitting ? '保存中...' : '保存' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { inject } from 'vue'
import { createChange } from '../api/babybuddy'

const props = defineProps({
  childId: { type: Number, required: true },
  defaultType: { type: String, default: '' }
})

const emit = defineEmits(['close', 'success'])
const showToast = inject('showToast')
const submitting = ref(false)

const now = new Date()
const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

const form = reactive({
  wet: props.defaultType === 'wet',
  solid: props.defaultType === 'solid',
  color: '',
  amount: null,
  time: localISO
})

function toggleWet() { form.wet = !form.wet }
function toggleSolid() { form.solid = !form.solid }

const colorOptions = [
  { value: 'black', label: '黑色', emoji: '⚫' },
  { value: 'brown', label: '棕色', emoji: '🟤' },
  { value: 'green', label: '绿色', emoji: '🟢' },
  { value: 'yellow', label: '黄色', emoji: '🟡' }
]

async function submit() {
  if (!form.wet && !form.solid) {
    showToast('请至少选择一个类型', 'error')
    return
  }

  submitting.value = true
  try {
    await createChange({
      child: props.childId,
      wet: form.wet,
      solid: form.solid,
      color: form.color || undefined,
      amount: form.amount || undefined,
      time: new Date(form.time).toISOString()
    })

    showToast('换尿布已记录')
    emit('success')
    emit('close')
  } catch (e) {
    showToast('保存失败: ' + e.message, 'error')
  } finally {
    submitting.value = false
  }
}
</script>
