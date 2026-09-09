<template>
  <div class="quarters-container">
    <div class="quarters-header" ref="quartersHeader">
      <div class="quarters-header-container" :style="{ width: visibleQuartersTotalWidth + 'px' }">
        <div class="quarters-header-track">
          <div
            v-for="quarter in visibleQuartersData"
            :key="quarter.index"
            class="quarter-header-cell"
            :style="{ left: quarter.visibleStartX + 'px', width: quarter.width + 'px' }"
          >
            <div class="quarter-label">{{ quarter.label }}</div>
            <div class="quarter-sub">{{ quarter.sub }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="timeline-wrapper" ref="timelineWrapper" @scroll="onTimelineScroll">
      <div class="timeline-container" :style="{ width: visibleQuartersTotalWidth + 'px' }">
        <div class="timeline-grid" ref="timelineGrid" :style="{ height: totalHeight + 'px' }">
          <div
            v-for="quarter in visibleQuartersData"
            :key="'q-line-'+quarter.index"
            class="quarter-divider"
            :style="{ left: quarter.visibleEndX + 'px' }"
          ></div>

          <BlockCard
            v-for="block in sortedBlocks"
            :key="block.id"
            :block="block"
            :style="getVisibleQuarterBlockStyle(block)"
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
            @start-edit-date="startEditingDate(block)"
            @save-date="saveDate(block)"
            @cancel-edit-date="cancelDateEdit(block)"
          />
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
import BlockCard from '@/components/common/Block.vue'
import TaskCardModal from '@/components/common/TaskCardModal.vue'
import { useTasks } from '@/composables/useTasks'
import { useNotification } from '@/composables/useNotification'

// Экран "По кварталам": раскладывает этапы по квартальным колонкам без наложений.
const emit = defineEmits(['editBlock'])

const blocks = inject('blocks')
const blocksActions = inject('blocksActions')

const {
  calculateBlockHeight,
  getBlockBackgroundColor,
  updateBlockDate
} = blocksActions

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

const BASE_YEAR = 2026
const QUARTER_WIDTH = 360
const MIN_QUARTER_STACK_GAP = 12
const MAX_QUARTER_STACK_GAP = 40
const QUARTER_TASK_EXTRA_HEIGHT = 18

const timelineWrapper = ref(null)
const quartersHeader = ref(null)
const timelineGrid = ref(null)
const taskCardModalOpen = ref(false)
const taskCardBlock = ref(null)
const taskCardTask = ref(null)
const measuredBlockHeights = ref({})
let blockResizeObserver = null

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

const sortedBlocks = computed(() => {
  if (!blocks?.value) return []
  return [...blocks.value].sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate))
})

const getQuarterIndexFromDate = (dateLike) => {
  const date = new Date(dateLike)
  return (date.getFullYear() - BASE_YEAR) * 4 + Math.floor(date.getMonth() / 3)
}

const firstQuarterWithBlock = computed(() => {
  if (!sortedBlocks.value.length) return 0
  const indexes = sortedBlocks.value
    .filter(b => b.releaseDate)
    .map(b => getQuarterIndexFromDate(b.releaseDate))
  return indexes.length ? Math.min(...indexes) : 0
})

const lastQuarterWithBlock = computed(() => {
  if (!sortedBlocks.value.length) return 3
  const indexes = sortedBlocks.value
    .filter(b => b.releaseDate)
    .map(b => getQuarterIndexFromDate(b.releaseDate))
  return indexes.length ? Math.max(...indexes) : 3
})

const visibleQuartersData = computed(() => {
  const result = []
  let currentX = 0
  for (let i = firstQuarterWithBlock.value; i <= lastQuarterWithBlock.value; i++) {
    const year = BASE_YEAR + Math.floor(i / 4)
    const quarterInYear = i % 4
    result.push({
      index: i,
      width: QUARTER_WIDTH,
      visibleStartX: currentX,
      visibleEndX: currentX + QUARTER_WIDTH,
      label: `Q${quarterInYear + 1} ${year}`,
      sub: ['янв-мар', 'апр-июн', 'июл-сен', 'окт-дек'][quarterInYear]
    })
    currentX += QUARTER_WIDTH
  }
  return result
})

const visibleQuartersTotalWidth = computed(() => {
  const last = visibleQuartersData.value[visibleQuartersData.value.length - 1]
  return last ? last.visibleEndX + 50 : 1200
})

const clampNumber = (value, min, max) => Math.max(min, Math.min(max, value))

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

const observeQuarterBlockHeights = () => {
  const root = timelineGrid.value
  if (!root || !blockResizeObserver) return
  blockResizeObserver.disconnect()
  root.querySelectorAll('.block[data-block-id]').forEach((node) => {
    blockResizeObserver.observe(node)
  })
}

const getQuarterLayoutHeight = (block) => {
  const estimatedHeight = calculateBlockHeight(block)
  const tasksCount = Array.isArray(block?.tasks) ? block.tasks.length : 0
  const conservativeEstimatedHeight = estimatedHeight + tasksCount * QUARTER_TASK_EXTRA_HEIGHT
  const measuredHeight = Number(measuredBlockHeights.value[String(block.id)] || 0)
  const blockHeight = Math.max(conservativeEstimatedHeight, measuredHeight)
  // Добавляем небольшой адаптивный буфер, чтобы карточки не касались визуально.
  const adaptiveBuffer = clampNumber(Math.round(blockHeight * 0.05), 6, 16)
  return blockHeight + adaptiveBuffer
}

