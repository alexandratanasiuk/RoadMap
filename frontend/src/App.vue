<template>
  <div class="app">
    <AppHeader 
      @create-block="createNewBlock"
      @export-png="exportAsPNG"
      @export-pdf="exportAsPDF"
      @export-excel="exportTableAsExcel"
      @login-success="handleLoginSuccess"
      :projects="projects"
      :active-project-id="activeProjectId"
      :projects-loading="isLoadingProjects"
      @switch-project="handleSwitchProject"
      @create-project="handleCreateProject"
      @rename-project="handleRenameProject"
      @delete-project="handleDeleteProject"
      @add-project-member="handleAddProjectMember"
      @remove-project-member="handleRemoveProjectMember"
    />
   
    <div class="main-content">
      <div v-if="!isAuthenticated" class="pre-login-placeholder" aria-hidden="true" />
      <template v-else>
        <WorkspaceView
          v-show="currentViewMode === 'workspace'"
          class="main-view-fill"
        />
        <AssistantView
          v-show="currentViewMode === 'assistant'"
          class="main-view-fill"
        />
        <HorizontalView 
          v-if="currentViewMode === 'horizontal'" 
          :key="'horizontal-'+currentViewMode"
          @editBlock="openEditModal"
        />
        <QuartersView 
          v-else-if="currentViewMode === 'quarters'"
          :key="'quarters-'+currentViewMode"
          @editBlock="openEditModal"
        />
        <HeatmapView 
          v-else-if="currentViewMode === 'heatmap'"
          :key="'heatmap-'+currentViewMode"
          @editBlock="openEditModal"
        />
        <GanttView 
          v-else-if="currentViewMode === 'gantt'"
          :key="'gantt-'+currentViewMode"
          @editBlock="openEditModal"
        />
        <RoadmapCanvas
          v-else-if="currentViewMode === 'roadmap'"
          :key="'roadmap-'+currentViewMode"
          @editBlock="openEditModal"
        />
        <UsersTestDirectoryView
          v-else-if="currentViewMode === 'users'"
          :key="'users-'+currentViewMode"
        />
        <TableView
          v-else-if="currentViewMode === 'table'"
          :key="'table-'+currentViewMode"
          @editBlock="openEditModal"
        />
        <div v-else-if="showUnknownViewModePlaceholder" class="empty-state">
          Выберите режим отображения
        </div>
      </template>
    </div>
    
    <ModalEditBlock 
          v-if="showModal" 
      :block="editingBlock" 
      @close="closeModal" 
      @save="saveBlock"
      @delete="deleteBlockHandler"
    />
    
    <Notification 
      :show="showNotification" 
      :message="notificationMessage" 
      :type="notificationType" 
    />

    <FloatingAssistantDock v-if="isAuthenticated" />
  </div>
</template>

<script setup>
import { ref, onMounted, provide, computed, watch } from 'vue'
import html2canvas from 'html2canvas'
import { useAuth } from '@/composables/useAuth'
import { useBlocks } from '@/composables/useBlocks'
import { useProjects } from '@/composables/useProjects'
import { useViewMode } from '@/composables/useViewMode'
import { useNotification } from '@/composables/useNotification'

// Компоненты
import AppHeader from '@/components/layout/AppHeader.vue'
import HorizontalView from '@/components/views/HorizontalView.vue'
import QuartersView from '@/components/views/QuartersView.vue'
import HeatmapView from '@/components/views/HeatmapView.vue'
import GanttView from '@/components/views/GanttView.vue'
import RoadmapCanvas from '@/components/views/RoadmapCanvas.vue'
import UsersTestDirectoryView from '@/components/views/UsersTestDirectoryView.vue'
import WorkspaceView from '@/components/views/WorkspaceView.vue'
import TableView from '@/components/views/TableView.vue'
import AssistantView from '@/components/views/AssistantView.vue'
import FloatingAssistantDock from '@/components/assistant/FloatingAssistantDock.vue'
import ModalEditBlock from '@/components/common/ModalEditBlock.vue'
import Notification from '@/components/common/Notification.vue'

