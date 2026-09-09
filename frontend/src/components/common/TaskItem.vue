<template>
  <div
    class="task-item"
    :class="{
      'task-done': task.status === 'done',
      'task-progress': task.status === 'progress',
      'drag-over': dragOver,
      'dragging': dragging,
      'task-readonly': readOnly
    }"
    @dragover="onDragOver"
    @drop="onDrop"
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
  >
    <div
      class="task-status"
      :class="{ 'is-disabled': readOnly }"
      :draggable="!readOnly"
      @dragstart.stop="onDragStart"
      @dragend.stop="onDragEnd"
      @click.stop="cycleStatus"
      :title="readOnly ? 'Только просмотр' : getStatusTitle(task.status)"
    >
      <span class="status-icon" :style="{ color: getStatusColor(task.status) }">
        {{ getStatusIcon(task.status) }}
      </span>
    </div>

    <div class="task-content">
      <div v-if="task.isEditing" class="task-edit-mode">
        <textarea
          ref="editInputRef"
          v-model="task.editValue"
          @keyup.enter="saveEdit"
          @keyup.esc="cancelEdit"
          @blur="onEditBlur"
          class="task-edit-input"
          rows="2"
        ></textarea>
      </div>
      <div v-else class="task-title" :class="{ 'is-readonly': readOnly }" @click.stop="onTaskTitleClick">
        {{ task.title }}
      </div>
    </div>

    <div v-if="!readOnly && !task.isEditing" class="task-actions">
      <button
        v-if="hasLink()"
        class="task-link-btn"
        type="button"
        title="Открыть ссылку"
        aria-label="Открыть ссылку задачи"
        @click.stop="openTaskLink"
      >
        <img class="task-link-icon" :src="linkIcon" alt="" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import linkIcon from '@/assets/link-icon.png'

// Входные данные одной строки задачи + флаги DnD/режима просмотра.
const props = defineProps({
  task: { type: Object, required: true },
  block: { type: Object, required: true },
  dragOver: { type: Boolean, default: false },
  dragging: { type: Boolean, default: false },
  readOnly: { type: Boolean, default: false }
})

// События, которые строка задачи поднимает в родителя (изменение, редактирование, drag&drop).
const emit = defineEmits([
  'cycle-status',
  'start-edit',
  'open-card',
  'save-edit',
  'cancel-edit',
  'delete',
  'drag-start',
  'drag-end',
  'drag-over',
  'drop',
  'drag-enter',
  'drag-leave'
])

// Локальное отображение статусов (иконка/цвет/подсказка) для компактности рендера.
const getStatusIcon = (status) => {
  switch(status) {
    case 'done': return '✅'
    case 'progress': return '🕛'
    default: return '○'
  }
}

const getStatusColor = (status) => {
  switch(status) {
    case 'done': return '#90EE90'
    case 'progress': return '#eab308'
    default: return '#deddd1'
  }
}

const getStatusTitle = (status) => {
  switch(status) {
    case 'done': return 'Выполнено'
    case 'progress': return 'В работе'
    default: return 'Не начато'
  }
}

const normalizeLinkUrl = (raw) => {
  if (!raw || typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

// Наличие ссылки управляет видимостью кнопки link.
const hasLink = () => Boolean(normalizeLinkUrl(props.task?.linkUrl || ''))

// Ref textarea и "окно стабилизации" после открытия inline-редактирования.
const editInputRef = ref(null)
const editOpenedAt = ref(0)
const EDIT_REFOCUS_WINDOW_MS = 500

// При входе в режим редактирования ставим фокус в конец текста.
watch(
  () => props.task?.isEditing,
  async (isEditing) => {
    if (!isEditing) return
    editOpenedAt.value = performance.now()
    await nextTick()
    const input = editInputRef.value
    if (!input) return
    input.focus({ preventScroll: true })
    const valueLength = typeof props.task?.editValue === 'string' ? props.task.editValue.length : 0
    input.setSelectionRange(valueLength, valueLength)
  }
)

// Открывает ссылку задачи в новой вкладке.
const openTaskLink = () => {
  const url = normalizeLinkUrl(props.task?.linkUrl || '')
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

// Обработчики взаимодействий строки задачи.
const cycleStatus = (event) => {
  if (props.readOnly) return
  emit('cycle-status', event)
}

// Клик по названию открывает карточку задачи, а не inline-редактор.
const openCard = () => {
  if (props.readOnly) return
  emit('open-card')
}

const onTaskTitleClick = () => {
  openCard()
}

const saveEdit = (event) => {
  emit('save-edit', event)
}

const onEditBlur = (event) => {
  emit('save-edit', event)
  // Сразу после открытия редактора возможен ложный blur:
  // кратко рефокусируем поле, пока не прошел guard-интервал.
  nextTick(() => {
    requestAnimationFrame(() => {
      if (!props.task.isEditing) return
      const elapsed = performance.now() - editOpenedAt.value
      if (elapsed > EDIT_REFOCUS_WINDOW_MS) return
      const input = editInputRef.value
      if (!input || document.activeElement === input) return
      input.focus({ preventScroll: true })
    })
  })
}

const cancelEdit = () => {
  emit('cancel-edit')
}

// Drag старт блокируется в режиме read-only.
const onDragStart = (event) => {
  if (props.readOnly) {
    event.preventDefault()
    return
  }
  emit('drag-start', event)
}

const onDragEnd = () => {
  emit('drag-end')
}

const onDragOver = (event) => {
  emit('drag-over', event)
}

const onDrop = (event) => {
  emit('drop', event)
}

const onDragEnter = () => {
  emit('drag-enter')
}

const onDragLeave = (event) => {
  emit('drag-leave', event)
}
</script>

<style scoped>
.task-item {
  display: flex;
  align-items: stretch;
  gap: 6px;
  padding: 6px 0;
  border-bottom: 1px solid #e2e8f0;
  transition: background-color 0.2s ease, border-color 0.2s ease;
  cursor: default;
  user-select: none;
}
.task-item.dragging {
  opacity: 0.5;
  transform: scale(0.98);
  background: white;
  z-index: 1000;
}
.task-item.drag-over {
  border-bottom-color: #bfdbfe;
  background: #f8fbff;
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.28);
  border-radius: 6px;
}
.task-status {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  border-radius: 12px;
}
.task-status:active { cursor: grabbing; }
.task-status.is-disabled {
  cursor: default;
}
.task-status:hover { background: #f1f5f9; transform: scale(1.1); }
.status-icon {
  display: inline-block;
  width: 20px;
  height: 20px;
  font-size: 1rem;
  line-height: 20px;
  text-align: center;
}
.task-content { flex: 1; min-width: 0; padding-top: 2px; }
.task-edit-mode {
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}
.task-title {
  font-size: 0.9rem;
  line-height: 1.2;
  color: #1e293b;
  word-break: break-word;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-wrap: break-word;
}
.task-title:hover { background: #e2e8f0; outline: 1px solid #3b82f6; }
.task-actions {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  align-self: stretch;
  height: 100%;
  transform: translateX(-6px);
  opacity: 1;
  transition: opacity 0.2s;
}
.task-link-btn {
  height: 80%;
  width: auto;
  aspect-ratio: 1 / 1;
  min-height: 20px;
  max-height: 30px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.task-link-btn:hover {
  background: #eff6ff;
}
.task-link-icon {
  width: 100%;
  height: 100%;
  display: block;
}
.task-edit-input {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border: 1px solid #3b82f6;
  border-radius: 6px;
  font-size: 0.75rem;
  outline: none;
  background: white;
  resize: none;
  min-height: 40px;
  height: 40px;
  font-family: inherit;
}
</style>