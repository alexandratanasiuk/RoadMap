<template>
  <div class="horizontal-container" :class="{ 'is-resize-cursor': Boolean(resizingMonth) || isResizeHandleHover }">
    <!-- Шапка с месяцами -->
    <div class="horizontal-header" ref="horizontalHeader">
      <!-- Как у timeline-container + timeline-grid: отступ слева на внешнем блоке, координаты — внутри track -->
      <div class="horizontal-header-container" :style="{ width: visibleHorizontalTotalWidth + 'px' }">
        <div class="horizontal-header-track">
          <div 
            v-for="(month, idx) in visibleMonthsData" 
            :key="month.index"
            class="horizontal-month-cell"
            :style="{ 
              left: month.visibleStartX + 'px',
              width: month.width + 'px'
            }"
          >
            <div class="month-label">{{ month.label }}</div>
            <div class="month-days">{{ month.days }} дн.</div>
            <div
              v-if="idx === visibleMonthsData.length - 1 && trailingMonthControl && (trailingMonthControl.showExtend || trailingMonthControl.showCollapse)"
              class="horizontal-trailing-month-wrap"
              :style="trailingMonthButtonStyleInCell(month)"
            >
              <button
                v-if="trailingMonthControl.showExtend"
                type="button"
                class="horizontal-trailing-month-btn"
                title="Показать следующий пустой месяц"
                aria-label="Показать следующий пустой месяц"
                @click.stop.prevent="extendTrailingEmptyMonth"
              >
                ▸
              </button>
              <button
                v-else
                type="button"
                class="horizontal-trailing-month-btn horizontal-trailing-month-btn--collapse"
                title="Скрыть пустой месяц"
                aria-label="Скрыть пустой месяц"
                @click.stop.prevent="collapseTrailingEmptyMonth"
              >
                ‹
              </button>
            </div>
            <div
              class="horizontal-month-resize-handle"
              title="Потяните для изменения ширины месяца"
              @pointerenter="onResizeHandleEnter"
              @pointerleave="onResizeHandleLeave"
              @pointerdown.stop.prevent="onMonthResizePointerDown($event, month)"
            />
          </div>
        </div>
      </div>
      <button
        v-if="hasCustomMonthWidth"
        type="button"
        class="horizontal-reset-width-btn"
        title="Сбросить ширину месяцев"
        aria-label="Сбросить ширину месяцев"
        @click.stop.prevent="onResetMonthWidths"
      >
        <svg class="horizontal-reset-width-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4a8 8 0 1 1-7.2 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M3 4h5v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    <!-- Основной контент с прокруткой -->
    <div 
      class="timeline-wrapper" 
      ref="timelineWrapper" 
      @scroll="onTimelineScroll"
      @dragover="onGridDragOver"
      @drop="onGridDrop"
    >
      <div class="timeline-container" :style="{ width: visibleHorizontalTotalWidth + 'px' }">
        <div 
          class="timeline-grid"
          ref="timelineGrid"
          :style="{ height: totalHeight + 'px' }"
        >
          <!-- Линии для каждого дня (едва заметные) -->
          <div 
            v-for="day in visibleDays" 
            :key="'day-'+day.id"
            class="horizontal-day-line"
            :style="{ left: day.visibleCenterX + 'px' }"
          ></div>

          <!-- Линии начала каждого месяца (синие приглушенные) -->
          <div 
            v-for="month in visibleMonthPositions" 
            :key="'month-start-'+month.index"
            class="horizontal-month-line month-start"
            :style="{ left: month.visibleStartX + 'px' }"
            :title="'Начало ' + month.label"
          ></div>

          <!-- Линии конца каждого месяца (включая правый край последнего видимого) -->
          <div 
            v-for="month in visibleMonthPositions" 
            :key="'month-end-'+month.index"
            class="horizontal-month-line month-end"
            :style="{ left: month.visibleEndX + 'px' }"
            :title="'Конец ' + month.label"
          ></div>

          <!-- Полоса сегодняшнего дня -->
          <div 
            v-if="todayVisiblePosition > 0"
            class="today-line-horizontal"
            :style="{ left: todayVisiblePosition + 'px' }"
          >
            <div class="today-label-horizontal">Сегодня</div>
          </div>

          <!-- Блоки -->
          <BlockCard
            v-for="block in sortedBlocks"
            :key="block.id"
            :block="block"
            :style="getVisibleBlockStyle(block)"
            :class="{ 'block-dragging': isDraggingBlock && draggedBlockId === block.id }"
            :drag-over-task="dragOverTask"
            :dragged-task="draggedTask"
            @edit-block="$emit('editBlock', block)"
            @add-task="onAddTaskAndOpenModal(block)"
            @cycle-task-status="(task, event) => cycleTaskStatus(block, task, event)"
            @start-task-edit="(task) => startTaskEdit(block, task)"
            @save-task-edit="(task, event) => saveTaskEdit(block, task, event)"
            @cancel-task-edit="(task) => cancelTaskEdit(task)"
            @open-task-card="(task) => openTaskCardModal(block, task)"
            @delete-task="(task) => deleteTask(block, task)"
            @task-drag-start="onTaskDragStart"
            @task-drag-end="onTaskDragEnd"
            @task-drag-over="onTaskDragOver"
            @task-drop="onTaskDrop"
            @task-drag-enter="onTaskDragEnter"
            @task-drag-leave="onTaskDragLeave"
            @block-drag-start="onBlockDragStart"
            @block-drag-end="onBlockDragEnd"
            @start-edit-date="startEditingDate(block)"
            @save-date="saveDate(block)"
            @cancel-edit-date="cancelDateEdit(block)"
          />

          <!-- Слой с линиями для Drag & Drop -->
          <div class="lines-layer">
            <div 
              v-for="block in sortedBlocks" 
              :key="'line-'+block.id"
              class="timeline-line"
              :class="{ 'line-dragging-active': isDraggingLine && draggedLineBlock?.id === block.id }"
              :data-date="formatDate(block.releaseDate)"
              :data-block-id="block.id"
              :style="{ 
                left: (isDraggingLine && draggedLineBlock?.id === block.id) ? dragCurrentX + 'px' : getVisibleLinePosition(block) + 'px',
                top: '-30px',
                height: (getVisibleBlockTop(block) + 10) + 'px'
              }"
              draggable="true"
              @dragstart="onLineDragStart($event, block)"
              @dragend="onLineDragEnd"
            >
              <span class="line-dot"></span>
              <span 
                class="line-date"
                :class="{ 'line-date-dragging': isDraggingLine && draggedLineBlock?.id === block.id }"
                draggable="true"
                @dragstart="onLineDragStart($event, block)"
                @dragend="onLineDragEnd"
              >
                {{ (isDraggingLine && draggedLineBlock?.id === block.id) ? previewDate : formatDate(block.releaseDate) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <TaskCardModal
      v-if="taskCardModalOpen"
      :block="taskCardBlock"
      :task="taskCardTask"
      @close="closeTaskCardModal"
      @save="saveTaskCardModal"
      @delete="deleteTaskCardModal"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, inject, watch, nextTick } from 'vue'
import { useDates } from '@/composables/useDates'
import { useTasks } from '@/composables/useTasks'
import { useDragLines } from '@/composables/useDragLines'
import { useNotification } from '@/composables/useNotification'
import BlockCard from '@/components/common/Block.vue'
import TaskCardModal from '@/components/common/TaskCardModal.vue'

// Экран "По месяцам": месячная шкала с ресайзом, линиями сроков и DnD этапов/задач.
// Получаем данные от родителя через inject
const blocks = inject('blocks')
const blocksActions = inject('blocksActions')

const { 
  calculateBlockHeight, 
  getBlockBackgroundColor, 
  updateBlockDate
} = blocksActions

const { 
  getAbsoluteMonthIndexFromDate, 
  visibleMonthsData,
  visibleMonthPositions,
  visibleDays,
  visibleHorizontalTotalWidth, 
  todayVisiblePosition,
  extendTrailingEmptyMonth,
  collapseTrailingEmptyMonth,
  trailingMonthControl,
  hasCustomMonthWidth,
  setVisibleMonthWidth,
  resetVisibleMonthWidth
} = useDates()

const { 
  addTask, 
  cycleTaskStatus, 
  deleteTask,
  startTaskEdit,
  saveTaskEdit,
  cancelTaskEdit,
  saveTaskCard,
  draggedTask,
  dragOverTask,
  onTaskDragStart,
  onTaskDragEnd,
  onTaskDragOver,
  onTaskDragEnter,
  onTaskDragLeave,
  onTaskDrop
} = useTasks()

const { showNotificationMessage } = useNotification()

// Refs для DOM
const timelineWrapper = ref(null)
const horizontalHeader = ref(null)
const timelineGrid = ref(null)
const BLOCK_STACK_GAP = 190
const MONTH_TASK_EXTRA_HEIGHT = 18
const MONTH_STACK_START_TOP = 30
const measuredBlockHeights = ref({})
let blockResizeObserver = null
const resizingMonth = ref(null)
const isResizeHandleHover = ref(false)

// Состояние для перетаскивания блока
const draggedBlock = ref(null)
const isDraggingBlock = ref(false)
const draggedBlockId = ref(null)
const blockDragStartX = ref(0)
const blockDragStartY = ref(0)
const taskCardModalOpen = ref(false)
const taskCardBlock = ref(null)
const taskCardTask = ref(null)

const refreshMeasuredBlockHeights = async () => {
  await nextTick()
  const root = timelineGrid.value
  if (!root) return
  const nextHeights = {}
  root.querySelectorAll('.block[data-block-id]').forEach((node) => {
    const id = String(node.getAttribute('data-block-id') || '')
    if (!id) return
    nextHeights[id] = Math.ceil(node.getBoundingClientRect().height)
  })
  measuredBlockHeights.value = nextHeights
}

const observeMonthBlockHeights = () => {
  const root = timelineGrid.value
  if (!root || !blockResizeObserver) return
  blockResizeObserver.disconnect()
  root.querySelectorAll('.block[data-block-id]').forEach((node) => {
    blockResizeObserver.observe(node)
  })
}

const getMonthLayoutHeight = (block) => {
  const estimatedHeight = calculateBlockHeight(block)
  const tasksCount = Array.isArray(block?.tasks) ? block.tasks.length : 0
  const conservativeEstimatedHeight = estimatedHeight + tasksCount * MONTH_TASK_EXTRA_HEIGHT
  const measuredHeight = Number(measuredBlockHeights.value[String(block?.id)] || 0)
  return Math.max(conservativeEstimatedHeight, measuredHeight)
}

const openTaskCardModal = (block, task) => {
  if (!block || !task) return
  taskCardBlock.value = block
  taskCardTask.value = task
  taskCardModalOpen.value = true
}

const closeTaskCardModal = () => {
  taskCardModalOpen.value = false
  taskCardBlock.value = null
  taskCardTask.value = null
}

const saveTaskCardModal = async (patch) => {
  if (!taskCardBlock.value || !taskCardTask.value) return
  const result = await saveTaskCard(taskCardBlock.value, taskCardTask.value, patch)
  if (result?.success) {
    closeTaskCardModal()
    showNotificationMessage('✅ Карточка задачи сохранена', 'success')
  } else {
    showNotificationMessage(result?.message || '❌ Ошибка сохранения карточки задачи', 'error')
  }
}

const deleteTaskCardModal = async () => {
  if (!taskCardBlock.value || !taskCardTask.value) return
  const result = await deleteTask(taskCardBlock.value, taskCardTask.value)
  if (result?.success) {
    closeTaskCardModal()
    showNotificationMessage('🗑️ Задача удалена', 'success')
  } else {
    showNotificationMessage(result?.message || '❌ Ошибка удаления задачи', 'error')
  }
}

const onAddTaskAndOpenModal = async (block) => {
  if (!block) return
  const result = await addTask(block)
  if (!result?.success) return
  const freshBlock = (blocks?.value || []).find((item) => String(item?.id) === String(block.id)) || block
  const tasks = Array.isArray(freshBlock?.tasks) ? freshBlock.tasks : []
  if (!tasks.length) return
  const createdTask = tasks.find((item) => String(item?.id) === String(result?.newTaskId)) || tasks[tasks.length - 1]
  if (!createdTask) return
  openTaskCardModal(freshBlock, createdTask)
}

// Сортировка блоков по дате
const sortedBlocks = computed(() => {
  if (!blocks?.value) return []
  return [...blocks.value].sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate))
})