// Composables: источник auth, данных этапов/проектов, режима view и уведомлений.
const { isAuthenticated, isReadOnly } = useAuth()
const { 
  blocks,
  loadBlocks, 
  createNewBlock, 
  updateBlock,
  deleteBlock,
  getTaskProgress,
  getCompletedTasksCount,
  calculateBlockHeight,
  getBlockBackgroundColor,
  getEffortColor,
  getPriorityClass,
  getPriorityIcon,
  getProgressColor,
  updateBlockDate,
  forceUpdatePositions
} = useBlocks()
const {
  projects,
  activeProjectId,
  isLoadingProjects,
  loadProjects,
  setActiveProject,
  createProject,
  renameProject,
  deleteProject,
  addProjectMember,
  removeProjectMember
} = useProjects()
const { viewMode } = useViewMode()
const currentViewMode = computed(() => {
  // На случай, если в localStorage остался старый режим "months".
  if (viewMode.value === 'months') return 'horizontal'
  return viewMode.value
})

const KNOWN_MAIN_VIEW_MODES = new Set([
  'horizontal',
  'quarters',
  'heatmap',
  'gantt',
  'roadmap',
  'users',
  'workspace',
  'table',
  'assistant'
])

const showUnknownViewModePlaceholder = computed(
  () => !KNOWN_MAIN_VIEW_MODES.has(currentViewMode.value)
)
const { showNotification, notificationMessage, notificationType, showNotificationMessage } = useNotification()

// Глобально пробрасываем этапы и actions во все view-компоненты через provide/inject.
provide('blocks', blocks)
provide('readOnly', isReadOnly)
provide('blocksActions', {
  createNewBlock,
  updateBlock,
  updateBlockDate,
  forceUpdatePositions,
  deleteBlock,
  getTaskProgress,
  getCompletedTasksCount,
  calculateBlockHeight,
  getBlockBackgroundColor,
  getEffortColor,
  getPriorityClass,
  getPriorityIcon,
  getProgressColor
})

// Состояние модалки редактирования этапа.
const showModal = ref(false)
const editingBlock = ref(null)

// Базовые обработчики модалки этапа.
const openEditModal = (block) => {
  editingBlock.value = { ...block }
  showModal.value = true
}

const deleteBlockHandler = async (blockId) => {
  const result = await deleteBlock(blockId)
  if (result.success) {
    closeModal()
    showNotificationMessage(result.message, 'success')
  } else {
    showNotificationMessage(result.message, 'error')
  }
}

const closeModal = () => {
  showModal.value = false
  editingBlock.value = null
}

const saveBlock = async (updatedBlock) => {
  const result = await updateBlock(updatedBlock)
  if (result.success) {
    closeModal()
    showNotificationMessage('✅ Этап сохранён')
  } else {
    showNotificationMessage(result.message || '❌ Ошибка сохранения', 'error')
  }
}

// Обработчики CRUD проектов из шапки.
const handleLoginSuccess = async () => {
  await loadProjects()
  await loadBlocks()
}

const handleSwitchProject = async (projectId) => {
  setActiveProject(projectId)
}

const handleCreateProject = async (name) => {
  const result = await createProject(name)
  if (!result.success) {
    showNotificationMessage(result.message || '❌ Ошибка создания проекта', 'error')
    return
  }
  await loadBlocks()
  showNotificationMessage('✅ Проект создан')
}

const handleRenameProject = async ({ projectId, name }) => {
  const result = await renameProject(projectId, name)
  if (!result.success) {
    showNotificationMessage(result.message || '❌ Ошибка переименования проекта', 'error')
    return
  }
  showNotificationMessage('✅ Название проекта обновлено')
}

const handleDeleteProject = async (projectId) => {
  const result = await deleteProject(projectId)
  if (!result.success) {
    showNotificationMessage(result.message || '❌ Ошибка удаления проекта', 'error')
    return
  }
  await loadBlocks()
  showNotificationMessage('✅ Проект удален')
}

const handleAddProjectMember = async ({ projectId, username }) => {
  const result = await addProjectMember({ projectId, username })
  if (!result.success) {
    showNotificationMessage(result.message || '❌ Ошибка добавления участника', 'error')
    return
  }
  showNotificationMessage(`✅ Пользователь "${username}" добавлен в проект`)
}

const handleRemoveProjectMember = async ({ projectId, username }) => {
  const result = await removeProjectMember({ projectId, username })
  if (!result.success) {
    showNotificationMessage(result.message || '❌ Ошибка удаления участника', 'error')
    return
  }
  showNotificationMessage(`✅ Пользователь "${username}" удалён из проекта`)
}

