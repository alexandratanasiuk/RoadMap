<template>
  <div
    class="block"
    :style="style"
    :class="{ completed: block.completed, editing: block.editing }"
    :data-block-id="block.id"
  >
    <div
      class="block-header"
      :class="{ 'header-readonly': readOnly }"
      :draggable="!readOnly"
      @dragstart="onBlockDragStart"
      @dragend="onBlockDragEnd"
    >
      <div class="block-title-container" @click.stop="onTitleClick">
        <span class="block-priority" :class="getPriorityClass(block.effort)">
          {{ getPriorityIcon(block.effort) }}
        </span>
        <div class="block-title-wrapper">
          <h3 class="block-title">{{ block.title }}</h3>
        </div>
      </div>
    </div>

    <div class="block-tasks">
      <div class="tasks-header">
        <span class="tasks-title">📋 Задачи</span>
        <button
          v-if="!readOnly"
          class="add-task-btn"
          @click.stop="$emit('add-task')"
          aria-label="Добавить задачу"
          data-tooltip="Добавить задачу"
        >+</button>
      </div>

      <div
        class="tasks-list"
        v-if="block.tasks && block.tasks.length > 0"
        @dragover.prevent
        @drop.prevent="onDropTask($event, null)"
      >
        <DynamicScroller
          :items="sortedTasks"
          :min-item-size="45"
          :buffer="100"
          class="tasks-virtual-scroller"
          key-field="id"
        >
          <template #default="{ item: task, active }">
            <DynamicScrollerItem :item="task" :active="active">
              <TaskItem
                :task="task"
                :block="block"
                :read-only="readOnly"
                :drag-over="dragOverTask?.id === task.id"
                :dragging="draggedTask?.id === task.id"
                @cycle-status="(e) => $emit('cycle-task-status', task, e)"
                @open-card="openTaskCard(task)"
                @start-edit="() => $emit('start-task-edit', task)"
                @save-edit="(e) => $emit('save-task-edit', task, e)"
                @cancel-edit="() => $emit('cancel-task-edit', task)"
                @delete="() => $emit('delete-task', task)"
                @drag-start="(e) => $emit('task-drag-start', e, block, task)"
                @drag-end="$emit('task-drag-end')"
                @drag-over="(e) => $emit('task-drag-over', e)"
                @drop="(e) => $emit('task-drop', e, block, task)"
                @drag-enter="() => $emit('task-drag-enter', block, task)"
                @drag-leave="(e) => $emit('task-drag-leave', e)"
              />
            </DynamicScrollerItem>
          </template>
        </DynamicScroller>
      </div>

      <div
        v-else
        class="tasks-empty"
        @dragover.prevent
        @drop.prevent="onDropTask($event, null)"
      >
        <span class="empty-text">Нет задач (перетащите сюда)</span>
      </div>

    </div>

    <div class="task-progress" v-if="block.tasks && block.tasks.length > 0">
      <div class="progress-header">
        <span class="progress-label">Прогресс этапа</span>
        <span class="progress-value">{{ taskProgress }}% ({{ completedTasksCount }}/{{ block.tasks.length }})</span>
      </div>
      <div class="progress-bar-container">
        <div
          class="progress-bar-fill"
          :style="{
            width: taskProgress + '%',
            backgroundColor: getProgressColor(taskProgress)
          }"
        ></div>
      </div>
    </div>
    <div class="task-progress empty" v-else>
      <div class="progress-header">
        <span class="progress-label">Прогресс этапа</span>
        <span class="progress-value">0%</span>
      </div>
      <div class="progress-bar-container">
        <div class="progress-bar-fill" style="width: 0%;"></div>
      </div>
    </div>

    <div class="block-effort-summary" :style="{ background: getEffortColor(block.effort, 0.15) }">
      <span class="effort-icon">⚡</span>
      <span class="effort-label">Трудозатраты:</span>
      <span class="effort-value">{{ block.effort || 0 }} / {{ totalTasksEffort }} ч</span>
    </div>

    <div class="block-release" v-if="!block.editingDate">
      <span class="release-icon">📅</span>
      <span class="release-date" :class="{ 'is-readonly': readOnly }" @click.stop="onReleaseClick">
        {{ formatDate(block.releaseDate) }}
      </span>
    </div>
    <div class="block-date-editor" v-else>
      <input
        ref="dateInputRef"
        type="date"
        v-model="block.editDateValue"
        @change="$emit('save-date')"
        @blur="$emit('cancel-edit-date')"
        @click.stop
      />
    </div>
  </div>
