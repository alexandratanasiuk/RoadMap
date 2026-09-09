<template>
  <div class="heatmap-view">
    <div class="heatmap-header">
      <div class="heatmap-title-section">
        <h2>📊 Тепловая карта трудозатрат</h2>
        <div class="heatmap-stats">
          <div class="heatmap-stat">
            <span class="stat-icon">📊</span>
            <span class="stat-label">Этапов:</span>
            <span class="stat-value">{{ blocks.length }}</span>
          </div>
          <div class="heatmap-stat">
            <span class="stat-icon">⚡</span>
            <span class="stat-label">Всего трудозатрат:</span>
            <span class="stat-value">{{ totalEffort }} ч</span>
          </div>
          <div class="heatmap-stat">
            <span class="stat-icon">✅</span>
            <span class="stat-label">Выполнено:</span>
            <span class="stat-value">{{ completedEffort }} ч ({{ completedEffortPercent }}%)</span>
          </div>
        </div>
        <div class="heatmap-legend">
          <div class="legend-item">
            <span class="legend-color" style="background: #bfe9da;"></span>
            <span>Все задачи выполнены</span>
          </div>
          <div class="legend-item">
            <span class="legend-color" style="background: #c7d7fb;"></span>
            <span>В работе / частично</span>
          </div>
          <div class="legend-item">
            <span class="legend-color" style="background: #d8d9e0;"></span>
            <span>Не начато / нет задач</span>
          </div>
          <div class="legend-item">
            <span class="legend-color legend-overdue"></span>
            <span>Просрочено</span>
          </div>
          <div class="legend-item">
            <span class="legend-color legend-overdue-progress"></span>
            <span>Просрочено в работе</span>
          </div>
        </div>
      </div>

    </div>

    <div class="heatmap-container">
      <div class="treemap-area" ref="treemapArea">
        <div v-for="stage in stagePositions" :key="stage.id" class="treemap-stage"
          :style="getStageStyle(stage)" @click="onStageClick(stage)">
          <div class="stage-header">
            <div class="stage-title" :title="stage.title">{{ stage.title }}</div>
            <div class="stage-metrics">
              <span class="stage-effort">{{ stage.effort }}ч</span>
              <span class="stage-progress">{{ getTaskProgress(getOriginalBlock(stage.id)) }}%</span>
              <span class="stage-date">{{ formatDate(stage.releaseDate) }}</span>
            </div>
          </div>

          <div class="tasks-area">
            <template v-if="taskPositions[stage.id] && taskPositions[stage.id].length > 0">
              <div v-for="task in taskPositions[stage.id]" :key="task.id" class="treemap-task"
                :style="getTaskStyle(task)" :title="task.title" tabindex="0"
                @click.stop.prevent="openTaskCardFromTreemap(stage.id, task.id)"
                @keydown.enter.stop.prevent="openTaskCardFromTreemap(stage.id, task.id)">
                <span class="task-label">{{ task.title }}</span>
              </div>
            </template>
            <div v-else class="no-tasks">
              Нет задач
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
import { onMounted, onUnmounted, computed, inject, unref, ref } from 'vue'
import { useBlocks } from '@/composables/useBlocks'
import { useHeatmap } from '@/composables/useHeatmap'
import { useTasks } from '@/composables/useTasks'
import { useNotification } from '@/composables/useNotification'
import TaskCardModal from '@/components/common/TaskCardModal.vue'

// Heatmap-экран: визуализирует этапы/задачи как treemap и открывает карточку задачи по клику.
const emit = defineEmits(['edit-block'])

const { blocks, totalEffort, completedEffort, completedEffortPercent, getTaskProgress, getOriginalBlock } = useBlocks()
const { stagePositions, taskPositions, getStageStyle, getTaskStyle, updateAllPositions, updateTreemapSize } = useHeatmap()
const { saveTaskCard, deleteTask } = useTasks()
const { showNotificationMessage } = useNotification()

const readOnlyInjected = inject('readOnly', computed(() => false))
const readOnly = computed(() => Boolean(unref(readOnlyInjected)))
const taskCardModalOpen = ref(false)
const taskCardBlock = ref(null)
const taskCardTask = ref(null)

const onStageClick = (stage) => {
  emit('edit-block', getOriginalBlock(stage.id))
}

