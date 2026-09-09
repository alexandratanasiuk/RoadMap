<template>
  <div
    v-if="block"
    class="modal-overlay"
    @pointerdown.self="onOverlayPointerDown"
    @pointermove.self="onOverlayPointerMove"
    @pointerup.self="onOverlayPointerUp"
    @pointercancel.self="onOverlayPointerCancel"
  >
    <div class="modal" @click.stop>
      <div class="modal-header">
        <h3 v-if="isReadOnly">👁 Просмотр этапа</h3>
        <h3 v-else>Редактировать этап</h3>
        <button class="close-btn" @click="handleClose">×</button>
      </div>
      
      <div class="modal-two-columns">
        <!-- Левая колонка -->
        <div class="modal-left">
          <div class="form-group">
            <label>Название этапа</label>
            <input 
              v-model="editingBlock.title" 
              type="text" 
              placeholder="Например: Тайм-трекинг"
              :readonly="isReadOnly"
            >
          </div>
          
          <div class="form-group">
            <label>Описание</label>
            <textarea 
              v-model="editingBlock.description" 
              rows="4" 
              placeholder="Краткое описание целей этапа..."
              :readonly="isReadOnly"
            ></textarea>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label>🚀 Дата начала</label>
              <input v-model="editingBlock.startDate" type="date" :disabled="isReadOnly">
            </div>
            <div class="form-group">
              <label>📅 Дата окончания</label>
              <input v-model="editingBlock.releaseDate" type="date" :disabled="isReadOnly">
            </div>
          </div>

          <div class="form-group">
            <div class="effort-header">
              <label>⚡ Трудозатраты</label>
              <div class="effort-controls">
                <span
                  v-if="isReadOnly || !isEditingBlockEffort"
                  class="effort-value"
                  :class="{ 'effort-value-editable': !isReadOnly }"
                  @click="startBlockEffortEdit"
                >
                  {{ editingBlock.effort || 0 }} ч
                </span>
                <input
                  v-else
                  ref="effortInlineInput"
                  v-model.number="editingBlock.effort"
                  type="number"
                  min="0"
                  max="1000"
                  step="1"
                  class="effort-inline-input"
                  @input="normalizeBlockEffort"
                  @blur="finishBlockEffortEdit"
                  @keyup.enter.prevent="finishBlockEffortEdit"
                  @keyup.esc.prevent="cancelBlockEffortEdit"
                >
              </div>
            </div>
            <div class="effort-input">
              <div class="effort-gradient-wrap">
                <div class="effort-gradient-track"></div>
                <input
                  v-model.number="editingBlock.effort"
                  type="range"
                  min="0"
                  max="1000"
                  step="1"
                  class="effort-range"
                  :disabled="isReadOnly"
                  @input="normalizeBlockEffort"
                >
              </div>
              <div class="effort-gradient-labels">
                <span>0</span>
                <span>1000</span>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label>👤 Владелец этапа</label>
            <select v-model="editingBlock.ownerUsername" :disabled="isReadOnly">
              <option
                v-for="user in owners"
                :key="user.username"
                :value="user.username"
              >
                {{ user.username }}{{ user.role === 'admin' ? ' (admin)' : '' }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>📁 Проект</label>
            <select v-model="editingBlock.projectId" :disabled="isReadOnly || !projects.length">
              <option v-if="!projects.length" value="">Нет проектов</option>
              <option
                v-for="project in projects"
                :key="project.id"
                :value="project.id"
              >
                {{ project.name }}
              </option>
            </select>
          </div>
        </div>
        
        <!-- Правая колонка - задачи -->
        <div class="modal-right">
          <div class="tasks-header-modal">
            <label>📋 Задачи этапа</label>
            <button v-if="!isReadOnly" class="btn-add-task-modal" @click="addTaskInModal">+ Добавить задачу</button>
          </div>
          
          <div class="modal-tasks-list">
            <div
              v-for="task in editingBlock.tasks"
              :key="task.id"
              class="modal-task-wrap"
            >
              <div
                class="modal-task-item"
                :class="{ 'task-done-modal': task.status === 'done' }"
              >
                <div class="modal-task-status" @click="!isReadOnly && cycleTaskStatusInModal(task)">
                  <span class="status-icon" :style="{ color: getStatusColor(task.status) }">
                    {{ getStatusIcon(task.status) }}
                  </span>
                </div>

                <div class="modal-task-content">
                  <div v-if="task.isEditingInModal" class="modal-task-edit-area">
                    <textarea
                      v-model="task.editValue"
                      @blur="saveTaskEditInModal(task)"
                      @keyup.enter="saveTaskEditInModal(task)"
                      @keyup.esc="cancelTaskEditInModal(task)"
                      class="modal-task-input"
                      rows="2"
                      autofocus
                    ></textarea>
                  </div>
                  <div v-else class="modal-task-info">
                    <span class="modal-task-title" :class="{ 'has-link': hasTaskLinkUrl(task) }" @click="onTaskTitleClickInModal(task)">
                      {{ task.title }}
                    </span>
                    <div class="modal-task-effort">
                      <span class="effort-icon">⚡</span>
                      <span class="task-effort-value">{{ task.effort || 0 }} ч</span>
                    </div>
                  </div>
                </div>

                <div v-if="!isReadOnly" class="modal-task-actions">
                  <button
                    class="modal-task-edit"
                    :class="{ active: taskEditorTaskId === task.id }"
                    @click.stop="openTaskEditor(task)"
                    title="Редактировать задачу"
                  >
                    <svg class="modal-task-edit-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4.2 19.8l2.5-6.1L16.4 4l3.6 3.6-9.7 9.7-6.1 2.5z" fill="#4ea3e1" />
                      <path d="M15.8 4.6l1.9-1.9a1.8 1.8 0 0 1 2.6 0l1 1a1.8 1.8 0 0 1 0 2.6l-1.9 1.9-3.6-3.6z" fill="#2f5bd1" />
                      <path d="M17.6 3.8l2.6 2.6-1.8 1.8-2.6-2.6 1.8-1.8z" fill="#d5dbe5" />
                    </svg>
                  </button>
                  <button class="modal-task-delete" @click="deleteTaskInModal(task)" title="Удалить">🗑️</button>
                </div>
              </div>

              <div
                v-if="!isReadOnly && taskEditorTaskId === task.id"
                class="modal-task-link-panel modal-task-editor-panel"
                :data-task-editor-id="String(task.id)"
                @click.stop
              >
                <label class="modal-task-link-label">Ссылка</label>
                <div class="modal-task-link-row">
                  <input
                    v-model="taskEditorDraft.linkUrl"
                    type="url"
                    class="modal-task-link-field"
                    :id="`task-editor-link-${task.id}`"
                    placeholder="https://..."
                    @click.stop
                  >
                </div>

                <div class="form-row modal-task-dates-row">
                  <label class="modal-task-link-label modal-task-date-label">
                    Дата начала
                    <input
                      v-model="taskEditorDraft.startDate"
                      type="date"
                      class="modal-task-link-field"
                      :min="getTaskStartMinDate()"
                      :max="getTaskStartMaxDate()"
                    >
                  </label>
                  <label class="modal-task-link-label modal-task-date-label">
                    Дата окончания
                    <input
                      v-model="taskEditorDraft.releaseDate"
                      type="date"
                      class="modal-task-link-field"
                      :min="getTaskEndMinDate()"
                      :max="getTaskEndMaxDate()"
                    >
                  </label>
                </div>

                <label class="modal-task-link-label">Оценка часов</label>
                <div class="modal-task-link-row">
                  <input
                    v-model.number="taskEditorDraft.effort"
                    type="number"
                    class="modal-task-link-field modal-task-effort-field"
                    min="0"
                    step="1"
                    placeholder="0"
                  >
                </div>

                <div class="modal-task-link-actions modal-task-editor-actions">
                  <button type="button" class="btn btn-text" @click="cancelTaskEditor">
                    Отмена
                  </button>
                  <button type="button" class="btn btn-text btn-clear-link-inline" @click="clearTaskEditorLink">
                    Очистить ссылку
                  </button>
                  <button type="button" class="btn btn-secondary" @click="saveTaskEditor(task)">
                    Сохранить
                  </button>
                </div>
              </div>
            </div>
            
            <div v-if="!editingBlock.tasks || editingBlock.tasks.length === 0" class="modal-tasks-empty">
              <span>📭 Нет задач</span>
              <span class="empty-hint">{{ isReadOnly ? 'Только просмотр' : 'Нажмите "+ Добавить задачу"' }}</span>
            </div>
          </div>
          
          <div class="tasks-total-effort" v-if="editingBlock.tasks && editingBlock.tasks.length > 0">
            <span class="total-label">Сумма по задачам:</span>
            <span class="total-value">{{ getTotalTasksEffort() }} ч</span>
          </div>
        </div>
      </div>
      
      <div class="modal-footer">
        <button v-if="!isReadOnly" class="btn btn-danger" @click="handleDelete">🗑️ Удалить</button>
        <div class="footer-actions">
          <button class="btn btn-text" @click="handleClose">{{ isReadOnly ? 'Закрыть' : 'Отмена' }}</button>
          <button v-if="!isReadOnly" class="btn btn-secondary" @click="handleSave">Сохранить</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, nextTick } from 'vue'
