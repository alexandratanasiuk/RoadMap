<template>
  <div class="qe-root">
    <div class="qe-header">
      <div class="qe-left-header" :style="{ width: leftTotalWidthPx + 'px' }">
        <div class="qe-left-columns-header">
          <div class="qe-left-stripe-placeholder" />
          <div class="qe-col-title qe-col-title--stage">
            <button
              class="qe-stage-arrow-btn qe-stage-arrow-btn--all"
              type="button"
              :aria-label="allStagesExpanded ? 'Свернуть все этапы' : 'Развернуть все этапы'"
              :aria-expanded="allStagesExpanded"
              @click.stop.prevent="toggleAllStages"
            >
              <span class="qe-stage-arrow">{{ allStagesExpanded ? '▾' : '▸' }}</span>
            </button>
            <span class="qe-col-title-text">{{ tableProjectTitle }}</span>
            <button
              v-if="!readOnly?.value"
              type="button"
              class="qe-add-stage-btn"
              @click.stop.prevent="createStageQuick"
            >
              + Новый этап
            </button>
          </div>
          <div class="qe-col-title">ДАТА НАЧАЛА</div>
          <div class="qe-col-title qe-col-title--wrap">ДАТА ОКОНЧАНИЯ</div>
          <div class="qe-col-title">ГОТОВНОСТЬ</div>
        </div>
      </div>

      <div class="qe-right-header-scroller" ref="headerScrollRef">
        <div class="qe-right-header-inner" :style="{ width: timelineWidthPx + 'px' }">
          <div class="qe-month-row">
            <div
              v-for="m in months"
              :key="m.key"
              class="qe-month-cell"
              :style="{ left: m.leftPx + 'px', width: m.widthPx + 'px' }"
            >
              {{ m.label }}
            </div>
          </div>
          <div class="qe-day-row">
            <div
              v-for="d in days"
              :key="d.key"
              class="qe-day-cell"
              :class="{
                'qe-day-cell--weekend': d.isWeekend,
                'qe-day-cell--holiday': d.isHoliday,
                'qe-day-cell--today': d.isToday
              }"
              :style="{ left: d.leftPx + 'px', width: DAY_WIDTH_PX + 'px' }"
            >
              {{ d.label }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="qe-body">
      <div class="qe-left" :style="{ width: leftTotalWidthPx + 'px', height: totalHeightPx + 'px' }">
        <div
          v-for="(block, stageIdx) in orderedBlocks"
          :key="block.id"
          class="qe-stage-section"
          :style="{
            height: stageHeightsPx[stageIdx] + 'px'
          }"
        >
          <div class="qe-stage-stripe" :style="{ background: stageColor(block) }" />

          <div
            class="qe-stage-main"
          >
            <div class="qe-stage-title-wrap">
              <button
                class="qe-stage-arrow-btn"
                type="button"
                :aria-label="isStageExpanded(block, stageIdx) ? 'Свернуть этап' : 'Развернуть этап'"
                :aria-expanded="isStageExpanded(block, stageIdx)"
                @click.stop.prevent="toggleStage(block, stageIdx)"
              >
                <span class="qe-stage-arrow">{{ isStageExpanded(block, stageIdx) ? '▾' : '▸' }}</span>
              </button>
              <span
                class="qe-stage-name"
                role="button"
                tabindex="0"
                :title="block.title"
                @click.stop="emit('editBlock', block)"
                @keydown.enter.stop.prevent="emit('editBlock', block)"
              >
                {{ block.title || 'Без названия' }}
              </span>
            </div>
            <span
              class="qe-stage-date"
              :class="{ 'qe-stage-date--editing': isEditingStageDate(block, 'startDate') }"
              @dblclick.stop.prevent="beginStageDateEdit(block, 'startDate')"
            >
              <input
                v-if="isEditingStageDate(block, 'startDate')"
                class="qe-stage-date-input"
                type="date"
                v-model="stageDateDraft"
                @click.stop
                @blur="commitStageDateEdit(block, 'startDate')"
                @keydown.esc.stop.prevent="cancelStageDateEdit"
                @keydown.enter.stop.prevent="commitStageDateEdit(block, 'startDate')"
              />
              <span v-else>{{ formatDate(block.startDate) }}</span>
            </span>
            <span
              class="qe-stage-date"
              :class="{ 'qe-stage-date--editing': isEditingStageDate(block, 'releaseDate') }"
              @dblclick.stop.prevent="beginStageDateEdit(block, 'releaseDate')"
            >
              <input
                v-if="isEditingStageDate(block, 'releaseDate')"
                class="qe-stage-date-input"
                type="date"
                v-model="stageDateDraft"
                @click.stop
                @blur="commitStageDateEdit(block, 'releaseDate')"
                @keydown.esc.stop.prevent="cancelStageDateEdit"
                @keydown.enter.stop.prevent="commitStageDateEdit(block, 'releaseDate')"
              />
              <span v-else>{{ formatDate(block.releaseDate) }}</span>
            </span>
            <span class="qe-stage-status qe-stage-status--with-actions">
              <span>{{ stageProgressPercent(block) }}%</span>
              <button
                v-if="!readOnly?.value"
                type="button"
                class="qe-add-task-btn"
                @click.stop.prevent="openQuickTaskInput(block, stageIdx)"
              >
                + задача
              </button>
            </span>
          </div>

        <div
          v-if="isStageExpanded(block, stageIdx)"
          class="qe-stage-tasks"
          :class="{ 'qe-stage-tasks--drag-over': isTableStageDragOver(block) }"
          @dragover.prevent="onTableStageDragOver($event, block)"
          @drop.prevent="onTableStageDrop($event, block)"
        >
          <div
            v-for="(task, taskIdx) in getVisibleTasks(block, stageIdx)"
            :key="task.id"
            class="qe-task-row"
            :class="{
              'qe-task-row--dragging': isTableTaskDragging(block, task),
              'qe-task-row--drag-over': isTableTaskDragOver(block, task)
            }"
            :style="{ height: TASK_LINE_HEIGHT_PX + 'px' }"
            :draggable="!readOnly?.value"
            @dragstart="onTableTaskDragStart($event, block, task)"
            @dragend="onTableTaskDragEnd"
            @dragover.prevent="onTableTaskDragOver($event, block, task)"
            @drop.prevent="onTableTaskDrop($event, block, task)"
          >
            <div class="qe-task-title-wrap">
              <span
                class="qe-task-title"
                :class="{ readonly: readOnly?.value }"
                role="button"
                tabindex="0"
                :title="task.title"
                @click.stop="onTaskTitleClick(block, task)"
                @keydown.enter.stop.prevent="onTaskTitleClick(block, task)"
              >
                {{ task.title || 'Без названия' }}
              </span>

              <button
                v-if="normalizeLinkUrl(task.linkUrl)"
                class="qe-task-link-btn"
                type="button"
                title="Открыть ссылку"
                @click.stop="openTaskLink(task)"
              >
                <img class="qe-task-link-img" :src="linkIcon" alt="" />
              </button>
            </div>

            <span
              class="qe-task-date"
              :class="{ 'qe-task-date--editing': isEditingTaskDate(task, 'startDate') }"
              @dblclick.stop.prevent="beginTaskDateEdit(block, task, 'startDate')"
            >
              <input
                v-if="isEditingTaskDate(task, 'startDate')"
                class="qe-task-date-input"
                type="date"
                v-model="taskDateDraft"
                @click.stop
                @blur="commitTaskDateEdit(block, task, 'startDate')"
                @keydown.esc.stop.prevent="cancelTaskDateEdit()"
                @keydown.enter.stop.prevent="commitTaskDateEdit(block, task, 'startDate')"
              />
              <span v-else>{{ formatDate(task.startDate) }}</span>
            </span>

            <span
              class="qe-task-date"
              :class="{ 'qe-task-date--editing': isEditingTaskDate(task, 'releaseDate') }"
              @dblclick.stop.prevent="beginTaskDateEdit(block, task, 'releaseDate')"
            >
              <input
                v-if="isEditingTaskDate(task, 'releaseDate')"
                class="qe-task-date-input"
                type="date"
                v-model="taskDateDraft"
                @click.stop
                @blur="commitTaskDateEdit(block, task, 'releaseDate')"
                @keydown.esc.stop.prevent="cancelTaskDateEdit()"
                @keydown.enter.stop.prevent="commitTaskDateEdit(block, task, 'releaseDate')"
              />
              <span v-else>{{ formatDate(task.releaseDate) }}</span>
            </span>

            <span class="qe-task-status-cell">
              <span
                class="qe-task-status"
                :class="{ disabled: readOnly?.value }"
                role="button"
                tabindex="0"
                :title="readOnly?.value ? 'Только просмотр' : 'Клик — сменить статус'"
                @click.stop="cycleStatusFromDot(block, task, $event)"
                @keydown.enter.stop.prevent="cycleStatusFromDot(block, task, $event)"
              >
                <span class="qe-task-status-icon">{{ statusIcon(task.status) }}</span>
                <span class="qe-task-status-text">{{ statusLabel(task.status) }}</span>
              </span>
            </span>
          </div>
        </div>
        <div
          v-if="!readOnly?.value && isQuickTaskOpen(block)"
          class="qe-quick-task-row"
        >
          <div class="qe-quick-task-cell">
            <input
              :data-quick-task-input="String(block.id)"
              :value="quickTaskDraftValue(block)"
              class="qe-quick-task-input"
              type="text"
              placeholder="Быстро добавить задачу…"
              @input="setQuickTaskDraft(block, $event?.target?.value)"
              @keydown.enter.stop.prevent="submitQuickTask(block)"
              @keydown.esc.stop.prevent="closeQuickTaskInput(block)"
            >
            <button
              type="button"
              class="qe-quick-task-save"
              :disabled="isQuickTaskSaving(block)"
              @click.stop.prevent="submitQuickTask(block)"
            >
              Добавить
            </button>
          </div>
        </div>
        </div>
      </div>

      <div
        class="qe-right"
        ref="rightScrollRef"
        :style="{ width: timelineWidthPx + 'px', height: totalHeightPx + 'px' }"
      >
        <div class="qe-right-grid" :style="{ width: timelineWidthPx + 'px', height: totalHeightPx + 'px' }">
          <div
            v-for="d in days"
            :key="`band-${d.key}`"
            class="qe-day-band"
            :class="{
              'qe-day-band--weekend': d.isWeekend,
              'qe-day-band--holiday': d.isHoliday
            }"
            :style="{ left: d.leftPx + 'px', width: DAY_WIDTH_PX + 'px' }"
          />
          <div class="qe-grid-lines-vertical" />
          <div class="qe-grid-lines-horizontal" />
          <div
            v-if="hasTodayInRange"
            class="qe-today-line qe-today-line--grid"
            :style="{ left: todayLineLeftPx + 'px' }"
          />

          <div
            v-for="(block, stageIdx) in orderedBlocks"
            :key="block.id + '-header-mask'"
            class="qe-stage-header-mask"
            :style="{ top: stageTopsPx[stageIdx] + 'px', height: STAGE_HEADER_HEIGHT_PX + 'px' }"
          />

          <div
            v-for="(mask, i) in emptyTaskAreaMasksPx"
            :key="`empty-mask-${i}`"
            class="qe-empty-task-mask"
            :style="{ top: mask.top + 'px', height: mask.height + 'px' }"
          />

          <div
            v-for="(top, i) in stageBoundaryLineTopsPx"
            :key="`h-${i}`"
            class="qe-hline"
            :style="{ top: top + 'px' }"
          />

          <div
            v-for="(top, i) in taskRowLineTopsPx"
            :key="`task-h-${i}`"
            class="qe-task-hline"
            :style="{ top: top + 'px' }"
          />

          <div
            v-for="(block, stageIdx) in orderedBlocks"
            :key="block.id + '-bars'"
            class="qe-stage-bars"
            :style="{ top: stageTopsPx[stageIdx] + 'px', height: stageHeightsPx[stageIdx] + 'px' }"
          >
            <div
              class="qe-stage-duration"
              :style="stageDurationBarStyle(block)"
              :title="stageDurationTitle(block)"
            >
              <div
                class="qe-stage-duration-progress"
                :style="stageDurationProgressStyle(block)"
              />
            </div>

            <div
              v-for="(task, taskIdx) in getVisibleTasks(block, stageIdx)"
              :key="task.id + '-bar'"
              class="qe-task-bar"
            :style="taskBarStyle(task, stageIdx, taskIdx)"
            />
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
import { computed, inject, nextTick, onMounted, onUnmounted, ref } from 'vue'
import TaskCardModal from '@/components/common/TaskCardModal.vue'
import { useTasks } from '@/composables/useTasks'
import { useProjects } from '@/composables/useProjects'
import linkIcon from '@/assets/link-icon.png'