const openTaskCardFromTreemap = (stageId, taskId) => {
  if (readOnly.value) return
  const block = getOriginalBlock(stageId)
  if (!block) return
  const task = (Array.isArray(block.tasks) ? block.tasks : []).find((row) => String(row.id) === String(taskId))
  if (!task) return
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
  const block = taskCardBlock.value
  const task = taskCardTask.value
  if (!block || !task) return
  const result = await saveTaskCard(block, task, patch)
  if (result?.success) {
    showNotificationMessage('✅ Карточка задачи сохранена', 'success')
    closeTaskCardModal()
    return
  }
  showNotificationMessage(result?.message || '❌ Ошибка сохранения карточки задачи', 'error')
}

const deleteTaskCardModal = async () => {
  const block = taskCardBlock.value
  const task = taskCardTask.value
  if (!block || !task) return
  const result = await deleteTask(block, task)
  if (result?.success) {
    showNotificationMessage('🗑️ Задача удалена', 'success')
    closeTaskCardModal()
    return
  }
  showNotificationMessage(result?.message || '❌ Ошибка удаления задачи', 'error')
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear()
  return `${day}.${month}.${year}`
}

onMounted(() => {
  updateAllPositions()
  updateTreemapSize()
  window.addEventListener('resize', updateTreemapSize)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateTreemapSize)
})
</script>

<style scoped>
/* Стили для тепловой карты */
.heatmap-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  overflow: hidden;
  background: #f8fafc;
}
.heatmap-header {
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 10px;
  background: white;
  padding: 12px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}
.heatmap-title-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.heatmap-title-section h2 {
  font-size: 1.32rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}
.heatmap-legend { display: flex; gap: 16px; flex-wrap: wrap; }
.legend-item { display: flex; align-items: center; gap: 6px; font-size: 0.74rem; color: #475569; }
.legend-color { width: 14px; height: 14px; border-radius: 3px; border: 1px solid #e2e8f0; }
.legend-overdue { background: #ef4444; }
.legend-overdue-progress {
  background-color: #ef4444;
  background-image: repeating-linear-gradient(
    135deg,
    rgba(255,255,255,0.26) 0px,
    rgba(255,255,255,0.26) 5px,
    rgba(239,68,68,0) 5px,
    rgba(239,68,68,0) 10px
  );
}
.heatmap-stats { display: flex; gap: 8px; flex-wrap: wrap; }
.heatmap-stat {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f1f5f9;
  padding: 3px 9px;
  border-radius: 30px;
  font-size: 0.72rem;
}
.stat-icon {
  font-size: 0.74rem;
  line-height: 1;
}
.stat-label {
  color: #64748b;
}
.stat-value {
  font-weight: 700;
  color: #1e293b;
}
.heatmap-container {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  min-height: 0;
  width: 100%;
  margin-top: 16px;
}
.treemap-area {
  position: relative;
  width: calc(100% - 40px);
  height: calc(100% - 40px);
  min-height: 450px;
  background: #f1f5f9;
  border: 2px solid #cbd5e1;
  overflow: hidden;
  border-radius: 8px;
  margin: 20px;
}
.treemap-stage {
  position: absolute;
  transition: all 0.2s;
  cursor: pointer;
  overflow: hidden;
}
.treemap-stage:hover {
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.95);
  z-index: 20;
}
.stage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  padding: 2px 4px;
  background: rgba(255,255,255,0.7);
  border-radius: 4px;
  font-size: 0.75rem;
  backdrop-filter: blur(2px);
}
.stage-title {
  font-weight: 700;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
}
.stage-metrics { display: flex; gap: 15px; align-items: center; flex-shrink: 0; }
.stage-effort, .stage-progress, .stage-date { font-weight: 700; color: #0f172a; font-size: 0.8rem; }
.tasks-area {
  position: relative;
  width: 100%;
  height: calc(100% - 24px);
  background: rgba(255,255,255,0.2);
  border-radius: 4px;
  overflow: hidden;
}
.treemap-task {
  transition: filter 0.15s ease;
  z-index: 10;
  overflow: hidden;
  white-space: normal;
}
.treemap-task:hover,
.treemap-task:focus-visible {
  filter: brightness(0.82) saturate(0.95);
  z-index: 30;
  outline: none;
}
.task-label {
  color: var(--task-label-color, #0f2a4d);
  font-weight: 700;
  text-shadow: none;
  font-size: inherit;
  line-height: 1.25;
  display: block;
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.no-tasks {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #94a3b8;
  font-style: italic;
  font-size: 0.7rem;
}
</style>