// Экспорт текущего view в PNG/PDF.
const exportAsPNG = async () => {
  try {
    showNotificationMessage('🔄 Подготовка изображения...', 'info')
    const elementToExport = document.querySelector('.main-content')
    if (!elementToExport) {
      showNotificationMessage('❌ Контент не найден', 'error')
      return
    }

    const canvas = await html2canvas(elementToExport, {
      scale: 2,
      backgroundColor: '#ffffff'
    })
    const link = document.createElement('a')
    link.download = `roadmap-${currentViewMode.value}-${new Date().toISOString().slice(0, 10)}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    showNotificationMessage('✅ PNG сохранен')
  } catch (error) {
    console.error('Ошибка при экспорте PNG:', error)
    showNotificationMessage('❌ Ошибка экспорта PNG', 'error')
  }
}

const exportAsPDF = async () => {
  try {
    showNotificationMessage('🔄 Подготовка PDF...', 'info')
    const elementToExport = document.querySelector('.main-content')
    if (!elementToExport) {
      showNotificationMessage('❌ Контент не найден', 'error')
      return
    }

    const canvas = await html2canvas(elementToExport, {
      scale: 2,
      backgroundColor: '#ffffff'
    })
    const imgData = canvas.toDataURL('image/png')
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const margin = 10
    const imgWidth = pageWidth - margin * 2
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight)
    pdf.save(`roadmap-${currentViewMode.value}-${new Date().toISOString().slice(0, 10)}.pdf`)
    showNotificationMessage('✅ PDF сохранен')
  } catch (error) {
    console.error('Ошибка при экспорте PDF:', error)
    showNotificationMessage('❌ Ошибка экспорта PDF', 'error')
  }
}

// Вспомогательные date helpers для формирования Excel-таймлайна.
const formatDateForExport = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}.${month}.${year}`
}

const parseIsoDateLocal = (dateLike) => {
  if (!dateLike || typeof dateLike !== 'string') return null
  const trimmed = dateLike.trim()
  if (!trimmed) return null
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const y = Number(m[1])
  const mon = Number(m[2]) - 1
  const d = Number(m[3])
  const date = new Date(y, mon, d)
  return Number.isNaN(date.getTime()) ? null : date
}

const startOfLocalDay = (dateObj) => new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate())

const dayDiff = (from, to) => {
  const DAY_MS = 24 * 60 * 60 * 1000
  return Math.floor((startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) / DAY_MS)
}

const monthNameRu = (monthIndex) => {
  const names = [
    'ЯНВАРЬ',
    'ФЕВРАЛЬ',
    'МАРТ',
    'АПРЕЛЬ',
    'МАЙ',
    'ИЮНЬ',
    'ИЮЛЬ',
    'АВГУСТ',
    'СЕНТЯБРЬ',
    'ОКТЯБРЬ',
    'НОЯБРЬ',
    'ДЕКАБРЬ'
  ]
  return names[monthIndex] || ''
}