// Основной табличный экран: этапы/задачи в grid-формате, quick-add и DnD-перестановка.
const blocks = inject('blocks')
const blocksActions = inject('blocksActions')
const readOnly = inject('readOnly')
const emit = defineEmits(['editBlock'])
const { activeProject } = useProjects()
const tableProjectTitle = computed(() => {
  const name = String(activeProject.value?.name || '').trim()
  return name ? name.toUpperCase() : 'НАЗВАНИЕ ПРОЕКТА'
})

const { cycleTaskStatus, saveTaskCard, deleteTask } = useTasks()

const BASE_YEAR = 2026

// Под скрин: Jan..Sep
const rangeStart = new Date(BASE_YEAR, 0, 1)
const rangeEnd = new Date(BASE_YEAR, 8, 30)

const DAY_MS = 24 * 60 * 60 * 1000
const DAY_WIDTH_PX = 20
const TASK_LINE_HEIGHT_PX = 30
const QUICK_TASK_ROW_HEIGHT_PX = 34
const STAGE_HEADER_HEIGHT_PX = TASK_LINE_HEIGHT_PX
const dayWidthCss = `${DAY_WIDTH_PX}px`
const taskLineHeightCss = `${TASK_LINE_HEIGHT_PX}px`

const MIN_STAGE_HEIGHT_PX = 70

const LEFT_INDEX_COL_PX = 21
const LEFT_TASKS_COL_PX = 868
const leftTotalWidthPx = LEFT_INDEX_COL_PX + LEFT_TASKS_COL_PX