// Группировка блоков по месяцам для вертикального позиционирования
const blocksByMonth = computed(() => {
  const grouped = {}
  sortedBlocks.value.forEach(block => {
    if (!block.releaseDate) return
    const month = getAbsoluteMonthIndexFromDate(block.releaseDate)
    if (!grouped[month]) grouped[month] = []
    grouped[month].push(block)
  })
  
  Object.keys(grouped).forEach(monthKey => {
    let currentTop = MONTH_STACK_START_TOP
    grouped[monthKey].forEach((block) => {
      block.positionInMonth = currentTop
      currentTop += getMonthLayoutHeight(block) + BLOCK_STACK_GAP
    })
  })
  
  return grouped
})

// Вычисление общей высоты
const totalHeight = computed(() => {
  let maxHeight = 0
  Object.values(blocksByMonth.value).forEach(monthBlocks => {
    let monthHeight = 20
    monthBlocks.forEach(block => {
      monthHeight += getMonthLayoutHeight(block) + BLOCK_STACK_GAP
    })
    if (monthHeight > maxHeight) maxHeight = monthHeight
  })
  return Math.max(maxHeight + 50, 500)
})

// Получение позиции блока - ширина зависит от месяца, центрирование
const getVisibleBlockWidth = (block) => {
  if (!block.releaseDate) return 280
  const month = getAbsoluteMonthIndexFromDate(block.releaseDate)
  const monthData = visibleMonthsData.value.find(m => m.index === month)
  if (!monthData) return 280
  // По 5% отступа с каждой стороны внутри колонки месяца.
  return Math.max(220, Math.round(monthData.width * 0.9))
}