import axios from 'axios'
import { useAuth } from '@/composables/useAuth'
import { useProjects } from '@/composables/useProjects'
import {
  normalizeTasksArray,
  removePredecessorIdFromAllTasks
} from '@/utils/taskModel'

// Модалка редактирует один этап целиком (поля этапа + вложенные задачи).
const props = defineProps({
  block: {
    type: Object,
    default: null
  }
})

// close — закрытие, save — сохранить этап, delete — удалить этап.
const emit = defineEmits(['close', 'save', 'delete'])

// Глобальные зависимости: API/auth режим и список проектов для привязки этапа.
const { API_URL, isReadOnly } = useAuth()
const { projects, activeProjectId, loadProjects } = useProjects()
const owners = ref([])
/** id задачи, для которой открыта мини-панель редактирования. */
const taskEditorTaskId = ref(null)

// Черновик mini-редактора задачи (ссылка/даты/оценка) внутри модалки этапа.
const taskEditorDraft = ref({
  linkUrl: '',
  startDate: '',
  releaseDate: '',
  effort: 0
})
const isEditingBlockEffort = ref(false)
const effortBeforeEdit = ref(0)
const effortInlineInput = ref(null)

// Контроль pointer-состояния оверлея, чтобы не закрывать модалку при drag-жестах.
const overlayPointerState = ref({
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  moved: false
})