const HOLIDAY_DATES = new Set([
  '2026-01-01',
  '2026-01-02',
  '2026-01-03',
  '2026-01-04',
  '2026-01-05',
  '2026-01-06',
  '2026-01-07',
  '2026-01-08',
  '2026-02-23',
  '2026-03-08',
  '2026-05-01',
  '2026-05-09',
  '2026-06-12'
])

const orderedBlocks = computed(() => {
  const arr = blocks?.value || []
  return [...arr].sort((a, b) => new Date(a.releaseDate || a.startDate || 0) - new Date(b.releaseDate || b.startDate || 0))
})

const tasksSorted = (tasks) => {
  if (!Array.isArray(tasks)) return []
  return [...tasks].sort((a, b) => (a.order || 0) - (b.order || 0))
}

// Разворачивание списка задач по этапам
const expandedStages = ref({})
const isStageExpanded = (block, stageIdx) => {
  const key = String(block?.id || '')
  if (!key) return true
  if (Object.prototype.hasOwnProperty.call(expandedStages.value, key)) return Boolean(expandedStages.value[key])
  // По умолчанию раскрываем первый этап.
  return stageIdx === 0
}
const toggleStage = async (block, stageIdx) => {
  const key = String(block?.id || '')
  if (!key) return
  const next = !isStageExpanded(block, stageIdx)
  expandedStages.value = { ...expandedStages.value, [key]: next }
  await nextTick()
}
const allStagesExpanded = computed(() => {
  if (!orderedBlocks.value.length) return false
  return orderedBlocks.value.every((block, idx) => isStageExpanded(block, idx))
})
const toggleAllStages = async () => {
  const next = !allStagesExpanded.value
  const map = { ...expandedStages.value }
  orderedBlocks.value.forEach((block) => {
    const key = String(block?.id || '')
    if (key) map[key] = next
  })
  expandedStages.value = map
  await nextTick()
}
const getVisibleTasks = (block, stageIdx) => {
  if (!isStageExpanded(block, stageIdx)) return []
  return tasksSorted(block?.tasks)
}

const draggedTableTask = ref(null)
const tableTaskDropTarget = ref(null)
const tableStageDropTarget = ref(null)
const quickTaskDraftByBlock = ref({})
const quickTaskOpenByBlock = ref({})
const quickTaskSavingByBlock = ref({})

const isTableTaskDragging = (block, task) =>
  draggedTableTask.value?.blockId === block?.id && draggedTableTask.value?.taskId === task?.id

const isTableTaskDragOver = (block, task) =>
  tableTaskDropTarget.value?.blockId === block?.id && tableTaskDropTarget.value?.taskId === task?.id

const onTableTaskDragStart = (event, block, task) => {
  if (readOnly?.value) {
    event.preventDefault()
    return
  }
  if (!block?.id || !task?.id) return
  draggedTableTask.value = {
    blockId: block.id,
    taskId: task.id
  }
  tableTaskDropTarget.value = null
  tableStageDropTarget.value = null
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', JSON.stringify(draggedTableTask.value))
}

const onTableTaskDragEnd = () => {
  draggedTableTask.value = null
  tableTaskDropTarget.value = null
  tableStageDropTarget.value = null
}

const onTableTaskDragOver = (event, block, task) => {
  if (readOnly?.value || !draggedTableTask.value) return
  event.dataTransfer.dropEffect = 'move'
  tableTaskDropTarget.value = {
    blockId: block?.id,
    taskId: task?.id
  }
  tableStageDropTarget.value = null
}

const normalizeTaskOrder = (tasks) =>
  tasks.map((item, idx) => ({
    ...item,
    order: idx + 1
  }))

const moveTableTask = async (targetBlock, targetTaskId = null) => {
  const drag = draggedTableTask.value
  if (!drag?.blockId || !drag?.taskId || !targetBlock?.id) return

  const sourceBlock = (blocks?.value || []).find((item) => item?.id === drag.blockId)
  const destinationBlock = (blocks?.value || []).find((item) => item?.id === targetBlock.id)
  if (!sourceBlock || !destinationBlock) return

  const sourceTasksSorted = tasksSorted(sourceBlock.tasks)
  const movedTask = sourceTasksSorted.find((item) => item?.id === drag.taskId)
  if (!movedTask) return

  const sourceWithoutMoved = sourceTasksSorted.filter((item) => item?.id !== drag.taskId)

  if (sourceBlock.id === destinationBlock.id) {
    const insertIndex = targetTaskId
      ? sourceWithoutMoved.findIndex((item) => item?.id === targetTaskId)
      : sourceWithoutMoved.length
    if (insertIndex < 0) return
    sourceWithoutMoved.splice(insertIndex, 0, movedTask)
    const updated = {
      ...sourceBlock,
      tasks: normalizeTaskOrder(sourceWithoutMoved)
    }
    if (typeof blocksActions?.updateBlock === 'function') {
      await blocksActions.updateBlock(updated)
    }
    return
  }

  const destinationTasksSorted = tasksSorted(destinationBlock.tasks)
  const insertIndex = targetTaskId
    ? destinationTasksSorted.findIndex((item) => item?.id === targetTaskId)
    : destinationTasksSorted.length
  if (insertIndex < 0) return
  const destinationNext = [...destinationTasksSorted]
  destinationNext.splice(insertIndex, 0, movedTask)

  if (typeof blocksActions?.updateBlock === 'function') {
    await blocksActions.updateBlock({
      ...sourceBlock,
      tasks: normalizeTaskOrder(sourceWithoutMoved)
    })
    await blocksActions.updateBlock({
      ...destinationBlock,
      tasks: normalizeTaskOrder(destinationNext)
    })
  }
}

const isTableStageDragOver = (block) =>
  tableStageDropTarget.value?.blockId === block?.id

const onTableStageDragOver = (event, block) => {
  if (readOnly?.value || !draggedTableTask.value || !block?.id) return
  event.dataTransfer.dropEffect = 'move'
  tableTaskDropTarget.value = null
  tableStageDropTarget.value = { blockId: block.id }
}

const onTableTaskDrop = async (event, targetBlock, targetTask) => {
  if (readOnly?.value) return
  await moveTableTask(targetBlock, targetTask?.id || null)
}

const onTableStageDrop = async (event, targetBlock) => {
  if (readOnly?.value) return
  await moveTableTask(targetBlock, null)
}

const blockKey = (block) => String(block?.id || '')

const isQuickTaskOpen = (block) => Boolean(quickTaskOpenByBlock.value[blockKey(block)])
const quickTaskDraftValue = (block) => String(quickTaskDraftByBlock.value[blockKey(block)] || '')
const isQuickTaskSaving = (block) => Boolean(quickTaskSavingByBlock.value[blockKey(block)])

const setQuickTaskDraft = (block, value) => {
  const key = blockKey(block)
  quickTaskDraftByBlock.value = {
    ...quickTaskDraftByBlock.value,
    [key]: String(value || '')
  }
}

const closeQuickTaskInput = (block) => {
  const key = blockKey(block)
  quickTaskOpenByBlock.value = {
    ...quickTaskOpenByBlock.value,
    [key]: false
  }
}

