import { ref } from 'vue'
import { useBlocks } from './useBlocks'
import {
  removePredecessorIdFromAllTasks,
  filterPredecessorsToExistingTasks
} from '@/utils/taskModel'

// Guard от ложного blur сразу после открытия inline-редактора.
/** Сразу после открытия редактирования textarea может получить ложный blur (вирт. скроллер / пересчёт высоты). */
const TASK_EDIT_BLUR_GUARD_MS = 450
const taskEditBlurGuardUntil = new WeakMap()

export function useTasks() {
  // Базовые операции с этапом (сохранение + принудительный пересчет layout).
  const { updateBlock, forceUpdatePositions } = useBlocks()
  const taskStatusUpdateInFlight = new Set()

  // Состояние Drag&Drop задач.
  const draggedTask = ref(null)
  const draggedFromBlock = ref(null)
  const dragOverBlock = ref(null)
  const dragOverTask = ref(null)
  let dragOverClearTimer = null

  // Отмена отложенного сброса drag-over.
  const cancelDragOverClear = () => {
    if (!dragOverClearTimer) return
    clearTimeout(dragOverClearTimer)
    dragOverClearTimer = null
  }

  // Полный сброс состояния hover/drop-цели.
  const clearDragOverState = () => {
    cancelDragOverClear()
    dragOverBlock.value = null
    dragOverTask.value = null
  }

  // Сортировка задач по полю порядка.
  const getSortedTasks = (tasks) => {
    if (!tasks) return []
    return [...tasks].sort((a, b) => (a.order || 0) - (b.order || 0))
  }

  // UI-helpers статусов задачи.
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

  const getStatusTitle = (status) => {
    switch(status) {
      case 'done': return 'Выполнено'
      case 'progress': return 'В работе'
      default: return 'Не начато'
    }
  }

  // Создает новую задачу в конце списка этапа.
  const addTask = async (block) => {
    const newTask = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      title: 'Новая задача',
      linkUrl: '',
      linkNote: '',
      status: 'todo',
      order: block.tasks ? block.tasks.length : 0,
      predecessorIds: []
    }
    const updatedTasks = block.tasks ? [...block.tasks, newTask] : [newTask]
    const updatedBlock = { ...block, tasks: updatedTasks }
    const result = await updateBlock(updatedBlock)
    if (result.success) {
      forceUpdatePositions()
    }
    return {
      ...result,
      newTaskId: newTask.id
    }
  }

  // Циклическая смена статуса: todo -> progress -> done -> todo.
  const cycleTaskStatus = async (block, task, event) => {
    if (event) event.stopPropagation()
    if (!block?.id || !task?.id) return { success: false, message: 'Некорректные данные задачи' }
    const inFlightKey = `${String(block.id)}::${String(task.id)}`
    if (taskStatusUpdateInFlight.has(inFlightKey)) {
      return { success: false, busy: true }
    }
    taskStatusUpdateInFlight.add(inFlightKey)
    const previousTasks = Array.isArray(block.tasks) ? [...block.tasks] : []
    try {
      const nextStatus = getNextStatus(task.status || 'todo')
      const updatedTasks = previousTasks.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
      // Optimistic UI: пользователь видит новый статус мгновенно.
      block.tasks = updatedTasks
      const updatedBlock = { ...block, tasks: updatedTasks }
      const result = await updateBlock(updatedBlock)
      if (!result.success) {
        // Откат локального оптимистичного обновления при ошибке API.
        block.tasks = previousTasks
      } else {
        forceUpdatePositions()
      }
      return result
    } finally {
      taskStatusUpdateInFlight.delete(inFlightKey)
    }
  }

  // Удаление задачи + очистка зависимостей на нее у остальных задач.
  const deleteTask = async (block, task, event) => {
    if (event) event.stopPropagation()
    const updatedTasks = removePredecessorIdFromAllTasks(
      block.tasks.filter(t => t.id !== task.id),
      task.id
    )
    const updatedBlock = { ...block, tasks: updatedTasks }
    const result = await updateBlock(updatedBlock)
    if (result.success) {
      forceUpdatePositions()
    }
    return result
  }

  // Inline-редактирование названия задачи.
  const startTaskEdit = (block, task, event) => {
    if (event) event.stopPropagation()
    block.tasks.forEach(t => {
      if (t.id !== task.id) {
        t.isEditing = false
        delete t.editValue
      }
    })
    task.isEditing = true
    task.editValue = task.title
    taskEditBlurGuardUntil.set(task, performance.now() + TASK_EDIT_BLUR_GUARD_MS)
  }

  const saveTaskEdit = async (block, task, event) => {
    if (event) event.stopPropagation()
    const guardUntil = taskEditBlurGuardUntil.get(task)
    if (guardUntil && performance.now() < guardUntil) {
      return { success: false, skippedBlur: true }
    }
    if (!task.editValue || task.editValue.trim() === '') {
      task.isEditing = false
      delete task.editValue
      return
    }
    const newTitle = task.editValue.trim()
    const updatedTasks = block.tasks.map(t => t.id === task.id ? { ...t, title: newTitle, isEditing: false } : t)
    const updatedBlock = { ...block, tasks: updatedTasks }
    const result = await updateBlock(updatedBlock)
    if (result.success) forceUpdatePositions()
    return result
  }

  const cancelTaskEdit = (task) => {
    task.isEditing = false
    delete task.editValue
  }

  // Нормализация пользовательского ввода карточки задачи.
  const normalizeLinkUrl = (raw) => {
    if (!raw || typeof raw !== 'string') return ''
    const trimmed = raw.trim()
    if (!trimmed) return ''
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    return `https://${trimmed}`
  }

  const normalizeDateValue = (value) => {
    if (!value || typeof value !== 'string') return ''
    const trimmed = value.trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : ''
  }

  const normalizeTaskDates = (startDateRaw, releaseDateRaw) => {
    let startDate = normalizeDateValue(startDateRaw)
    let releaseDate = normalizeDateValue(releaseDateRaw)

    if (startDate && releaseDate && startDate > releaseDate) releaseDate = startDate

    return { startDate, releaseDate }
  }

  // Сохранение данных карточки задачи в рамках этапа.
  const saveTaskCard = async (block, task, patch) => {
    if (!block?.tasks?.length || !task?.id) return { success: false, message: 'Задача не найдена' }
    const { startDate, releaseDate } = normalizeTaskDates(patch?.startDate, patch?.releaseDate)
    const updatedTasks = block.tasks.map((t) => {
      if (t.id !== task.id) return t
      const title = String(patch?.title || '').trim()
      return {
        ...t,
        title: title || t.title || 'Новая задача',
        linkUrl: normalizeLinkUrl(patch?.linkUrl || ''),
        linkNote: String(patch?.linkNote || '').trim(),
        startDate,
        releaseDate,
        effort: Math.max(0, Number(patch?.effort) || 0)
      }
    })
    const updatedBlock = { ...block, tasks: updatedTasks }
    const result = await updateBlock(updatedBlock)
    if (result.success) forceUpdatePositions()
    return result
  }

  // ===== Drag&Drop задач между/внутри этапов =====
  const onTaskDragStart = (event, block, task) => {
    event.stopPropagation()
    const t = event.target
    if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.tagName === 'BUTTON' || t?.closest?.('button')) {
      event.preventDefault()
      return
    }
    draggedTask.value = task
    draggedFromBlock.value = block
    event.dataTransfer.setData('text/plain', JSON.stringify({
      taskId: task.id,
      blockId: block.id,
      taskTitle: task.title
    }))
    event.dataTransfer.effectAllowed = 'move'
  }

  const onTaskDragEnd = () => {
    draggedTask.value = null
    draggedFromBlock.value = null
    clearDragOverState()
  }

  const onTaskDragOver = (event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const onTaskDragEnter = (block, task) => {
    cancelDragOverClear()
    if (draggedTask.value && draggedTask.value.id !== task.id) {
      dragOverBlock.value = block
      dragOverTask.value = task
    }
  }

  const onTaskDragLeave = (event) => {
    const relatedTarget = event.relatedTarget
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) return
    cancelDragOverClear()
    dragOverClearTimer = setTimeout(() => {
      dragOverClearTimer = null
      if (!draggedTask.value) return
      dragOverBlock.value = null
      dragOverTask.value = null
    }, 90)
  }

  const onTaskDrop = async (event, targetBlock, targetTask = null) => {
    event.preventDefault()
    event.stopPropagation()
    if (!draggedTask.value || !draggedFromBlock.value) return

    const sourceBlock = draggedFromBlock.value
    const sourceTask = draggedTask.value

    if (sourceBlock.id === targetBlock.id) {
      if (!targetTask) {
        await reorderTaskToEndOfBlock(sourceBlock, sourceTask)
      } else {
        await reorderTaskInsideBlock(sourceBlock, sourceTask, targetTask)
      }
    } else {
      await moveTaskBetweenBlocks(sourceBlock, targetBlock, sourceTask, targetTask)
    }

    draggedTask.value = null
    draggedFromBlock.value = null
    clearDragOverState()
  }

  // Переставляет задачу в конец текущего этапа.
  const reorderTaskToEndOfBlock = async (block, sourceTask) => {
    if (!block.tasks?.length) return
    const newTasks = block.tasks.filter(t => t.id !== sourceTask.id)
    newTasks.push(sourceTask)
    newTasks.forEach((task, idx) => { task.order = idx })
    const updatedBlock = { ...block, tasks: newTasks }
    const result = await updateBlock(updatedBlock)
    if (result.success) forceUpdatePositions()
    return result
  }

  // Перестановка задач внутри одного этапа.
  const reorderTaskInsideBlock = async (block, sourceTask, targetTask) => {
    if (!targetTask || sourceTask.id === targetTask.id) return
    const newTasks = [...block.tasks]
    const sourceIndex = newTasks.findIndex(t => t.id === sourceTask.id)
    const targetIndex = newTasks.findIndex(t => t.id === targetTask.id)
    if (sourceIndex === -1 || targetIndex === -1) return
    const [movedTask] = newTasks.splice(sourceIndex, 1)
    newTasks.splice(targetIndex, 0, movedTask)
    newTasks.forEach((task, idx) => { task.order = idx })
    const updatedBlock = { ...block, tasks: newTasks }
    const result = await updateBlock(updatedBlock)
    if (result.success) forceUpdatePositions()
    return result
  }

  // Перенос задачи между этапами с очисткой невалидных зависимостей.
  const moveTaskBetweenBlocks = async (sourceBlock, targetBlock, sourceTask, targetTask) => {
    const sourceTasks = removePredecessorIdFromAllTasks(
      sourceBlock.tasks.filter(t => t.id !== sourceTask.id),
      sourceTask.id
    )
    const taskToMoveRaw = { ...sourceTask, isEditing: false }

    let targetTasks
    if (targetTask) {
      const targetIndex = targetBlock.tasks.findIndex(t => t.id === targetTask.id)
      targetTasks = [...targetBlock.tasks]
      targetTasks.splice(targetIndex, 0, taskToMoveRaw)
    } else {
      targetTasks = [...targetBlock.tasks, taskToMoveRaw]
    }

    const allowedIds = new Set(targetTasks.map((t) => t.id))
    const taskToMove = filterPredecessorsToExistingTasks(taskToMoveRaw, allowedIds)
    const movedIdx = targetTasks.findIndex((t) => t.id === sourceTask.id)
    if (movedIdx !== -1) targetTasks[movedIdx] = taskToMove

    sourceTasks.forEach((task, idx) => { task.order = idx })
    targetTasks.forEach((task, idx) => { task.order = idx })

    const updateSource = await updateBlock({ ...sourceBlock, tasks: sourceTasks })
    const updateTarget = await updateBlock({ ...targetBlock, tasks: targetTasks })
    if (updateSource.success && updateTarget.success) forceUpdatePositions()
    return { success: updateSource.success && updateTarget.success }
  }

  return {
    draggedTask,
    draggedFromBlock,
    dragOverBlock,
    dragOverTask,
    getSortedTasks,
    getStatusIcon,
    getStatusColor,
    getNextStatus,
    getStatusTitle,
    addTask,
    cycleTaskStatus,
    deleteTask,
    startTaskEdit,
    saveTaskEdit,
    cancelTaskEdit,
    saveTaskCard,
    onTaskDragStart,
    onTaskDragEnd,
    onTaskDragOver,
    onTaskDragEnter,
    onTaskDragLeave,
    onTaskDrop
  }
}