</template>

<script setup>
import { computed, inject, unref, ref, watch, nextTick } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import TaskItem from './TaskItem.vue'
import { useBlocks } from '@/composables/useBlocks'

// Входные данные карточки этапа + состояние DnD задач, приходящее от родителя.
const props = defineProps({
  block: { type: Object, required: true },
  style: { type: Object, default: () => ({}) },
  dragOverTask: { type: Object, default: null },
  draggedTask: { type: Object, default: null }
})

// События наружу: редактирование этапа/задач, DnD и редактирование даты этапа.
const emit = defineEmits([
  'edit-block',
  'add-task',
  'cycle-task-status',
  'start-task-edit',
  'save-task-edit',
  'cancel-task-edit',
  'delete-task',
  'task-drag-start',
  'task-drag-end',
  'task-drag-over',
  'task-drop',
  'task-drag-enter',
  'task-drag-leave',
  'open-task-card',
  'block-drag-start',
  'block-drag-end',
  'start-edit-date',
  'save-date',
  'cancel-edit-date'
])

// Декоративные и расчетные helpers этапа из общего composable.
const { getPriorityClass, getPriorityIcon, getEffortColor, getProgressColor, getTaskProgress, getCompletedTasksCount } = useBlocks()

// Глобальный read-only режим (например, роль guest), передается через provide/inject.
const readOnlyInjected = inject('readOnly', computed(() => false))
const readOnly = computed(() => Boolean(unref(readOnlyInjected)))

// Ссылка на input даты, чтобы программно открыть picker при переходе в режим редактирования.
const dateInputRef = ref(null)

// Фокусирует input и пытается открыть нативный календарь (если поддерживается браузером).
const openDatePicker = async () => {
  await nextTick()
  const input = dateInputRef.value
  if (!input) return
  input.focus({ preventScroll: true })
  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker()
    } catch {
      // some browsers may block showPicker() without user gesture
    }
  }
}

// Когда родитель включает block.editingDate, сразу открываем календарь.
watch(
  () => props.block?.editingDate,
  (isEditing) => {
    if (isEditing) openDatePicker()
  }
)

// Клик по заголовку открывает модалку редактирования этапа.
const onTitleClick = () => {
  emit('edit-block')
}

// Клик по дате переводит этап в режим редактирования даты (только не в read-only).
const onReleaseClick = () => {
  if (readOnly.value) return
  emit('start-edit-date')
}

// Открывает карточку конкретной задачи.
const openTaskCard = (task) => {
  if (readOnly.value) return
  emit('open-task-card', task)
}

// Стабильный порядок задач внутри этапа по полю order.
const sortedTasks = computed(() => {
  if (!props.block.tasks) return []
  return [...props.block.tasks].sort((a, b) => (a.order || 0) - (b.order || 0))
})

// Агрегаты для шапки прогресса и блока трудозатрат.
const taskProgress = computed(() => getTaskProgress(props.block))
const completedTasksCount = computed(() => getCompletedTasksCount(props.block))
const totalTasksEffort = computed(() => {
  if (!props.block.tasks || props.block.tasks.length === 0) return 0
  return props.block.tasks.reduce((sum, task) => sum + (task.effort || 0), 0)
})

// Формат даты для компактного отображения в карточке (dd.mm.yyyy).
const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear()
  return `${day}.${month}.${year}`
}

// Пробрасывает drop в родителя вместе с текущим этапом и целевой задачей (или null в конец списка).
const onDropTask = (event, targetTask) => {
  emit('task-drop', event, props.block, targetTask)
}