const closeAllQuickTaskInputs = () => {
  if (!Object.values(quickTaskOpenByBlock.value).some(Boolean)) return
  quickTaskOpenByBlock.value = {}
}

const focusQuickTaskInput = (block) => {
  const key = blockKey(block)
  nextTick(() => {
    const input = document.querySelector(`[data-quick-task-input="${key}"]`)
    if (!(input instanceof HTMLInputElement)) return
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
  })
}

const openQuickTaskInput = async (block, stageIdx) => {
  if (readOnly?.value) return
  if (!isStageExpanded(block, stageIdx)) {
    await toggleStage(block, stageIdx)
  }
  const key = blockKey(block)
  quickTaskOpenByBlock.value = { [key]: true }
  focusQuickTaskInput(block)
}

const submitQuickTask = async (block) => {
  if (readOnly?.value) return
  const key = blockKey(block)
  const title = quickTaskDraftValue(block).trim()
  if (!title) return
  quickTaskSavingByBlock.value = { ...quickTaskSavingByBlock.value, [key]: true }
  const tasks = Array.isArray(block?.tasks) ? [...block.tasks] : []
  const maxOrder = tasks.reduce((max, task) => Math.max(max, Number(task?.order ?? -1)), -1)
  const newTask = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: title.slice(0, 220),
    status: 'todo',
    effort: 0,
    startDate: '',
    releaseDate: '',
    order: maxOrder + 1,
    isEditing: false,
    editValue: ''
  }
  if (typeof blocksActions?.updateBlock === 'function') {
    await blocksActions.updateBlock({
      ...block,
      tasks: [...tasks, newTask]
    })
  }
  quickTaskDraftByBlock.value = {
    ...quickTaskDraftByBlock.value,
    [key]: ''
  }
  quickTaskOpenByBlock.value = {
    ...quickTaskOpenByBlock.value,
    [key]: false
  }
  quickTaskSavingByBlock.value = { ...quickTaskSavingByBlock.value, [key]: false }
}

const createStageQuick = async () => {
  if (readOnly?.value) return
  if (typeof blocksActions?.createNewBlock !== 'function') return
  const result = await blocksActions.createNewBlock()
  if (result?.success && result?.block) {
    emit('editBlock', result.block)
  }
}

const onDocumentPointerDown = (event) => {
  if (!Object.values(quickTaskOpenByBlock.value).some(Boolean)) return
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('.qe-quick-task-row')) return
  if (target.closest('.qe-add-task-btn')) return
  closeAllQuickTaskInputs()
}

const stageHeightsPx = computed(() => {
  return orderedBlocks.value.map((block, stageIdx) => {
    const visibleTasks = getVisibleTasks(block, stageIdx)
    const cnt = visibleTasks.length
    const quickRowExtra = isQuickTaskOpen(block) ? QUICK_TASK_ROW_HEIGHT_PX : 0
    const raw = STAGE_HEADER_HEIGHT_PX + cnt * TASK_LINE_HEIGHT_PX + quickRowExtra + (cnt ? 8 : 10)
    const minHeight = cnt ? MIN_STAGE_HEIGHT_PX : STAGE_HEADER_HEIGHT_PX + 12
    return Math.max(minHeight, raw)
  })
})

const stageTopsPx = computed(() => {
  const out = []
  let cur = 0
  stageHeightsPx.value.forEach((h) => {
    out.push(cur)
    cur += h
  })
  return out
})

const stageBoundaryLineTopsPx = computed(() => {
  return stageHeightsPx.value.reduce((acc, h, idx) => {
    const top = stageTopsPx.value[idx] || 0
    acc.push(top + h - 1)
    return acc
  }, [])
})

const taskRowLineTopsPx = computed(() => {
  const lines = []
  orderedBlocks.value.forEach((block, stageIdx) => {
    const stageTop = stageTopsPx.value[stageIdx] || 0
    const tasks = getVisibleTasks(block, stageIdx)
    if (!tasks.length) return
    for (let i = 1; i <= tasks.length; i += 1) {
      // Линии справа должны совпадать с border-bottom строк задач слева.
      lines.push(stageTop + STAGE_HEADER_HEIGHT_PX + i * TASK_LINE_HEIGHT_PX - 1)
    }
  })
  return lines
})

const emptyTaskAreaMasksPx = computed(() => {
  const masks = []
  orderedBlocks.value.forEach((block, stageIdx) => {
    const stageTop = stageTopsPx.value[stageIdx] || 0
    const stageHeight = stageHeightsPx.value[stageIdx] || 0
    const visibleCount = getVisibleTasks(block, stageIdx).length

    const taskStart = stageTop + STAGE_HEADER_HEIGHT_PX
    const taskEnd = taskStart + visibleCount * TASK_LINE_HEIGHT_PX
    const stageEnd = stageTop + stageHeight

    if (stageEnd > taskEnd) {
      masks.push({
        top: taskEnd,
        height: stageEnd - taskEnd
      })
    }
  })
  return masks
})

const totalHeightPx = computed(() => stageHeightsPx.value.reduce((sum, h) => sum + h, 0) || 0)

const timelineDaysCount = computed(() => {
  const d0 = Math.floor(rangeStart.getTime() / DAY_MS)
  const d1 = Math.floor(rangeEnd.getTime() / DAY_MS)
  return d1 - d0 + 1
})

const timelineWidthPx = computed(() => timelineDaysCount.value * DAY_WIDTH_PX)

const todayDate = new Date()
const startOfLocalDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const todayDayIndex = computed(() => {
  const start = startOfLocalDay(rangeStart).getTime()
  const today = startOfLocalDay(todayDate).getTime()
  return Math.floor((today - start) / DAY_MS)
})
const hasTodayInRange = computed(() => todayDayIndex.value >= 0 && todayDayIndex.value < timelineDaysCount.value)
const todayLineLeftPx = computed(() => {
  if (!hasTodayInRange.value) return 0
  return todayDayIndex.value * DAY_WIDTH_PX + Math.floor(DAY_WIDTH_PX / 2)
})

const normalizeDateInput = (dateLike) => {
  const d = new Date(dateLike)
  if (Number.isNaN(d.getTime())) return null
  return d
}

const dateToDayIdx = (dateLike) => {
  const d = normalizeDateInput(dateLike)
  if (!d) return 0
  const rangeStartLocal = startOfLocalDay(rangeStart).getTime()
  const dateLocal = startOfLocalDay(d).getTime()
  const idx = Math.floor((dateLocal - rangeStartLocal) / DAY_MS)
  return Math.max(0, Math.min(timelineDaysCount.value - 1, idx))
}

const clampSpan = (startIdx, endIdx) => {
  const a = Math.max(0, startIdx)
  const b = Math.max(0, endIdx)
  if (b < a) return { start: a, widthDays: 1 }
  return { start: a, widthDays: Math.max(1, b - a + 1) }
}

const months = computed(() => {
  const list = []
  for (let m = 0; m <= 8; m += 1) {
    const label = ['ЯНВАРЬ', 'ФЕВРАЛЬ', 'МАРТ', 'АПРЕЛЬ', 'МАЙ', 'ИЮНЬ', 'ИЮЛЬ', 'АВГУСТ', 'СЕНТЯБРЬ'][m]
    const start = new Date(BASE_YEAR, m, 1)
    const end = new Date(BASE_YEAR, m + 1, 0)
    const left = dateToDayIdx(start)
    const right = dateToDayIdx(end)
    const widthDays = Math.max(1, right - left + 1)
    list.push({
      key: `m${m}`,
      label,
      leftPx: left * DAY_WIDTH_PX,
      widthPx: widthDays * DAY_WIDTH_PX
    })
  }
  return list
})