// Нормализаторы ссылок и дат для защиты модели от "грязных" значений.
const normalizeLinkUrl = (raw) => {
  if (!raw || typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

const hasTaskLinkUrl = (task) => Boolean(normalizeLinkUrl(task?.linkUrl || ''))
const openTaskLink = (task) => {
  const url = normalizeLinkUrl(task?.linkUrl || '')
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

const normalizeDateValue = (value) => {
  if (!value || typeof value !== 'string') return ''
  const trimmed = value.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : ''
}

const normalizeTaskDateRange = (startDateRaw, releaseDateRaw) => {
  let startDate = normalizeDateValue(startDateRaw)
  let releaseDate = normalizeDateValue(releaseDateRaw)
  if (startDate && releaseDate && startDate > releaseDate) {
    releaseDate = startDate
  }
  return { startDate, releaseDate }
}

const clampTaskDatesToStage = (startDateRaw, releaseDateRaw) => {
  const stageStart = normalizeDateValue(editingBlock.value.startDate)
  const stageEnd = normalizeDateValue(editingBlock.value.releaseDate)

  let startDate = normalizeDateValue(startDateRaw)
  let releaseDate = normalizeDateValue(releaseDateRaw)

  if (stageStart && startDate && startDate < stageStart) startDate = stageStart
  if (stageEnd && startDate && startDate > stageEnd) startDate = stageEnd
  if (stageStart && releaseDate && releaseDate < stageStart) releaseDate = stageStart
  if (stageEnd && releaseDate && releaseDate > stageEnd) releaseDate = stageEnd

  if (startDate && releaseDate && startDate > releaseDate) {
    releaseDate = startDate
  }

  return { startDate, releaseDate }
}

// Границы date-input задач считаются от дат этапа и текущего draft.
const getTaskStartMinDate = () => normalizeDateValue(editingBlock.value.startDate)
const getTaskStartMaxDate = () => {
  const stageEnd = normalizeDateValue(editingBlock.value.releaseDate)
  const draftEnd = normalizeDateValue(taskEditorDraft.value.releaseDate)
  return draftEnd || stageEnd
}
const getTaskEndMinDate = () => {
  const stageStart = normalizeDateValue(editingBlock.value.startDate)
  const draftStart = normalizeDateValue(taskEditorDraft.value.startDate)
  return draftStart || stageStart
}
const getTaskEndMaxDate = () => normalizeDateValue(editingBlock.value.releaseDate)

// Открывает inline-панель редактирования выбранной задачи и инициализирует draft.
const openTaskEditor = (task) => {
  if (isReadOnly.value) return
  if (taskEditorTaskId.value === task.id) {
    taskEditorTaskId.value = null
    return
  }
  taskEditorTaskId.value = task.id
  const { startDate, releaseDate } = clampTaskDatesToStage(task.startDate, task.releaseDate)
  taskEditorDraft.value = {
    linkUrl: task.linkUrl || '',
    startDate,
    releaseDate,
    effort: Number.isFinite(Number(task.effort)) ? Number(task.effort) : 0
  }
  focusTaskEditorLinkInput()
}

const focusTaskEditorLinkInput = async () => {
  await nextTick()
  if (!taskEditorTaskId.value) return
  const el = document.getElementById(`task-editor-link-${taskEditorTaskId.value}`)
  if (!el) return
  el.focus({ preventScroll: true })
  if (typeof el.select === 'function') el.select()
}

const cancelTaskEditor = () => {
  taskEditorTaskId.value = null
}

const clearTaskEditorLink = () => {
  taskEditorDraft.value.linkUrl = ''
}

const saveTaskEditor = (task) => {
  if (isReadOnly.value) return
  const { startDate, releaseDate } = clampTaskDatesToStage(
    taskEditorDraft.value.startDate,
    taskEditorDraft.value.releaseDate
  )
  task.linkUrl = normalizeLinkUrl(taskEditorDraft.value.linkUrl)
  task.startDate = startDate
  task.releaseDate = releaseDate
  task.effort = Math.max(0, Number(taskEditorDraft.value.effort) || 0)
  taskEditorTaskId.value = null
}

const onTaskTitleClickInModal = (task) => {
  if (isReadOnly.value) {
    if (hasTaskLinkUrl(task)) openTaskLink(task)
    return
  }
  if (hasTaskLinkUrl(task)) {
    openTaskLink(task)
    return
  }
  startTaskEditInModal(task)
}

// Локальная копия этапа: редактируем безопасно, не мутируя props.block напрямую.
const editingBlock = ref({
  id: '',
  title: '',
  description: '',
  startDate: '',
  releaseDate: '',
  effort: 0,
  ownerUsername: '',
  projectId: '',
  completed: false,
  tasks: []
})

// Синхронизация локальной копии с входным этапом при открытии/смене модалки.
watch(() => props.block, (newBlock) => {
  taskEditorTaskId.value = null
  isEditingBlockEffort.value = false
  if (newBlock) {
    editingBlock.value = JSON.parse(JSON.stringify(newBlock)) // глубокое копирование
    // Убедимся, что tasks существует и у задач есть isEditingInModal
    if (!editingBlock.value.tasks) {
      editingBlock.value.tasks = []
    } else {
      editingBlock.value.tasks = normalizeTasksArray(editingBlock.value.tasks)
    }
    editingBlock.value.tasks.forEach(task => {
      task.isEditingInModal = false
    })
    if (!editingBlock.value.ownerUsername && owners.value.length) {
      editingBlock.value.ownerUsername = owners.value[0].username
    }
    if (!editingBlock.value.projectId) {
      editingBlock.value.projectId = activeProjectId.value || projects.value[0]?.id || ''
    }
  }
}, { immediate: true, deep: true })

// Справочники для формы этапа: владельцы и проекты.
const loadOwners = async () => {
  try {
    const response = await axios.get(`${API_URL}/users`, { timeout: 12000 })
    owners.value = Array.isArray(response.data) ? response.data : []
    if (!editingBlock.value.ownerUsername && owners.value.length) {
      editingBlock.value.ownerUsername = owners.value[0].username
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки владельцев:', error)
    owners.value = []
  }
}

onMounted(loadOwners)
onMounted(loadProjects)

watch(projects, (list) => {
  if (!editingBlock.value || editingBlock.value.projectId) return
  editingBlock.value.projectId = activeProjectId.value || list?.[0]?.id || ''
}, { deep: true })

// Локальные helper-методы отображения статусов задач в модалке этапа.
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

const getNextStatus = (currentStatus) => {
  switch(currentStatus) {
    case 'todo': return 'progress'
    case 'progress': return 'done'
    case 'done': return 'todo'
    default: return 'todo'
  }
}

const normalizeBlockEffort = () => {
  const raw = Number(editingBlock.value?.effort)
  if (!Number.isFinite(raw)) {
    editingBlock.value.effort = 0
    return
  }
  editingBlock.value.effort = Math.max(0, Math.min(1000, Math.round(raw)))
}

const startBlockEffortEdit = () => {
  if (isReadOnly.value) return
  effortBeforeEdit.value = Number(editingBlock.value?.effort) || 0
  isEditingBlockEffort.value = true
  nextTick(() => {
    const el = effortInlineInput.value
    if (!el) return
    el.focus({ preventScroll: true })
    if (typeof el.select === 'function') el.select()
  })
}

const finishBlockEffortEdit = () => {
  normalizeBlockEffort()
  isEditingBlockEffort.value = false
}

const cancelBlockEffortEdit = () => {
  editingBlock.value.effort = effortBeforeEdit.value
  isEditingBlockEffort.value = false
}

// CRUD задач внутри модалки этапа (без обращения к API до финального Save).
const addTaskInModal = () => {
  if (isReadOnly.value) return
  const newTask = {
    id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    title: 'Новая задача',
    linkUrl: '',
    linkNote: '',
    status: 'todo',
    effort: 0,
    order: editingBlock.value.tasks ? editingBlock.value.tasks.length : 0,
    predecessorIds: []
  }
  
  if (!editingBlock.value.tasks) editingBlock.value.tasks = []
  editingBlock.value.tasks.push(newTask)
}

const cycleTaskStatusInModal = (task) => {
  if (isReadOnly.value) return
  task.status = getNextStatus(task.status || 'todo')
}

const startTaskEditInModal = (task) => {
  if (isReadOnly.value) return
  if (editingBlock.value.tasks) {
    editingBlock.value.tasks.forEach(t => {
      if (t.id !== task.id) {
        t.isEditingInModal = false
        delete t.editValue
      }
    })
  }
  
  task.isEditingInModal = true
  task.editValue = task.title
  
  setTimeout(() => {
    const inputs = document.querySelectorAll('.modal-task-input')
    if (inputs.length > 0) {
      inputs[inputs.length - 1].focus()
    }
  }, 50)
}

const saveTaskEditInModal = (task) => {
  if (isReadOnly.value) return
  if (!task.editValue || task.editValue.trim() === '') {
    task.isEditingInModal = false
    delete task.editValue
    return
  }
  
  task.title = task.editValue.trim()
  task.isEditingInModal = false
  delete task.editValue
}

const cancelTaskEditInModal = (task) => {
  if (isReadOnly.value) return
  task.isEditingInModal = false
  delete task.editValue
}

const deleteTaskInModal = (task) => {
  if (isReadOnly.value) return
  if (!editingBlock.value.tasks) return
  if (taskEditorTaskId.value === task.id) {
    taskEditorTaskId.value = null
  }
  const index = editingBlock.value.tasks.findIndex(t => t.id === task.id)
  if (index === -1) return
  editingBlock.value.tasks.splice(index, 1)
  editingBlock.value.tasks = removePredecessorIdFromAllTasks(
    editingBlock.value.tasks,
    task.id
  )
}

const getTotalTasksEffort = () => {
  if (!editingBlock.value.tasks || editingBlock.value.tasks.length === 0) return 0
  return editingBlock.value.tasks.reduce((sum, task) => sum + (task.effort || 0), 0)
}

// Основные действия модалки: сохранить/удалить/закрыть + pointer-логика оверлея.
const handleSave = () => {
  if (isReadOnly.value) return
  const block = JSON.parse(JSON.stringify(editingBlock.value))
  if (block.tasks?.length) {
    block.tasks = block.tasks.map((t) => ({
      ...t,
      linkUrl: normalizeLinkUrl(t.linkUrl),
      linkNote: typeof t.linkNote === 'string' ? t.linkNote.trim() : '',
      ...normalizeTaskDateRange(t.startDate, t.releaseDate),
      effort: Math.max(0, Number(t.effort) || 0)
    }))
  }
  taskEditorTaskId.value = null
  emit('save', block)
}

const handleDelete = () => {
  if (isReadOnly.value) return
  if (editingBlock.value && editingBlock.value.id) {
    // Убираем confirm
    emit('delete', editingBlock.value.id)
  }
}

const onOverlayPointerDown = (event) => {
  overlayPointerState.value = {
    active: true,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    moved: false
  }
}

const onOverlayPointerMove = (event) => {
  const state = overlayPointerState.value
  if (!state.active || state.pointerId !== event.pointerId) return
  const dx = Math.abs(event.clientX - state.startX)
  const dy = Math.abs(event.clientY - state.startY)
  if (dx > 4 || dy > 4) {
    state.moved = true
  }
}

const onOverlayPointerUp = (event) => {
  const state = overlayPointerState.value
  if (!state.active || state.pointerId !== event.pointerId) return
  const shouldClose = !state.moved
  overlayPointerState.value = {
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    moved: false
  }
  if (shouldClose) handleClose()
}

const onOverlayPointerCancel = () => {
  overlayPointerState.value = {
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    moved: false
  }
}

const handleClose = () => {
  taskEditorTaskId.value = null
  emit('close')
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.modal {
  background: white;
  border-radius: 12px;
  padding: 24px;
  width: 90%;
  max-width: 1000px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 40px rgba(0,0,0,0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e2e8f0;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.5rem;
  color: #0f172a;
}
.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #64748b;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #ef4444;
}

.modal-two-columns {
  display: flex;
  gap: 32px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.modal-left {
  flex: 1;
  min-width: 280px;
}

.modal-right {
  flex: 1;
  min-width: 280px;
  display: flex;
  flex-direction: column;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: #475569;
  margin-bottom: 4px;
  text-transform: uppercase;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: inherit;
  transition: border-color 0.2s;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
}

.form-row .form-group {
  min-width: 0;
}

.form-row .form-group input[type="date"] {
  width: 100%;
  max-width: 100%;
  padding: 6px 28px 6px 8px;
  font-size: 0.78rem;
  line-height: 1.2;
  box-sizing: border-box;
}

.effort-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.effort-controls {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.effort-inline-input {
  width: 54px;
  min-width: 54px;
  max-width: 54px;
  box-sizing: border-box;
  padding: 0;
  font-size: 0.82rem;
  text-align: right;
  border: 1px solid #fdba74;
  border-radius: 6px;
  color: #f97316;
  font-weight: 600;
  background: #fff7ed;
  -moz-appearance: textfield;
}

.effort-inline-input::-webkit-outer-spin-button,
.effort-inline-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.effort-inline-input:focus {
  border-color: #fb923c;
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.18);
}

.effort-value {
  font-weight: 600;
  color: #f97316;
  min-width: 54px;
  text-align: right;
}

.effort-value-editable {
  cursor: text;
  border-bottom: 1px dashed rgba(249, 115, 22, 0.5);
}

.effort-value-editable:hover {
  color: #ea580c;
}

.form-group input.effort-range {
  width: 100%;
  height: 8px;
  margin: 0;
  padding: 0;
  position: absolute;
  inset: 0;
  -webkit-appearance: none;
  appearance: none;
  background: transparent !important;
  z-index: 2;
  cursor: pointer;
  outline: none !important;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  opacity: 1;
}
.form-group input.effort-range:focus,
.form-group input.effort-range:focus-visible {
  outline: none !important;
  border: none !important;
  box-shadow: none !important;
}
.effort-range::-webkit-slider-runnable-track {
  height: 8px;
  background: transparent;
  border: none;
}
.effort-range::-moz-range-track {
  height: 8px;
  background: transparent;
  border: none;
}
.effort-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.78);
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.12);
  margin-top: -4px;
}
.effort-range::-moz-range-thumb {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.78);
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.12);
}
.effort-gradient-wrap {
  margin-top: 8px;
  position: relative;
}
.effort-gradient-track {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(90deg, #22c55e 0%, #eab308 55%, #ef4444 100%);
}
.effort-gradient-labels {
  margin-top: 6px;
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  color: #64748b;
}

.tasks-header-modal {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.tasks-header-modal label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
}

.btn-add-task-modal {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 0.7rem;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-add-task-modal:hover {
  background: #2563eb;
}

.modal-tasks-list {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #ffffff;
  flex: 1;
}

.modal-task-wrap {
  border-bottom: 1px solid #e2e8f0;
}

.modal-task-wrap:last-child {
  border-bottom: none;
}

.modal-task-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
}

.modal-task-status {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 14px;
  flex-shrink: 0;
  transition: transform 0.2s;
}

.modal-task-status:hover {
  background: #e2e8f0;
  transform: scale(1.1);
}

.modal-task-content {
  flex: 1;
  min-width: 0;
}

.modal-task-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.modal-task-title {
  font-size: 0.9rem;
  color: #1e293b;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  flex: 1;
}

.modal-task-title:hover {
  background: #e2e8f0;
  color: #3b82f6;
}
.modal-task-title.has-link {
  color: #1d4ed8;
  text-decoration: underline;
}
.modal-task-title.has-link:hover {
  background: #eff6ff;
  color: #1d4ed8;
}

.modal-task-effort {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #f1f5f9;
  padding: 4px 8px;
  border-radius: 20px;
}

.task-effort-input {
  width: 50px;
  padding: 4px 6px;
  border: none;
  background: transparent;
  font-size: 0.75rem;
  font-weight: 500;
  color: #f97316;
  text-align: right;
  outline: none;
}

.task-effort-value {
  font-size: 0.75rem;
  font-weight: 600;
  color: #f97316;
}

.modal-task-deps {
  margin-top: 8px;
  padding: 6px 8px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  font-size: 0.72rem;
  color: #475569;
}

.deps-label {
  font-weight: 600;
  color: #64748b;
  margin-right: 4px;
}

.dep-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
}

.dep-checkbox input {
  accent-color: #94a3b8;
}

.dep-checkbox-title {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-task-edit-area {
  width: 100%;
}

.modal-task-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #3b82f6;
  border-radius: 8px;
  font-size: 0.85rem;
  outline: none;
  background: white;
  resize: vertical;
  font-family: inherit;
}

.modal-task-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s;
}

