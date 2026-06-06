<template>
  <div>
    <!-- Tummy Time mode -->
    <template v-if="props.type === 'tummy-time'">
      <h3 class="text-lg font-bold text-gray-800 mb-4">记录爬趴时间</h3>
      <div class="space-y-4">
        <div>
          <label class="text-xs text-gray-500 mb-1 block">时长 (分钟)</label>
          <div class="flex items-center gap-3">
            <input
              v-model.number="form.duration"
              type="number"
              step="1"
              placeholder="例如: 10"
              class="flex-1 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:border-warm-300 text-center text-2xl font-bold"
            />
            <span class="text-lg text-gray-400">分钟</span>
          </div>
        </div>
        <div>
          <label class="text-xs text-gray-500 mb-1 block">日期时间</label>
          <input v-model="form.datetime" type="datetime-local" class="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:border-warm-300" />
        </div>
      </div>
    </template>

    <!-- Measurement mode -->
    <template v-else>
      <h3 class="text-lg font-bold text-gray-800 mb-4">{{ typeConfig.title }}</h3>
      <div class="space-y-4">
        <div>
          <label class="text-xs text-gray-500 mb-1 block">{{ typeConfig.unitLabel }}</label>
          <div class="flex items-center gap-3">
            <input
              v-model.number="form.value"
              type="number"
              step="0.1"
              :placeholder="typeConfig.placeholder"
              class="flex-1 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:border-warm-300 text-center text-2xl font-bold"
            />
            <span class="text-lg text-gray-400">{{ typeConfig.unit }}</span>
          </div>
        </div>
        <div>
          <label class="text-xs text-gray-500 mb-1 block">日期</label>
          <input v-model="form.date" type="date" class="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:border-warm-300" />
        </div>
      </div>
    </template>

    <!-- Actions -->
    <div class="flex gap-3 mt-6">
      <button @click="$emit('close')" class="flex-1 py-3 rounded-xl bg-gray-100 text-gray-500 font-medium text-sm">取消</button>
      <button @click="submit" :disabled="submitting" class="flex-1 action-btn action-btn-primary justify-center">
        {{ submitting ? '保存中...' : '保存' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { inject } from 'vue'
import { createHeight, createWeight, createTemperature, createHeadCircumference, createTummyTime } from '../api/babybuddy'

const props = defineProps({
  childId: { type: Number, required: true },
  type: { type: String, required: true }
})

const emit = defineEmits(['close', 'success'])
const showToast = inject('showToast')
const submitting = ref(false)

const today = new Date().toISOString().split('T')[0]
const nowLocal = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)

const form = reactive({
  value: null,
  date: today,
  duration: null,
  datetime: nowLocal
})

const typeConfig = computed(() => {
  const configs = {
    height: {
      title: '记录身高',
      unit: 'cm',
      unitLabel: '身高',
      placeholder: '例如: 60.5',
      create: createHeight,
      field: 'height'
    },
    weight: {
      title: '记录体重',
      unit: 'kg',
      unitLabel: '体重',
      placeholder: '例如: 7.2',
      create: createWeight,
      field: 'weight'
    },
    temperature: {
      title: '记录体温',
      unit: '°C',
      unitLabel: '体温',
      placeholder: '例如: 36.8',
      create: createTemperature,
      field: 'temperature'
    },
    head: {
      title: '记录头围',
      unit: 'cm',
      unitLabel: '头围',
      placeholder: '例如: 40.5',
      create: createHeadCircumference,
      field: 'head_circumference'
    }
  }
  return configs[props.type] || configs.weight
})

async function submit() {
  submitting.value = true
  try {
    if (props.type === 'tummy-time') {
      if (!form.duration || form.duration <= 0) {
        showToast('请输入有效时长', 'error')
        submitting.value = false
        return
      }
      const startISO = new Date(form.datetime).toISOString()
      const endISO = new Date(new Date(form.datetime).getTime() + form.duration * 60000).toISOString()
      await createTummyTime({
        child: props.childId,
        start: startISO,
        end: endISO,
        duration: form.duration
      })
      showToast('爬趴时间已记录')
    } else {
      if (!form.value || form.value <= 0) {
        showToast('请输入有效的数值', 'error')
        submitting.value = false
        return
      }
      const data = { child: props.childId, date: form.date }
      data[typeConfig.value.field] = form.value
      await typeConfig.value.create(data)
      showToast(`${typeConfig.value.title}已记录`)
    }
    emit('success')
    emit('close')
  } catch (e) {
    showToast('保存失败: ' + e.message, 'error')
  } finally {
    submitting.value = false
  }
}
</script>