const toDateKey = (dateObj) => {
  const y = dateObj.getFullYear()
  const m = String(dateObj.getMonth() + 1).padStart(2, '0')
  const d = String(dateObj.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const days = computed(() => {
  const list = []
  const cursor = new Date(rangeStart)
  const todayKey = toDateKey(todayDate)
  let idx = 0
  while (cursor <= rangeEnd) {
    const day = cursor.getDay()
    const dateKey = toDateKey(cursor)
    list.push({
      key: `d${idx}`,
      label: String(cursor.getDate()),
      leftPx: idx * DAY_WIDTH_PX,
      isWeekend: day === 0 || day === 6,
      isHoliday: HOLIDAY_DATES.has(dateKey),
      isToday: dateKey === todayKey
    })
    cursor.setDate(cursor.getDate() + 1)
    idx += 1
  }
  return list
})

const statusIcon = (status) => {
  switch (status) {
    case 'done':
      return '✅'
    case 'progress':
      return '🕛'
    default:
      return '○'
  }
}

const statusLabel = (status) => {
  switch (status) {
    case 'done':
      return 'готова'
    case 'progress':
      return 'в работе'
    default:
      return 'не начата'
  }
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.getDate().toString().padStart(2, '0')
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const year = d.getFullYear()
  return `${day}.${month}.${year}`
}

const formatDateShort = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.getDate().toString().padStart(2, '0')
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const year2 = String(d.getFullYear()).slice(-2)
  return `${day}.${month}.${year2}`
}

const stageDurationText = (block) => {
  const s = formatDateShort(block?.startDate)
  const e = formatDateShort(block?.releaseDate)
  if (!s && !e) return ''
  if (s && e) return `${s}–${e}`
  return s || e
}

const stageDurationTitle = (block) => {
  const text = stageDurationText(block)
  const name = block?.title || ''
  if (text && name) return `${name}\n${text}`
  return name || text || ''
}

const stageTimelineStatus = (block) => {
  const tasks = tasksSorted(block?.tasks)
  if (!tasks.length) return 'todo'
  const allDone = tasks.every((t) => t?.status === 'done')
  if (allDone) return 'done'
  const hasStarted = tasks.some((t) => t?.status === 'progress' || t?.status === 'done')
  return hasStarted ? 'progress' : 'todo'
}

const stageTimelineFill = (status) => {
  if (status === 'done') {
    return '#86efac'
  }
  if (status === 'progress') {
    return 'repeating-linear-gradient(135deg, rgba(59, 130, 246, 0.58) 0 3px, rgba(59, 130, 246, 0.30) 3px 6px)'
  }
  return 'repeating-linear-gradient(135deg, rgba(148, 163, 184, 0.52) 0 4px, rgba(148, 163, 184, 0.24) 4px 8px)'
}

const stageDurationBarStyle = (block) => {
  const hasStart = normalizeDateInput(block?.startDate)
  const hasEnd = normalizeDateInput(block?.releaseDate)
  if (!hasStart && !hasEnd) {
    return { display: 'none' }
  }

  const startIdx = dateToDayIdx(block?.startDate || block?.releaseDate)
  const endIdx = dateToDayIdx(block?.releaseDate || block?.startDate)
  const { start, widthDays } = clampSpan(startIdx, endIdx)
  const status = stageTimelineStatus(block)
  return {
    left: start * DAY_WIDTH_PX + 'px',
    width: widthDays * DAY_WIDTH_PX + 'px',
    top: '0px',
    height: (STAGE_HEADER_HEIGHT_PX - 1) + 'px',
    background: stageTimelineFill(status),
    opacity: 1
  }
}

const stageDurationProgressStyle = (block) => {
  const pct = Math.max(0, Math.min(100, stageProgressPercent(block)))
  if (!pct) return { display: 'none' }
  return {
    width: `${pct}%`
  }
}

const stageColor = (block) => {
  if (blocksActions?.getBlockBackgroundColor) return blocksActions.getBlockBackgroundColor(block)
  return 'rgba(37, 99, 235, 0.25)'
}

const stageProgressPercent = (block) => {
  const tasks = tasksSorted(block?.tasks)
  if (!tasks.length) return 0
  const doneCount = tasks.filter((t) => t?.status === 'done').length
  return Math.round((doneCount / tasks.length) * 100)
}

// Task modal
const taskCardModalOpen = ref(false)
const taskCardBlock = ref(null)
const taskCardTask = ref(null)

const openTaskCardModal = (block, task) => {
  if (readOnly?.value) return
  taskCardBlock.value = block
  taskCardTask.value = task
  taskCardModalOpen.value = true
}

const closeTaskCardModal = () => {
  taskCardModalOpen.value = false
  taskCardBlock.value = null
  taskCardTask.value = null
}

// Inline stage date editing (double-click on stage start/end)
const editingStageDate = ref({ blockId: null, field: null })
const stageDateDraft = ref('')
const suppressNextStageDateBlur = ref(false)

const isEditingStageDate = (block, field) => {
  return editingStageDate.value.blockId === block?.id && editingStageDate.value.field === field
}

const beginStageDateEdit = (block, field) => {
  if (readOnly?.value) return
  if (!block?.id) return
  if (field !== 'startDate' && field !== 'releaseDate') return
  if (isEditingStageDate(block, field)) return
  suppressNextStageDateBlur.value = false
  editingStageDate.value = { blockId: block.id, field }
  stageDateDraft.value = field === 'startDate' ? (block.startDate || '') : (block.releaseDate || '')
}

const commitStageDateEdit = async (block, field) => {
  if (readOnly?.value) return
  if (!block?.id) return
  if (!isEditingStageDate(block, field)) return
  if (suppressNextStageDateBlur.value) {
    suppressNextStageDateBlur.value = false
    return
  }

  const nextValue = stageDateDraft.value || ''
  const currentValue = field === 'startDate' ? (block.startDate || '') : (block.releaseDate || '')
  if (nextValue === currentValue) {
    editingStageDate.value = { blockId: null, field: null }
    return
  }

  let startDate = field === 'startDate' ? nextValue : (block.startDate || '')
  let releaseDate = field === 'releaseDate' ? nextValue : (block.releaseDate || '')
  if (startDate && releaseDate && startDate > releaseDate) {
    if (field === 'startDate') releaseDate = startDate
    else startDate = releaseDate
  }

  const updatedBlock = {
    ...block,
    startDate,
    releaseDate
  }
  if (typeof blocksActions?.updateBlock === 'function') {
    await blocksActions.updateBlock(updatedBlock)
  }

  editingStageDate.value = { blockId: null, field: null }
}

const cancelStageDateEdit = () => {
  suppressNextStageDateBlur.value = true
  editingStageDate.value = { blockId: null, field: null }
}

const saveTaskCardModal = async (patch) => {
  if (!taskCardBlock.value || !taskCardTask.value) return
  const res = await saveTaskCard(taskCardBlock.value, taskCardTask.value, patch)
  if (res?.success) closeTaskCardModal()
}

const deleteTaskCardModal = async () => {
  if (!taskCardBlock.value || !taskCardTask.value) return
  const res = await deleteTask(taskCardBlock.value, taskCardTask.value)
  if (res?.success) closeTaskCardModal()
}

// Inline date editing (start/end) directly in table cells
const editingTaskDate = ref({ taskId: null, field: null })
const taskDateDraft = ref('')
const suppressNextDateBlur = ref(false)

const isEditingTaskDate = (task, field) => {
  return editingTaskDate.value.taskId === task?.id && editingTaskDate.value.field === field
}

const beginTaskDateEdit = (block, task, field) => {
  if (readOnly?.value) return
  if (!task?.id) return
  if (field !== 'startDate' && field !== 'releaseDate') return
  if (isEditingTaskDate(task, field)) return

  editingTaskDate.value = { taskId: task.id, field }
  taskDateDraft.value = field === 'startDate' ? (task.startDate || '') : (task.releaseDate || '')
}

const commitTaskDateEdit = async (block, task, field) => {
  if (readOnly?.value) return
  if (!task?.id) return
  if (!isEditingTaskDate(task, field)) return
  if (suppressNextDateBlur.value) {
    suppressNextDateBlur.value = false
    return
  }

  const nextValue = taskDateDraft.value || ''
  const currentValue = field === 'startDate' ? (task.startDate || '') : (task.releaseDate || '')

  // Не делаем запрос, если пользователь не поменял дату.
  if (nextValue === currentValue) {
    editingTaskDate.value = { taskId: null, field: null }
    return
  }

  const patchStart = field === 'startDate' ? nextValue : task.startDate
  const patchRelease = field === 'releaseDate' ? nextValue : task.releaseDate

  // `saveTaskCard` сбрасывает поля, если их не передать — поэтому передаём текущие значения.
  await saveTaskCard(block, task, {
    startDate: patchStart,
    releaseDate: patchRelease,
    title: task.title,
    linkUrl: task.linkUrl,
    linkNote: task.linkNote,
    effort: Number(task.effort) || 0
  })

  editingTaskDate.value = { taskId: null, field: null }
}

const cancelTaskDateEdit = () => {
  // Esc должен только закрывать редактор, а `blur` сразу после Esc не должен триггерить сохранение.
  suppressNextDateBlur.value = true
  editingTaskDate.value = { taskId: null, field: null }
}

const normalizeLinkUrl = (raw) => {
  if (!raw || typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

const openTaskLink = (task) => {
  const url = normalizeLinkUrl(task?.linkUrl || '')
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

const onTaskTitleClick = (block, task) => {
  // Клик по названию открывает модальное редактирование задачи.
  openTaskCardModal(block, task)
}

const cycleStatusFromDot = (block, task, event) => {
  if (readOnly?.value) return
  const e = event && event.stopPropagation ? event : null
  cycleTaskStatus(block, task, e)
}

const taskCellFill = (status) => {
  if (status === 'done') {
    return '#86efac'
  }
  if (status === 'progress') {
    return 'repeating-linear-gradient(135deg, rgba(59, 130, 246, 0.58) 0 3px, rgba(59, 130, 246, 0.30) 3px 6px)'
  }
  return 'repeating-linear-gradient(135deg, rgba(148, 163, 184, 0.52) 0 4px, rgba(148, 163, 184, 0.24) 4px 8px)'
}

const taskBarStyle = (task, stageIdx, taskIdx) => {
  const hasStart = normalizeDateInput(task?.startDate)
  const hasEnd = normalizeDateInput(task?.releaseDate)
  if (!hasStart && !hasEnd) {
    return { display: 'none' }
  }

  const startIdx = dateToDayIdx(task.startDate || task.releaseDate)
  const endIdx = dateToDayIdx(task.releaseDate || task.startDate)
  const { start, widthDays } = clampSpan(startIdx, endIdx)

  // Заполняем всю высоту строки задачи, чтобы закрашивались целые "клетки" дней.
  const stageTop = stageTopsPx.value[stageIdx] || 0
  const y = stageTop + STAGE_HEADER_HEIGHT_PX + taskIdx * TASK_LINE_HEIGHT_PX

  return {
    left: start * DAY_WIDTH_PX + 'px',
    width: widthDays * DAY_WIDTH_PX + 'px',
    top: (y - stageTop) + 'px',
    height: (TASK_LINE_HEIGHT_PX - 1) + 'px',
    background: taskCellFill(task.status),
    borderRadius: '0',
    opacity: 1
  }
}

// Scroll sync (horizontal right panel -> header)
const rightScrollRef = ref(null)
const headerScrollRef = ref(null)
let centerRetryTimer = null

const onRightScroll = () => {
  const rightEl = rightScrollRef.value
  const headerEl = headerScrollRef.value
  if (!rightEl) return

  if (headerEl) {
    headerEl.scrollLeft = rightEl.scrollLeft
  }
}

const onRightWheel = (event) => {
  if (!event?.shiftKey) return
  const rightEl = rightScrollRef.value
  if (!rightEl) return
  event.preventDefault()
  const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX
  rightEl.scrollLeft += delta
}

const centerTimelineOnToday = () => {
  if (!hasTodayInRange.value) return
  const rightEl = rightScrollRef.value
  const headerEl = headerScrollRef.value
  if (!rightEl) return

  const maxScrollLeft = Math.max(0, rightEl.scrollWidth - rightEl.clientWidth)
  const target = todayLineLeftPx.value - (rightEl.clientWidth / 2)
  const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, target))
  rightEl.scrollLeft = nextScrollLeft

  if (headerEl) {
    headerEl.scrollLeft = nextScrollLeft
  }
}

const scheduleCenterTimelineOnToday = () => {
  // Первый вызов может сработать до финального расчёта размеров, поэтому даём второй проход.
  centerTimelineOnToday()
  requestAnimationFrame(() => {
    centerTimelineOnToday()
  })
  if (centerRetryTimer) clearTimeout(centerRetryTimer)
  centerRetryTimer = setTimeout(() => {
    centerTimelineOnToday()
  }, 120)
}

onMounted(async () => {
  await nextTick()
  rightScrollRef.value?.addEventListener('scroll', onRightScroll, { passive: true })
  rightScrollRef.value?.addEventListener('wheel', onRightWheel, { passive: false })
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  scheduleCenterTimelineOnToday()
})

onUnmounted(() => {
  rightScrollRef.value?.removeEventListener('scroll', onRightScroll)
  rightScrollRef.value?.removeEventListener('wheel', onRightWheel)
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  if (centerRetryTimer) {
    clearTimeout(centerRetryTimer)
    centerRetryTimer = null
  }
})
</script>

<style scoped>
.qe-root {
  --qe-col-task-width: 310px;
  --qe-col-task-width: 460px;
  --qe-col-start-width: 110px;
  --qe-col-end-width: 110px;
  --qe-col-status-width: 210px;
  --qe-col-gap: 6px;
  --qe-col-separator: rgba(148, 163, 184, 0.55);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  overflow: hidden;
}

.qe-header {
  flex-shrink: 0;
  display: flex;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.qe-left-header {
  width: auto;
  display: flex;
  gap: 8px;
  padding: 10px 0;
  box-sizing: border-box;
  position: relative;
}

.qe-left-columns-header {
  display: grid;
  grid-template-columns:
    21px
    var(--qe-col-task-width)
    var(--qe-col-start-width)
    var(--qe-col-end-width)
    var(--qe-col-status-width);
  column-gap: var(--qe-col-gap);
  align-items: center;
  width: 100%;
  position: relative;
}

.qe-left-columns-header > :nth-child(3),
.qe-left-columns-header > :nth-child(4),
.qe-left-columns-header > :nth-child(5) {
  border-left: none;
  padding-left: 6px;
}

.qe-left-columns-header::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  pointer-events: none;
  background-repeat: no-repeat;
  background-image:
    linear-gradient(var(--qe-col-separator), var(--qe-col-separator)),
    linear-gradient(var(--qe-col-separator), var(--qe-col-separator)),
    linear-gradient(var(--qe-col-separator), var(--qe-col-separator));
  background-size:
    1px 100%,
    1px 100%,
    1px 100%;
  background-position:
    calc(27px + var(--qe-col-task-width) + var(--qe-col-gap)) 0,
    calc(27px + var(--qe-col-task-width) + var(--qe-col-start-width) + (var(--qe-col-gap) * 2)) 0,
    calc(27px + var(--qe-col-task-width) + var(--qe-col-start-width) + var(--qe-col-end-width) + (var(--qe-col-gap) * 3)) 0;
}

.qe-left-stripe-placeholder {
  width: 21px;
  height: 1px;
}

.qe-col-title {
  font-weight: 900;
  font-size: 0.78rem;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.qe-col-title--stage {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: -4px;
  min-width: 0;
}

.qe-col-title-text {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.98rem;
  font-weight: 900;
  color: #0b3a7a;
  letter-spacing: 0.02em;
}

.qe-add-stage-btn {
  margin-left: 8px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid #93c5fd;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
}
.qe-add-stage-btn:hover {
  background: #dbeafe;
}

.qe-stage-arrow-btn--all {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
}

.qe-col-title--wrap {
  white-space: normal;
  line-height: 1.05;
}

.qe-left-title {
  flex: 0 0 140px;
  font-weight: 900;
  color: #0f172a;
  font-size: 0.78rem;
}

.qe-tasks-title {
  flex: 1;
  font-weight: 900;
  color: #0f172a;
  font-size: 0.78rem;
}

.qe-right-header-scroller {
  flex: 1;
  overflow: hidden;
}

.qe-right-header-inner {
  position: relative;
  height: 58px;
}

.qe-month-row {
  position: absolute;
  top: 4px;
  left: 0;
  right: 0;
  height: 22px;
}

.qe-month-cell {
  position: absolute;
  top: 0;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 0.72rem;
  color: #334155;
  background: #f1f5f9;
  border: 1px solid rgba(148, 163, 184, 0.55);
  border-radius: 0;
}

.qe-day-row {
  position: absolute;
  top: 28px;
  left: 0;
  right: 0;
  height: 30px;
}

.qe-day-cell {
  position: absolute;
  top: 0;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.64rem;
  font-weight: 700;
  color: #64748b;
  border: 1px solid rgba(148, 163, 184, 0.4);
  box-sizing: border-box;
  background: #ffffff;
}

.qe-day-cell--weekend {
  background: #e6f1fb;
}

.qe-day-cell--holiday {
  background: #fdecee;
}

.qe-day-cell--today {
  background: #dbeafe;
  color: #1d4ed8;
  font-weight: 800;
}

.qe-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow-x: hidden;
  overflow-y: auto;
}

.qe-left {
  flex-shrink: 0;
  border-right: 1px solid #e2e8f0;
  overflow-y: hidden;
  overflow-x: hidden;
  background: #ffffff;
  position: relative;
}

.qe-left::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  pointer-events: none;
  z-index: 2;
  background-repeat: no-repeat;
  background-image:
    linear-gradient(var(--qe-col-separator), var(--qe-col-separator)),
    linear-gradient(var(--qe-col-separator), var(--qe-col-separator)),
    linear-gradient(var(--qe-col-separator), var(--qe-col-separator));
  background-size:
    1px 100%,
    1px 100%,
    1px 100%;
  background-position:
    calc(27px + var(--qe-col-task-width) + var(--qe-col-gap)) 0,
    calc(27px + var(--qe-col-task-width) + var(--qe-col-start-width) + (var(--qe-col-gap) * 2)) 0,
    calc(27px + var(--qe-col-task-width) + var(--qe-col-start-width) + var(--qe-col-end-width) + (var(--qe-col-gap) * 3)) 0;
}

.qe-stage-section {
  border-bottom: 1px solid #e2e8f0;
  box-sizing: border-box;
  position: relative;
}

.qe-stage-stripe {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 21px;
  z-index: 0;
  pointer-events: none;
}

.qe-stage-main {
  display: grid;
  grid-template-columns:
    var(--qe-col-task-width)
    var(--qe-col-start-width)
    var(--qe-col-end-width)
    var(--qe-col-status-width);
  align-items: center;
  column-gap: var(--qe-col-gap);
  height: v-bind('taskLineHeightCss');
  cursor: default;
  user-select: none;
  padding: 0 0 0 27px;
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  border-bottom: 1px solid rgba(148, 163, 184, 0.45);
}

.qe-stage-index {
  width: 21px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  color: #ffffff;
  background: rgba(59, 130, 246, 0.6);
}

.qe-stage-name {
  flex: 1;
  min-width: 0;
  padding: 0;
  font-weight: 900;
  color: #0f172a;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
  -webkit-user-select: none;
  cursor: pointer;
}

.qe-stage-title-wrap {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: -4px;
  user-select: none;
  -webkit-user-select: none;
}

.qe-stage-arrow-btn {
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
}

.qe-stage-arrow-btn:hover {
  background: rgba(148, 163, 184, 0.15);
}

.qe-stage-arrow {
  flex: 0 0 14px;
  width: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-weight: 900;
  font-size: 0.8rem;
  line-height: 1;
  user-select: none;
  -webkit-user-select: none;
}

.qe-stage-name::selection,
.qe-stage-title-wrap::selection,
.qe-stage-arrow::selection {
  background: transparent;
  color: inherit;
}

.qe-stage-tasks {
  padding: 0 0 0 27px;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
}

.qe-stage-tasks--drag-over {
  background: rgba(59, 130, 246, 0.06);
}

.qe-task-row {
  display: grid;
  grid-template-columns:
    var(--qe-col-task-width)
    var(--qe-col-start-width)
    var(--qe-col-end-width)
    var(--qe-col-status-width);
  align-items: center;
  column-gap: var(--qe-col-gap);
  padding: 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.45);
  box-sizing: border-box;
}