const getVisibleBlockLeft = (block) => {
  if (!block.releaseDate) return 0
  const month = getAbsoluteMonthIndexFromDate(block.releaseDate)
  const monthData = visibleMonthsData.value.find(m => m.index === month)
  if (!monthData) {
    return 0
  }
  const blockWidth = getVisibleBlockWidth(block)
  // Центрируем блок в месяце
  return monthData.visibleStartX + (monthData.width - blockWidth) / 2
}

const getVisibleBlockTop = (block) => {
  return block.positionInMonth || 20
}

const getVisibleBlockStyle = (block) => {
  const width = getVisibleBlockWidth(block)
  return {
    left: getVisibleBlockLeft(block) + 'px',
    top: getVisibleBlockTop(block) + 'px',
    width: width + 'px',
    backgroundColor: getBlockBackgroundColor(block),
    minHeight: calculateBlockHeight(block) + 'px'
  }
}

const getVisibleLinePosition = (block) => {
  if (!block.releaseDate) return 0
  const date = new Date(block.releaseDate)
  const month = getAbsoluteMonthIndexFromDate(block.releaseDate)
  const day = date.getDate()
  const targetDay = visibleDays.value.find(d => d.month === month && d.day === day)
  return targetDay ? targetDay.visibleCenterX : 0
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear()
  return `${day}.${month}.${year}`
}