// Старт DnD этапа: блокируем перетаскивание в read-only и при попытке тянуть за кнопку.
const onBlockDragStart = (event) => {
  if (readOnly.value) {
    event.preventDefault()
    return
  }
  if (event.target.tagName === 'BUTTON') {
    event.preventDefault()
    return
  }
  emit('block-drag-start', event, props.block)
}

// Сигнал родителю о завершении DnD этапа.
const onBlockDragEnd = () => {
  emit('block-drag-end')
}
</script>

<style scoped>
/* Стили копируем из App.vue, адаптируем под scoped */
.block {
  position: absolute;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.02);
  transition: all 0.15s;
  z-index: 50;
  cursor: pointer;
  box-sizing: border-box;
  overflow: visible !important;
  font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
  font-weight: 400;
}
.block:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  z-index: 21;
}
.block-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 6px;
  cursor: grab;
  user-select: none;
  padding: 4px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.5);
}
.block-header:active { cursor: grabbing; }
.block-header:hover { background: rgba(59, 130, 246, 0.1); }
.block-header.header-readonly {
  cursor: default;
}
.block-header.header-readonly:hover {
  background: rgba(255, 255, 255, 0.5);
}
.block-title-container {
  display: flex;
  gap: 4px;
  flex: 1;
}
.block-priority { font-size: 0.9rem; width: 14px; text-align: center; }
.priority-low { color: #22c55e; }
.priority-medium { color: #eab308; }
.priority-high { color: #f97316; }
.priority-critical { color: #ef4444; animation: pulse 1.5s infinite; }
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
.block-title {
  font-family: 'Montserrat', sans-serif;
  font-weight: 600;
  font-size: 0.9rem;
  color: #0f172a;
  word-break: break-word;
  line-height: 1.3;
  margin: 0;
}
.block-badge {
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 30px;
  font-size: 0.7rem;
  font-weight: 600;
  white-space: nowrap;
  margin-left: 4px;
}
.block-effort-summary {
  margin-top: 8px;
  margin-bottom: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
}
.block-effort-summary .effort-label {
  color: #475569;
  font-weight: 600;
}
.block-effort-summary .effort-value {
  margin-left: auto;
  color: #0f172a;
  font-weight: 700;
}
.block-description {
  font-size: 0.75rem;
  color: #475569;
  margin-bottom: 6px;
  line-height: 1.3;
}
.block-release {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  margin-bottom: 6px;
  font-size: 0.7rem;
  color: #64748b;
  background: #f8fafc;
  padding: 4px 8px;
  border-radius: 6px;
}
.release-date {
  font-weight: 500;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
}
.release-date:hover { background: #e2e8f0; }
.release-date.is-readonly {
  cursor: default;
  pointer-events: none;
}
.block.completed {
  opacity: 0.6;
  background: #f8fafc !important;
  border-color: #cbd5e1;
}
.block-date-editor input[type="date"] {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  display: block;
  padding: 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.74rem;
  background: #f8fafc;
  color: #334155;
  outline: none;
}
.block-date-editor input[type="date"]:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.12);
  background: white;
}
.block-tasks {
  margin: 8px 0;
  padding: 6px 8px;
  background: #ffffff;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}
.tasks-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.tasks-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
}
.add-task-btn {
  width: 25px;
  height: 25px;
  border-radius: 15px;
  border: 1px solid #3b82f6;
  background: white;
  color: #3b82f6;
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.add-task-btn:hover { background: #3b82f6; color: white; }
.add-task-btn[data-tooltip]:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.98);
  color: #1e293b;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 0.68rem;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.12);
  z-index: 40;
  pointer-events: none;
}
.tasks-list { max-height: 900px; overflow-y: auto; }
.tasks-empty {
  min-height: 40px;
  border: 2px dashed #cbd5e1;
  border-radius: 6px;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
}
.empty-text { font-size: 0.7rem; color: #475569; font-style: italic; }
.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-size: 0.7rem;
}
.progress-label { color: #475569; font-weight: 500; text-transform: uppercase; }
.progress-value {
  color: #0f172a;
  font-weight: 600;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 12px;
}
.progress-bar-container {
  height: 6px;
  background: #f1f5f9;
  border-radius: 3px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  transition: width 0.3s ease;
  border-radius: 3px;
}
</style>