const getQuarterLayoutGap = (layoutHeight) => {
  // Чем выше блок, тем больше межблочный зазор, но в разумных границах.
  return clampNumber(Math.round(layoutHeight * 0.055), MIN_QUARTER_STACK_GAP, MAX_QUARTER_STACK_GAP)
}

const blocksByQuarter = computed(() => {
  const grouped = {}
  sortedBlocks.value.forEach(block => {
    if (!block.releaseDate) return
    const quarterIndex = getQuarterIndexFromDate(block.releaseDate)
    if (!grouped[quarterIndex]) grouped[quarterIndex] = []
    grouped[quarterIndex].push(block)
  })

  Object.keys(grouped).forEach(key => {
    let currentTop = 20
    grouped[key].forEach(block => {
      const layoutHeight = getQuarterLayoutHeight(block)
      const layoutGap = getQuarterLayoutGap(layoutHeight)
      block.positionInQuarter = currentTop
      currentTop += layoutHeight + layoutGap
    })
  })

  return grouped
})

const totalHeight = computed(() => {
  let maxHeight = 0
  Object.values(blocksByQuarter.value).forEach(quarterBlocks => {
    let quarterHeight = 20
    quarterBlocks.forEach(block => {
      const layoutHeight = getQuarterLayoutHeight(block)
      const layoutGap = getQuarterLayoutGap(layoutHeight)
      quarterHeight += layoutHeight + layoutGap
    })
    if (quarterHeight > maxHeight) maxHeight = quarterHeight
  })
  return Math.max(maxHeight + 60, 520)
})

const getVisibleQuarterBlockWidth = () => {
  const base = QUARTER_WIDTH - 30
  return Math.min(QUARTER_WIDTH - 10, Math.round(base * 1.1))
}

const getVisibleQuarterBlockLeft = (block) => {
  if (!block.releaseDate) return 0
  const quarterIndex = getQuarterIndexFromDate(block.releaseDate)
  const quarterData = visibleQuartersData.value.find(q => q.index === quarterIndex)
  if (!quarterData) return 0
  const blockWidth = getVisibleQuarterBlockWidth()
  return quarterData.visibleStartX + (quarterData.width - blockWidth) / 2
}

const getVisibleQuarterBlockStyle = (block) => ({
  left: getVisibleQuarterBlockLeft(block) + 'px',
  top: (block.positionInQuarter || 20) + 'px',
  width: getVisibleQuarterBlockWidth() + 'px',
  backgroundColor: getBlockBackgroundColor(block),
  minHeight: calculateBlockHeight(block) + 'px'
})

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

const onTimelineScroll = () => {
  if (!timelineWrapper.value || !quartersHeader.value) return
  quartersHeader.value.scrollLeft = timelineWrapper.value.scrollLeft
}

const onHeaderScroll = () => {
  if (!timelineWrapper.value || !quartersHeader.value) return
  timelineWrapper.value.scrollLeft = quartersHeader.value.scrollLeft
}

onMounted(() => {
  if (quartersHeader.value) {
    quartersHeader.value.addEventListener('scroll', onHeaderScroll)
  }
  blockResizeObserver = new ResizeObserver(() => {
    refreshMeasuredBlockHeights()
  })
  refreshMeasuredBlockHeights()
  observeQuarterBlockHeights()
})

onUnmounted(() => {
  if (quartersHeader.value) {
    quartersHeader.value.removeEventListener('scroll', onHeaderScroll)
  }
  if (blockResizeObserver) {
    blockResizeObserver.disconnect()
    blockResizeObserver = null
  }
})

watch(
  sortedBlocks,
  () => {
    refreshMeasuredBlockHeights()
    observeQuarterBlockHeights()
  },
  { deep: true, immediate: true }
)
watch(visibleQuartersTotalWidth, () => {
  refreshMeasuredBlockHeights()
  observeQuarterBlockHeights()
})
</script>

<style scoped>
.quarters-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.quarters-header {
  flex-shrink: 0;
  height: 60px;
  background: white;
  border-bottom: 2px solid #ef4444;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  position: relative;
  z-index: 100;
}

.quarters-header::-webkit-scrollbar {
  display: none;
}

.quarters-header-container {
  position: relative;
  height: 100%;
  min-width: 100%;
  padding-left: 20px;
  box-sizing: border-box;
}

.quarters-header-track {
  position: relative;
  height: 100%;
}

.quarter-header-cell {
  position: absolute;
  top: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: white;
  z-index: 10;
  box-sizing: border-box;
}

.quarter-header-cell::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  right: -1px;
  width: 1px;
  background: #e2e8f0;
  pointer-events: none;
}

.quarter-label {
  font-weight: 600;
  font-size: 0.95rem;
  color: #0f172a;
}

.quarter-sub {
  font-size: 0.72rem;
  color: #64748b;
  margin-top: 2px;
}

.timeline-wrapper {
  flex: 1;
  overflow-x: auto;
  overflow-y: auto;
  position: relative;
  background: #ffffff;
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
  min-height: 100%;
  padding-bottom: 100px;
}

.quarter-divider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgba(239, 68, 68, 0.35);
  pointer-events: none;
  z-index: 8;
}
</style>