// Перетаскивание блока за шапку
const onBlockDragStart = (event, block) => {
  event.stopPropagation()
  if (event.target.tagName === 'BUTTON') {
    event.preventDefault()
    return
  }
  
  draggedBlock.value = block
  draggedBlockId.value = block.id
  isDraggingBlock.value = true
  blockDragStartX.value = event.clientX
  blockDragStartY.value = event.clientY
  
  event.dataTransfer.setData('text/plain', JSON.stringify({
    blockId: block.id,
    type: 'block'
  }))
  event.dataTransfer.effectAllowed = 'move'
  
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  event.dataTransfer.setDragImage(canvas, 0, 0)
  
  document.body.classList.add('is-dragging')
}

const onBlockDragEnd = () => {
  draggedBlock.value = null
  draggedBlockId.value = null
  isDraggingBlock.value = false
  document.body.classList.remove('is-dragging')
}

// Drag & Drop lines
const { 
  draggedLineBlock, 
  isDraggingLine, 
  dragCurrentX, 
  previewDate, 
  onLineDragStart, 
  onGridDragOver, 
  onLineDragEnd, 
  onGridDrop
} = useDragLines(
  timelineWrapper, 
  getVisibleLinePosition, 
  getVisibleBlockLeft, 
  getAbsoluteMonthIndexFromDate, 
  visibleDays, 
  visibleMonthsData, 
  updateBlockDate, 
  calculateBlockHeight, 
  sortedBlocks, 
  showNotificationMessage
)