.qe-task-row--dragging {
  opacity: 0.55;
}

.qe-task-row--drag-over {
  background: rgba(59, 130, 246, 0.08);
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.45);
}

.qe-task-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
  padding-left: 24px;
  padding-right: 8px;
  box-sizing: border-box;
}

.qe-task-link-btn {
  margin-left: auto;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: #2563eb;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  border-radius: 6px;
}

.qe-task-link-btn:hover {
  background: rgba(37, 99, 235, 0.08);
}

.qe-task-link-img {
  width: 30px;
  height: 30px;
  display: block;
}

.qe-task-title {
  min-width: 0;
  font-size: 0.88rem;
  font-weight: 400;
  font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.qe-task-title.readonly {
  cursor: default;
}

.qe-task-status-cell {
  padding-left: 6px;
  min-width: 0;
  display: flex;
  align-items: center;
}

.qe-stage-date,
.qe-stage-status {
  min-width: 0;
  font-size: 0.78rem;
  font-weight: 700;
  font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-left: 1px solid var(--qe-col-separator);
  padding-left: 6px;
}

.qe-stage-date {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.qe-stage-date--editing {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
}

.qe-stage-date-input {
  width: 100%;
  height: 22px;
  display: block;
  border: 1px solid rgba(148, 163, 184, 0.7);
  border-radius: 6px;
  outline: none;
  background: #ffffff;
  padding: 0 6px;
  font-family: inherit;
  font-size: 0.72rem;
  font-weight: 400;
  color: #0f172a;
  box-sizing: border-box;
}

.qe-stage-status {
  font-weight: 800;
}

.qe-stage-status--with-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  flex-wrap: wrap;
}

.qe-add-task-btn {
  flex: 0 0 auto;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #475569;
  font-size: 0.62rem;
  font-weight: 700;
  cursor: pointer;
}
.qe-add-task-btn:hover {
  background: #f1f5f9;
}

.qe-quick-task-row {
  display: grid;
  grid-template-columns:
    var(--qe-col-task-width)
    var(--qe-col-start-width)
    var(--qe-col-end-width)
    var(--qe-col-status-width);
  align-items: center;
  column-gap: var(--qe-col-gap);
  height: 34px;
  padding: 0 0 0 27px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.3);
  box-sizing: border-box;
}