.modal-task-item:hover .modal-task-actions {
  opacity: 1;
}

.modal-task-link,
.modal-task-edit,
.modal-task-delete {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  font-size: 0.8rem;
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.modal-task-link:hover {
  background: #e0f2fe;
  color: #0369a1;
}

.modal-task-link.active {
  background: #bae6fd;
  color: #0c4a6e;
}

.modal-task-edit:hover {
  background: transparent;
  color: inherit;
}

.modal-task-edit.active {
  background: transparent;
  color: inherit;
}

.modal-task-edit {
  width: auto;
  height: auto;
  padding: 0;
  border-radius: 0;
}

.modal-task-edit-icon {
  width: 14px;
  height: 14px;
  display: block;
  transition: transform 0.14s ease;
}

.modal-task-edit:hover .modal-task-edit-icon,
.modal-task-edit.active .modal-task-edit-icon {
  transform: scale(1.08);
}

.modal-task-delete:hover {
  background: #fee2e2;
  color: #ef4444;
}

.modal-task-link-panel {
  margin: 4px 0 2px;
  padding: 4px 6px;
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
}

.modal-task-editor-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.modal-task-dates-row {
  margin-top: 2px;
}

.modal-task-date-label {
  margin-top: 0;
}

.modal-task-date-label input {
  margin-top: 4px;
}

.modal-task-link-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-task-link-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  margin-bottom: 4px;
  margin-top: 8px;
}