// Удаление блока
const startEditingDate = (block) => {
  block.editingDate = true
  block.editDateValue = block.releaseDate
}

const saveDate = async (block) => {
  if (!block.editDateValue) return

  const result = await updateBlockDate(block, block.editDateValue)
  if (result.success) {
    block.editingDate = false
    delete block.editDateValue
    showNotificationMessage('✅ Дата обновлена', 'success')
  } else {
    showNotificationMessage('❌ Ошибка обновления даты', 'error')
  }
}

const cancelDateEdit = (block) => {
  block.editingDate = false
  delete block.editDateValue
}

// Синхронизация скролла
const onTimelineScroll = () => {
  if (!timelineWrapper.value || !horizontalHeader.value) return
  const scrollLeft = timelineWrapper.value.scrollLeft
  horizontalHeader.value.scrollLeft = scrollLeft
}

const onHeaderScroll = () => {
  if (!timelineWrapper.value || !horizontalHeader.value) return
  const scrollLeft = horizontalHeader.value.scrollLeft
  timelineWrapper.value.scrollLeft = scrollLeft
}

const onMonthResizePointerMove = (event) => {
  const state = resizingMonth.value
  if (!state) return
  const deltaX = event.clientX - state.startClientX
  setVisibleMonthWidth(state.monthIndex, state.startWidth + deltaX)
}

const stopMonthResize = () => {
  if (!resizingMonth.value) return
  resizingMonth.value = null
  isResizeHandleHover.value = false
  window.removeEventListener('pointermove', onMonthResizePointerMove)
  window.removeEventListener('pointerup', stopMonthResize)
  window.removeEventListener('pointercancel', stopMonthResize)
}

const onMonthResizePointerDown = (event, month) => {
  const monthIndex = Number(month?.index)
  const startWidth = Number(month?.width)
  if (!Number.isFinite(monthIndex) || !Number.isFinite(startWidth)) return
  resizingMonth.value = {
    monthIndex,
    startWidth,
    startClientX: event.clientX
  }
  window.addEventListener('pointermove', onMonthResizePointerMove)
  window.addEventListener('pointerup', stopMonthResize)
  window.addEventListener('pointercancel', stopMonthResize)
}

const onResizeHandleEnter = () => {
  isResizeHandleHover.value = true
}

const onResizeHandleLeave = () => {
  if (resizingMonth.value) return
  isResizeHandleHover.value = false
}

const onResetMonthWidths = () => {
  stopMonthResize()
  const widestCurrentBlockWidth = sortedBlocks.value.reduce((maxWidth, block) => {
    const width = getVisibleBlockWidth(block)
    return Number.isFinite(width) ? Math.max(maxWidth, width) : maxWidth
  }, 0)
  resetVisibleMonthWidth(widestCurrentBlockWidth)
}

defineEmits(['editBlock'])

/** Кнопка +/‹ на последнем дне месяца — позиция относительно ячейки шапки (чтобы не перекрывалась соседними месяцами). */
const trailingMonthButtonStyleInCell = (month) => {
  const tc = trailingMonthControl.value
  if (!tc || !month) return {}
  return {
    left: `${tc.centerX - month.visibleStartX + 20}px`,
    transform: 'translateX(-50%)'
  }
}

