<template>
  <div class="modal-content">
    <h3 class="modal-title">🍼 添加喂奶记录</h3>

    <div class="modal-fields">
      <!-- Type -->
      <div class="field-group">
        <div class="field-label">奶的类型</div>
        <div class="btn-grid btn-grid-2">
          <button
            v-for="option in typeOptions"
            :key="option.value"
            @click="form.type = option.value"
            class="select-btn"
            :class="{ 'select-btn-active select-btn-pink': form.type === option.value }"
          >
            <span class="select-btn-emoji">{{ option.emoji }}</span>
            <span class="select-btn-text">{{ option.label }}</span>
          </button>
        </div>
      </div>

      <!-- Method -->
      <div class="field-group">
        <div class="field-label">喂奶方式</div>
        <div class="btn-grid btn-grid-3">
          <button
            v-for="option in methodOptions"
            :key="option.value"
            @click="form.method = option.value"
            class="select-btn select-btn-sm"
            :class="{ 'select-btn-active select-btn-warm': form.method === option.value }"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <!-- Amount -->
      <div class="field-group">
        <div class="field-label">奶量 (ml)</div>
        <div class="amount-row">
          <button class="amount-adj" @click="adjustAmount(-10)">−</button>
          <input
            v-model.number="form.amount"
            type="number"
            class="amount-input"
            placeholder="0"
          />
          <button class="amount-adj" @click="adjustAmount(10)">+</button>
        </div>
        <div class="quick-amounts">
          <button v-for="a in [60, 90, 120, 150, 180]" :key="a" @click="form.amount = a" class="quick-amt-btn" :class="{ 'quick-amt-active': form.amount === a }">{{ a }}ml</button>
        </div>
      </div>

      <!-- Time -->
      <div class="field-group">
        <div class="field-label">时间</div>
        <input v-model="form.start" type="datetime-local" class="big-input" />
      </div>
    </div>

    <!-- Actions -->
    <div class="modal-actions">
      <button @click="$emit('close')" class="modal-btn modal-btn-cancel">取消</button>
      <button @click="submit" :disabled="submitting" class="modal-btn modal-btn-confirm">
        {{ submitting ? '保存中...' : '✅ 保存' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { inject } from 'vue'
import { createFeeding } from '../api/babybuddy'

const props = defineProps({
  childId: { type: Number, required: true },
  lastFeeding: { type: Object, default: null }
})

const emit = defineEmits(['close', 'success'])
const showToast = inject('showToast')

const submitting = ref(false)

const now = new Date()
const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

const form = reactive({
  type: props.lastFeeding?.type || 'formula',
  method: props.lastFeeding?.method || 'bottle',
  amount: props.lastFeeding?.amount || null,
  start: localISO
})

function adjustAmount(delta) {
  const current = form.amount || 0
  form.amount = Math.max(0, current + delta)
}

const typeOptions = [
  { value: 'breast milk', label: '母乳', emoji: '🤱' },
  { value: 'formula', label: '配方奶', emoji: '🍼' },
  { value: 'fortified breast milk', label: '强化母乳', emoji: '💪' },
  { value: 'solid food', label: '辅食', emoji: '🥣' }
]

const methodOptions = [
  { value: 'bottle', label: '瓶喂' },
  { value: 'left breast', label: '左侧' },
  { value: 'right breast', label: '右侧' },
  { value: 'both breasts', label: '两侧' },
  { value: 'parent fed', label: '家长喂' },
  { value: 'self fed', label: '自主吃' }
]

async function submit() {
  submitting.value = true
  try {
    const startISO = new Date(form.start).toISOString()
    const endISO = new Date(new Date(form.start).getTime() + 20 * 60000).toISOString()

    await createFeeding({
      child: props.childId,
      type: form.type,
      method: form.method,
      amount: form.amount || undefined,
      start: startISO,
      end: endISO
    })

    showToast('喂奶记录已添加 🍼')
    emit('success')
    emit('close')
  } catch (e) {
    showToast('保存失败: ' + e.message, 'error')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.modal-content {
  padding: 4px 0;
}
.modal-title {
  font-size: 22px;
  font-weight: 700;
  color: #1f2937;
  text-align: center;
  margin: 0 0 20px;
}
.modal-fields {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.field-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.field-label {
  font-size: 15px;
  font-weight: 600;
  color: #4b5563;
}
.btn-grid {
  display: grid;
  gap: 8px;
}
.btn-grid-2 {
  grid-template-columns: 1fr 1fr;
}
.btn-grid-3 {
  grid-template-columns: 1fr 1fr 1fr;
}
.select-btn {
  padding: 14px 10px;
  border-radius: 16px;
  border: 2px solid #e5e7eb;
  background: #f9fafb;
  font-size: 15px;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.select-btn:active { transform: scale(0.96); }
.select-btn-sm {
  padding: 12px 6px;
  font-size: 14px;
}
.select-btn-active {
  border-color: transparent;
  color: #fff;
  box-shadow: 0 4px 14px rgba(0,0,0,0.1);
}
.select-btn-pink {
  background: linear-gradient(135deg, #f9a8d4, #f472b6);
}
.select-btn-warm {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
}
.select-btn-emoji {
  font-size: 20px;
}
.select-btn-text {
  font-size: 15px;
}
.amount-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.amount-adj {
  width: 52px; height: 52px;
  border-radius: 16px;
  border: 2px solid #e5e7eb;
  background: #f9fafb;
  font-size: 24px;
  font-weight: 700;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.amount-adj:active { transform: scale(0.92); background: #e5e7eb; }
.amount-input {
  flex: 1;
  height: 52px;
  border-radius: 16px;
  border: 2px solid #e5e7eb;
  background: #f9fafb;
  font-size: 22px;
  font-weight: 700;
  color: #1f2937;
  text-align: center;
  outline: none;
}
.amount-input:focus { border-color: #f9a8d4; box-shadow: 0 0 0 3px rgba(244, 114, 182, 0.15); }
.quick-amounts {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.quick-amt-btn {
  padding: 8px 14px;
  border-radius: 12px;
  border: 2px solid #e5e7eb;
  background: #f9fafb;
  font-size: 14px;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.15s;
}
.quick-amt-btn:active { transform: scale(0.95); }
.quick-amt-active {
  border-color: #f472b6;
  background: rgba(244, 114, 182, 0.1);
  color: #ec4899;
}
.big-input {
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
.big-input:focus { border-color: #f9a8d4; box-shadow: 0 0 0 3px rgba(244, 114, 182, 0.15); }
.modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 24px;
}
.modal-btn {
  flex: 1;
  padding: 16px;
  border-radius: 18px;
  border: none;
  font-size: 17px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.modal-btn:active { transform: scale(0.96); }
.modal-btn-cancel {
  background: #f3f4f6;
  color: #6b7280;
}
.modal-btn-confirm {
  background: linear-gradient(135deg, #f9a8d4, #f472b6);
  color: #fff;
  box-shadow: 0 4px 16px rgba(244, 114, 182, 0.35);
}
.modal-btn-confirm:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
</style>