const enumerateDays = (rangeStart, rangeEnd) => {
  const days = []
  const cursor = new Date(rangeStart.getTime())
  while (cursor <= rangeEnd) {
    days.push(new Date(cursor.getTime()))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

const getTimelineRange = (orderedBlocks) => {
  if (!Array.isArray(orderedBlocks) || !orderedBlocks.length) {
    const now = new Date()
    const year = now.getFullYear()
    return {
      start: new Date(year, 0, 1),
      end: new Date(year, 11, 31)
    }
  }

  const stageStartCandidates = orderedBlocks
    .map((block) => parseIsoDateLocal(block?.startDate) || parseIsoDateLocal(block?.releaseDate))
    .filter(Boolean)

  const stageEndCandidates = orderedBlocks
    .map((block) => parseIsoDateLocal(block?.releaseDate) || parseIsoDateLocal(block?.startDate))
    .filter(Boolean)

  if (!stageStartCandidates.length || !stageEndCandidates.length) {
    const now = new Date()
    const year = now.getFullYear()
    return {
      start: new Date(year, 0, 1),
      end: new Date(year, 11, 31)
    }
  }

  // Диапазон строго по этапам: от старта самого раннего этапа до финиша самого позднего этапа.
  stageStartCandidates.sort((a, b) => a.getTime() - b.getTime())
  stageEndCandidates.sort((a, b) => a.getTime() - b.getTime())
  return {
    start: startOfLocalDay(stageStartCandidates[0]),
    end: startOfLocalDay(stageEndCandidates[stageEndCandidates.length - 1])
  }
}

const taskStatusLabel = (status) => {
  switch (status) {
    case 'done':
      return 'готова'
    case 'progress':
      return 'в работе'
    default:
      return 'не начата'
  }
}

const stageProgressPercent = (block) => {
  const tasks = Array.isArray(block?.tasks) ? block.tasks : []
  if (!tasks.length) return 0
  const doneCount = tasks.filter((task) => task?.status === 'done').length
  return Math.round((doneCount / tasks.length) * 100)
}

const stageTimelineStatus = (block) => {
  const tasks = Array.isArray(block?.tasks) ? block.tasks : []
  if (!tasks.length) return 'todo'
  const allDone = tasks.every((task) => task?.status === 'done')
  if (allDone) return 'done'
  const hasStarted = tasks.some((task) => task?.status === 'progress' || task?.status === 'done')
  return hasStarted ? 'progress' : 'todo'
}

const statusFillColor = (status) => {
  switch (status) {
    case 'done':
      return '86EFAC'
    case 'progress':
      return '93C5FD'
    default:
      return 'E5E7EB'
  }
}

const buildTimelineCells = ({
  rangeStart,
  totalDays,
  startDate,
  endDate,
  baseStatus,
  progressPercent = 0
}) => {
  const cells = Array.from({ length: totalDays }, () => '')
  const start = parseIsoDateLocal(startDate)
  const end = parseIsoDateLocal(endDate)
  if (!start && !end) return cells

  const spanStart = start || end
  const spanEnd = end || start
  const rawFrom = dayDiff(rangeStart, spanStart)
  const rawTo = dayDiff(rangeStart, spanEnd)
  const from = Math.max(0, Math.min(totalDays - 1, Math.min(rawFrom, rawTo)))
  const to = Math.max(0, Math.min(totalDays - 1, Math.max(rawFrom, rawTo)))
  const spanDays = Math.max(1, to - from + 1)
  const doneDays = Math.max(0, Math.min(spanDays, Math.round((Math.max(0, Math.min(100, progressPercent)) / 100) * spanDays)))

  for (let i = from; i <= to; i += 1) {
    const inProgressFill = i - from < doneDays
    cells[i] = inProgressFill ? 'done' : baseStatus
  }
  return cells
}

const exportTableAsExcel = async () => {
  try {
    showNotificationMessage('🔄 Подготовка Excel...', 'info')
    const orderedBlocks = [...(blocks.value || [])].sort((a, b) => {
      const ta = new Date(a?.releaseDate || a?.startDate || 0).getTime() || 0
      const tb = new Date(b?.releaseDate || b?.startDate || 0).getTime() || 0
      return ta - tb
    })

    const xlsxModule = await import('xlsx-js-style')
    const XLSX = xlsxModule.default || xlsxModule
    const timelineRange = getTimelineRange(orderedBlocks)
    const timelineDays = enumerateDays(timelineRange.start, timelineRange.end)
    const totalDays = timelineDays.length
    const staticHeaders = ['Тип', 'Этап', 'Задача', 'Владелец этапа', 'Дата начала', 'Дата окончания', 'Готовность', 'Статус задачи']

    const monthRow = [...staticHeaders]
    const dayRow = Array.from({ length: staticHeaders.length }, () => '')
    timelineDays.forEach((d) => {
      monthRow.push(monthNameRu(d.getMonth()))
      dayRow.push(String(d.getDate()))
    })

    const tableRows = [monthRow, dayRow]
    const timelineStatusRows = []

    orderedBlocks.forEach((block) => {
      const tasks = Array.isArray(block?.tasks)
        ? [...block.tasks].sort((a, b) => (a?.order || 0) - (b?.order || 0))
        : []

      const stageStatus = stageTimelineStatus(block)
      const stageProgress = stageProgressPercent(block)
      const stageTimeline = buildTimelineCells({
        rangeStart: timelineRange.start,
        totalDays,
        startDate: block?.startDate || '',
        endDate: block?.releaseDate || '',
        baseStatus: stageStatus,
        progressPercent: stageProgress
      })

      tableRows.push([
        'Этап',
        block?.title || '',
        '',
        block?.ownerUsername || '',
        formatDateForExport(block?.startDate),
        formatDateForExport(block?.releaseDate),
        `${stageProgress}%`,
        '',
        ...Array.from({ length: totalDays }, () => '')
      ])
      timelineStatusRows.push(stageTimeline)

      tasks.forEach((task) => {
        const taskTimeline = buildTimelineCells({
          rangeStart: timelineRange.start,
          totalDays,
          startDate: task?.startDate || '',
          endDate: task?.releaseDate || '',
          baseStatus: task?.status || 'todo'
        })

        tableRows.push([
          'Задача',
          block?.title || '',
          task?.title || '',
          block?.ownerUsername || '',
          formatDateForExport(task?.startDate),
          formatDateForExport(task?.releaseDate),
          '',
          taskStatusLabel(task?.status || 'todo'),
          ...Array.from({ length: totalDays }, () => '')
        ])
        timelineStatusRows.push(taskTimeline)
      })
    })

    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet(tableRows)

    const merges = []
    for (let c = 0; c < staticHeaders.length; c += 1) {
      merges.push({ s: { r: 0, c }, e: { r: 1, c } })
    }
    let monthStartIdx = 0
    while (monthStartIdx < timelineDays.length) {
      const month = timelineDays[monthStartIdx].getMonth()
      let monthEndIdx = monthStartIdx
      while (monthEndIdx + 1 < timelineDays.length && timelineDays[monthEndIdx + 1].getMonth() === month) {
        monthEndIdx += 1
      }
      merges.push({
        s: { r: 0, c: staticHeaders.length + monthStartIdx },
        e: { r: 0, c: staticHeaders.length + monthEndIdx }
      })
      monthStartIdx = monthEndIdx + 1
    }
    worksheet['!merges'] = merges

    const dayCols = Array.from({ length: totalDays }, () => ({ wch: 3 }))
    worksheet['!cols'] = [
      { wch: 8 },
      { wch: 26 },
      { wch: 36 },
      { wch: 20 },
      { wch: 14 },
      { wch: 14 },
      { wch: 12 },
      { wch: 14 },
      ...dayCols
    ]

    const thinBorder = {
      style: 'thin',
      color: { rgb: 'CBD5E1' }
    }
    const timelineStartCol = staticHeaders.length
    timelineStatusRows.forEach((statusRow, rowIndex) => {
      const excelRow = 2 + rowIndex + 1 // 2 header rows + 1-indexing
      statusRow.forEach((status, dayIndex) => {
        if (!status) return
        const excelCol = timelineStartCol + dayIndex + 1
        const cellAddress = XLSX.utils.encode_cell({ r: excelRow - 1, c: excelCol - 1 })
        const existingCell = worksheet[cellAddress] || { t: 's', v: '' }
        existingCell.s = {
          fill: {
            patternType: 'solid',
            fgColor: { rgb: statusFillColor(status) }
          },
          border: {
            top: thinBorder,
            right: thinBorder,
            bottom: thinBorder,
            left: thinBorder
          }
        }
        worksheet[cellAddress] = existingCell
      })
    })

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Таблица')
    const fileDate = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `roadmap-table-${fileDate}.xlsx`)
    showNotificationMessage('✅ Excel сохранен')
  } catch (error) {
    console.error('Ошибка при экспорте Excel:', error)
    showNotificationMessage('❌ Ошибка экспорта Excel', 'error')
  }
}

onMounted(async () => {
  if (isAuthenticated.value) {
    await loadProjects()
    await loadBlocks()
  }
})

watch(activeProjectId, async (nextId, prevId) => {
  if (!isAuthenticated.value) return
  if (!nextId || nextId === prevId) return
  await loadBlocks()
  forceUpdatePositions()
})

watch(currentViewMode, async () => {
  if (!isAuthenticated.value) return
  if (!blocks.value?.length) await loadBlocks()
  forceUpdatePositions()
})
</script>

<style scoped>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body, html {
  margin: 0;
  padding: 0;
  background: #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  overflow: hidden !important;
}

.app {
  height: calc(100vh - 20px);
  margin: 10px;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
  font-family: 'Inter', -apple-system, sans-serif;
  overflow: hidden;
  padding: 10px;
}

.main-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 5px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  position: relative;
}

.pre-login-placeholder {
  flex: 1;
  min-height: 0;
  background: #fff;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #94a3b8;
  font-size: 1.2rem;
}

/* Только размеры: без display:flex — иначе перебивает grid у .workspace-root (3 колонки). */
.main-view-fill {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>