onMounted(() => {
  if (horizontalHeader.value) {
    horizontalHeader.value.addEventListener('scroll', onHeaderScroll)
  }
  blockResizeObserver = new ResizeObserver(() => {
    refreshMeasuredBlockHeights()
  })
  window.addEventListener('resize', refreshMeasuredBlockHeights)
  refreshMeasuredBlockHeights()
  observeMonthBlockHeights()
})

onUnmounted(() => {
  if (horizontalHeader.value) {
    horizontalHeader.value.removeEventListener('scroll', onHeaderScroll)
  }
  if (blockResizeObserver) {
    blockResizeObserver.disconnect()
    blockResizeObserver = null
  }
  window.removeEventListener('resize', refreshMeasuredBlockHeights)
  stopMonthResize()
})

watch(
  sortedBlocks,
  () => {
    refreshMeasuredBlockHeights()
    observeMonthBlockHeights()
  },
  { deep: true, immediate: true }
)
watch(visibleHorizontalTotalWidth, () => {
  refreshMeasuredBlockHeights()
  observeMonthBlockHeights()
})
</script>

<style scoped>
.horizontal-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* Шапка с месяцами */
.horizontal-header {
  flex-shrink: 0;
  height: 60px;
  background: white;
  border-bottom: 2px solid #3b82f6;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  position: relative;
  z-index: 100;
}

.horizontal-header::-webkit-scrollbar {
  display: none;
}

.horizontal-header-container {
  position: relative;
  height: 100%;
  min-width: 100%;
  padding-left: 20px;
  box-sizing: border-box;
}

.horizontal-header-track {
  position: relative;
  height: 100%;
  /* Совпадает с областью позиционирования timeline-grid внутри timeline-container */
  left: 2px;
}

.horizontal-month-cell {
  position: absolute;
  top: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: white;
  z-index: 10;
  padding: 4px;
  box-sizing: border-box;
}

.horizontal-month-resize-handle {
  position: absolute;
  top: 0;
  right: -7px;
  width: 14px;
  height: 100%;
  cursor: grab;
  z-index: 40;
  background: linear-gradient(
    to right,
    rgba(59, 130, 246, 0) 0%,
    rgba(59, 130, 246, 0.08) 50%,
    rgba(59, 130, 246, 0) 100%
  );
}
.horizontal-month-resize-handle::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 2px;
  height: 24px;
  transform: translate(-50%, -50%);
  background: rgba(59, 130, 246, 0.55);
  border-radius: 999px;
  opacity: 0.75;
  transition: opacity 0.15s ease;
}
.horizontal-month-cell:hover .horizontal-month-resize-handle::before {
  opacity: 1;
}
.horizontal-container.is-resize-cursor,
.horizontal-container.is-resize-cursor * {
  cursor: grabbing !important;
}

.horizontal-reset-width-btn {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid #93c5fd;
  background: #eff6ff;
  color: #1d4ed8;
  cursor: pointer;
  z-index: 35;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.horizontal-reset-width-btn:hover {
  background: #dbeafe;
}
.horizontal-reset-width-icon {
  width: 16px;
  height: 16px;
  display: block;
}

.horizontal-month-cell::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  right: -1px;
  width: 1px;
  background: #e2e8f0;
  pointer-events: none;
}

.horizontal-trailing-month-wrap {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 40px;
  margin-left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 25;
  pointer-events: auto;
}

.horizontal-trailing-month-btn {
  width: 13px;
  height: 44px;
  border-radius: 14px;
  border: 1px solid #3b82f6;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.88;
  transform: scale(1);
  transition: opacity 0.15s ease, transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  box-shadow: 0 1px 4px rgba(37, 99, 235, 0.25);
}

.horizontal-trailing-month-wrap:hover .horizontal-trailing-month-btn,
.horizontal-trailing-month-btn:focus-visible {
  opacity: 1;
  transform: scale(1.06);
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.35);
}