.modal-task-link-label:first-child {
  margin-top: 0;
}

.modal-task-link-field {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.9rem;
  box-sizing: border-box;
  font-family: inherit;
}

.btn-clear-link {
  width: 28px;
  height: 28px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fff1f2;
  color: #ef4444;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}

.btn-clear-link:hover:not(:disabled) {
  background: #ffe4e6;
}

.btn-clear-link:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.modal-task-link-field:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.modal-task-link-actions {
  margin-top: 10px;
}

.modal-task-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-clear-link-inline {
  border-color: #fecaca;
  color: #b91c1c;
  background: #fff1f2;
}

.btn-clear-link-inline:hover {
  background: #ffe4e6;
  color: #991b1b;
}

.btn-open-link {
  padding: 6px 12px;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 8px;
  border: 1px solid #3b82f6;
  background: #eff6ff;
  color: #1d4ed8;
  cursor: pointer;
}

.btn-open-link.btn-ghost {
  border-color: #cbd5e1;
  color: #475569;
  background: #ffffff;
}

.btn-open-link.btn-clear {
  border-color: #fecaca;
  color: #b91c1c;
  background: #fff1f2;
}

.btn-open-link:hover:not(:disabled) {
  background: #dbeafe;
}

.btn-open-link.btn-ghost:hover:not(:disabled) {
  background: #f8fafc;
}

.btn-open-link.btn-clear:hover:not(:disabled) {
  background: #ffe4e6;
}

.btn-open-link:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.modal-tasks-empty {
  padding: 40px 20px;
  text-align: center;
  color: #94a3b8;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-hint {
  font-size: 0.7rem;
  opacity: 0.7;
}

.tasks-total-effort {
  margin-top: 16px;
  padding: 10px 14px;
  background: #f8fafc;
  border-radius: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
}

.total-value {
  color: #f97316;
  font-weight: 700;
  font-size: 1rem;
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e2e8f0;
  gap: 12px;
  flex-wrap: wrap;
}

.btn {
  padding: 8px 20px;
  font-size: 0.85rem;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-danger {
  background: #fee2e2;
  color: #ef4444;
  border: 1px solid #fecaca;
}

.btn-danger:hover {
  background: #fecaca;
  color: #dc2626;
}

.btn-text {
  background: transparent;
  color: #64748b;
  border: 1px solid #e2e8f0;
}

.btn-text:hover {
  background: #f1f5f9;
  color: #1e293b;
}

.btn-secondary {
  background: #3b82f6;
  color: white;
}

.btn-secondary:hover {
  background: #2563eb;
}

.footer-actions {
  display: flex;
  gap: 12px;
}
</style>