.qe-quick-task-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding-left: 24px;
  padding-right: 8px;
  box-sizing: border-box;
}

.qe-quick-task-input {
  flex: 1;
  min-width: 0;
  height: 24px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 0.72rem;
  outline: none;
}
.qe-quick-task-input:focus {
  border-color: #93c5fd;
}

.qe-quick-task-save {
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
}
.qe-quick-task-save:hover {
  background: #dbeafe;
}
.qe-quick-task-save:disabled {
  opacity: 0.6;
  cursor: default;
}

.qe-task-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  font-size: 0.78rem;
  font-weight: 400;
  font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
  user-select: none;
  cursor: pointer;
  justify-self: start;
  background: transparent;
  border: none;
}

.qe-task-status.disabled {
  cursor: default;
}

.qe-task-status-text {
  font-size: 0.78rem;
  font-weight: 400;
  font-family: inherit;
  color: #0f172a;
  white-space: nowrap;
}

.qe-task-status-icon {
  flex: 0 0 auto;
  font-size: 0.82rem;
  line-height: 1;
}

.qe-task-date {
  min-width: 0;
  font-size: 0.72rem;
  color: #475569;
  font-weight: 400;
  font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-left: 1px solid var(--qe-col-separator);
  padding-left: 6px;
  cursor: default;
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  user-select: none;
}