.horizontal-trailing-month-btn:hover {
  background: #dbeafe;
}

.horizontal-trailing-month-btn--collapse {
  font-size: 1.15rem;
  font-weight: 700;
  padding-bottom: 0;
}

.month-label {
  font-weight: 600;
  font-size: 0.9rem;
  color: #1e293b;
}

.month-days {
  font-size: 0.7rem;
  color: #64748b;
  margin-top: 2px;
}

/* Основной контент */
.timeline-wrapper {
  flex: 1;
  overflow-x: auto;
  overflow-y: auto;
  position: relative;
  background: #ffffff;
}

.timeline-wrapper::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.timeline-wrapper::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 8px;
}

.timeline-wrapper::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 8px;
}

.timeline-container {
  position: relative;
  padding-left: 20px;
  min-width: min-content;
  box-sizing: border-box;
}

.timeline-grid {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  padding-bottom: 100px;
}

/* Линии дней - едва заметные */
.horizontal-day-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(203, 213, 225, 0.2);
  pointer-events: none;
  z-index: 1;
  transform: translateX(-50%);
  height: 100%;
}

/* Линии месяцев - синие приглушенные */
.horizontal-month-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  pointer-events: none;
  z-index: 10;
  height: 100%;
  opacity: 0.5;
}

.month-start {
  background: #3b82f6;
}

.month-end {
  background: #3b82f6;
}

/* Полоса сегодня */
.today-line-horizontal {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3px;
  background: #ef4444;
  z-index: 20;
  pointer-events: none;
  transform: translateX(-50%);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
  height: 100%;
}

.today-label-horizontal {
  position: absolute;
  top: -25px;
  left: 50%;
  transform: translateX(-50%);
  background: #ef4444;
  color: white;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 12px;
  white-space: nowrap;
  z-index: 200;
}

.block.block-dragging {
  opacity: 0.8;
  cursor: grabbing;
  z-index: 100;
}

/* Линии для Drag & Drop */
.lines-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: auto;
  z-index: 5;
}

.timeline-line {
  position: absolute;
  width: 2px;
  background: #3b82f6;
  opacity: 0.7;
  transform: translateX(-50%);
  cursor: grab;
  user-select: none;
  z-index: 15;
  pointer-events: auto;
  -webkit-user-drag: element;
}

.timeline-line:active { cursor: grabbing; }

.timeline-line .line-dot {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #3b82f6;
}

.timeline-line .line-date {
  position: absolute;
  bottom: -20px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.7rem;
  color: white;
  background: #3b82f6;
  padding: 4px 8px;
  border-radius: 16px;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  cursor: grab;
}

.line-date:active { cursor: grabbing; }
.line-date:hover {
  transform: translateX(-50%) scale(1.1);
  background: #2563eb;
}

.timeline-line:hover {
  opacity: 1;
  width: 4px;
  background: #2563eb;
}

.timeline-line:hover .line-dot { 
  transform: translateX(-50%) scale(1.5); 
  background: #2563eb; 
}

.timeline-line.line-dragging-active,
.timeline-line.line-dragging-active .line-date { 
  transition: none !important; 
}

.timeline-line.line-dragging-active {
  opacity: 1 !important;
  width: 4px !important;
  background: #2563eb !important;
  box-shadow: 0 0 20px rgba(37, 99, 235, 0.8) !important;
  z-index: 1000 !important;
}

.timeline-line.line-dragging-active .line-dot {
  width: 12px !important;
  height: 12px !important;
  background: #2563eb !important;
}

.timeline-line.line-dragging-active .line-date,
.line-date-dragging {
  background: #2563eb !important;
  transform: translateX(-50%) scale(1.2) !important;
  font-weight: bold !important;
  z-index: 1001 !important;
}

.line-position-indicator {
  position: absolute;
  width: 2px;
  height: 100%;
  background: #3b82f6;
  opacity: 0.5;
  pointer-events: none;
  z-index: 50;
  animation: indicatorPulse 1s infinite;
}

@keyframes indicatorPulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.8; }
}

</style>