.qe-task-date--editing {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
}

.qe-task-date-input {
  width: 100%;
  height: 22px;
  display: block;
  border: 1px solid rgba(148, 163, 184, 0.7);
  border-radius: 6px;
  outline: none;
  background: #ffffff;
  padding: 0 6px;
  font-family: inherit;
  font-size: 0.72rem;
  font-weight: 400;
  color: #0f172a;
  box-sizing: border-box;
  user-select: text;
}

.qe-task-duration {
  min-width: 0;
  font-size: 0.72rem;
  color: #475569;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: right;
}

.qe-task-percent {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-start;
  cursor: pointer;
  user-select: none;
  border-left: 1px solid rgba(148, 163, 184, 0.55);
  padding-left: 6px;
}

.qe-task-percent.disabled {
  cursor: default;
}

.qe-percent-track {
  flex: 1;
  height: 18px;
  background: #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(0,0,0,0.04);
}

.qe-percent-fill {
  height: 100%;
  border-radius: 6px;
  background: #94a3b8;
  opacity: 0.95;
}

.qe-percent-text {
  width: 46px;
  text-align: right;
  font-size: 0.72rem;
  color: #0f172a;
  font-weight: 400;
  font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
}

.qe-right {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  background: #ffffff;
}

.qe-right {
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.75) rgba(241, 245, 249, 0.95);
}

.qe-right::-webkit-scrollbar {
  height: 10px;
}

.qe-right::-webkit-scrollbar-track {
  background: rgba(241, 245, 249, 0.95);
  border-radius: 999px;
}

.qe-right::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.75);
  border-radius: 999px;
}

.qe-right::-webkit-scrollbar-thumb:hover {
  background: rgba(100, 116, 139, 0.85);
}

.qe-right-grid {
  position: relative;
  min-width: max-content;
  background-color: #f8fafc;
}

.qe-day-band {
  position: absolute;
  top: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 0;
}

.qe-day-band--weekend {
  background: rgba(191, 219, 254, 0.35);
}

.qe-day-band--holiday {
  background: rgba(254, 205, 211, 0.42);
}

.qe-grid-lines-vertical {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(to right, rgba(100, 116, 139, 0.28) 1px, transparent 1px);
  background-size: v-bind('dayWidthCss') 100%;
  opacity: 1;
  pointer-events: none;
  z-index: 1;
}

.qe-grid-lines-horizontal {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(to bottom, rgba(100, 116, 139, 0.28) 1px, transparent 1px);
  background-size: 100% v-bind('taskLineHeightCss');
  opacity: 0;
  pointer-events: none;
  z-index: 1;
}

.qe-stage-header-mask {
  position: absolute;
  left: 0;
  right: 0;
  background: #f1f5f9;
  pointer-events: none;
  z-index: 2;
}

.qe-empty-task-mask {
  position: absolute;
  left: 0;
  right: 0;
  background: #f1f5f9;
  pointer-events: none;
  z-index: 2;
}

.qe-hline {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(148, 163, 184, 0.45);
  pointer-events: none;
  z-index: 3;
}

.qe-task-hline {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(148, 163, 184, 0.45);
  pointer-events: none;
  z-index: 2;
}

.qe-stage-bars {
  position: absolute;
  left: 0;
  z-index: 4;
  pointer-events: none;
}

.qe-stage-duration {
  position: absolute;
  left: 0;
  top: 0;
  height: v-bind('taskLineHeightCss');
  border-radius: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 1;
}

.qe-stage-duration-progress {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 0;
  background: rgba(34, 197, 94, 0.78);
  z-index: 2;
}

.qe-stage-duration-text {
  display: inline-block;
  padding: 0 6px;
  font-size: 0.6rem;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.85);
  white-space: nowrap;
}

.qe-task-bar {
  position: absolute;
  border: none;
  z-index: 1;
  border-radius: 0;
}

.qe-today-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: rgba(220, 38, 38, 0.9);
  pointer-events: none;
}

.qe-today-line--grid {
  z-index: 4;
}
</style>

