import { ref, computed } from 'vue'
import axios from 'axios'
import { useAuth } from './useAuth'
import { useProjects } from './useProjects'
import { normalizeTasksArray } from '@/utils/taskModel'

// Shared singleton state for all composable consumers.
const blocks = ref([])
const isLoadingBlocks = ref(false)

export function useBlocks() {
  // Зависимости: auth-контекст и текущий активный проект.
  const { isAuthenticated, handleLogout, API_URL, isReadOnly } = useAuth()
  const { activeProjectId } = useProjects()
  const apiPath = (path) => `${API_URL}${path.startsWith('/') ? path : `/${path}`}`
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  // Классификация сетевых ошибок для retry-логики.
  const isTransientNetworkError = (error) => {
    if (!error) return false
    if (error.code === 'ECONNABORTED') return true
    if (error.code === 'ETIMEDOUT') return true
    if (error.code === 'ERR_NETWORK') return true
    return !error.response
  }

  // PUT c повторной попыткой при временных сетевых сбоях.
  const putWithRetry = async (url, payload, options = {}) => {
    const attempts = options.attempts ?? 3
    const timeoutMs = options.timeoutMs ?? 15000
    let lastError = null
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await axios.put(url, payload, { timeout: timeoutMs })
      } catch (error) {
        lastError = error
        if (!isTransientNetworkError(error) || attempt >= attempts) {
          throw error
        }
        await sleep(350 * attempt)
      }
    }
    throw lastError
  }

  // Проверяет, относится ли этап к текущему выбранному проекту.
  const belongsToActiveProject = (blockLike) => {
    const currentProjectId = String(activeProjectId.value || '')
    const blockProjectId = String(blockLike?.projectId || '')
    if (!currentProjectId) return false
    return blockProjectId === currentProjectId
  }

  // Загружает этапы выбранного проекта и нормализует массив задач.
  const loadBlocks = async () => {
    if (!isAuthenticated.value) return
    if (isLoadingBlocks.value) return
    if (!activeProjectId.value) {
      blocks.value = []
      return { success: true, blocks: [] }
    }
    
    isLoadingBlocks.value = true
    try {
      const response = await axios.get(apiPath('/blocks'), {
        params: { projectId: activeProjectId.value }
      })
      blocks.value = response.data.map((b) => ({
        ...b,
        tasks: normalizeTasksArray(b.tasks)
      }))
      console.log('✅ Блоки загружены:', blocks.value.length)
      return { success: true, blocks: blocks.value }
    } catch (error) {
      console.error('❌ Ошибка загрузки:', error)
      if (error.response?.status === 401) {
        handleLogout()
      }
      return { success: false, error }
    } finally {
      isLoadingBlocks.value = false
    }
  }

  // Создание нового этапа с дефолтными датами и параметрами.
  const createNewBlock = async () => {
  if (!isAuthenticated.value) {
    return { success: false, message: 'Требуется авторизация' }
  }
  if (isReadOnly.value) {
    return { success: false, message: 'Режим только просмотра' }
  }
  if (!activeProjectId.value) {
    return { success: false, message: 'Сначала выберите проект' }
  }

  try {
    let startDate, releaseDate
    
    if (blocks.value.length > 0) {
      const sortedByEnd = [...blocks.value].sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate))
      const lastBlock = sortedByEnd[0]
      const lastEndDate = new Date(lastBlock.releaseDate)
      
      startDate = lastEndDate.toISOString().split('T')[0]
      const newEndDate = new Date(lastEndDate)
      newEndDate.setMonth(lastEndDate.getMonth() + 1)
      releaseDate = newEndDate.toISOString().split('T')[0]
    } else {
      const today = new Date()
      const firstStart = new Date(today.getFullYear(), today.getMonth(), 1)
      const firstEnd = new Date(firstStart)
      firstEnd.setMonth(firstStart.getMonth() + 1)
      firstEnd.setDate(firstEnd.getDate() - 1)
      
      startDate = firstStart.toISOString().split('T')[0]
      releaseDate = firstEnd.toISOString().split('T')[0]
    }
    
    const newBlock = {
      title: `Новый этап ${new Date().toLocaleString()}`,
      description: '',
      startDate: startDate,
      releaseDate: releaseDate,
      effort: 40,
      completed: false,
      tasks: [],
      projectId: activeProjectId.value
    }
    
    const response = await axios.post(apiPath('/blocks'), newBlock)
    blocks.value.push({
      ...response.data,
      tasks: normalizeTasksArray(response.data.tasks)
    })
    
    // ВАЖНО: принудительно обновляем позиции блоков
    forceUpdatePositions()
    
    return { success: true, block: response.data }
  } catch (error) {
    console.error('❌ Ошибка создания:', error)
    return { success: false, message: 'Ошибка создания' }
  }
}

      // Удаляет этап и обновляет локальный список/позиции.
      const deleteBlock = async (id) => {
        try {
          if (isReadOnly.value) {
            return { success: false, message: 'Режим только просмотра' }
          }
          console.log('🗑️ Удаляем блок с ID:', id)
          await axios.delete(apiPath(`/blocks/${id}`))
          blocks.value = blocks.value.filter(b => b.id !== id)
          forceUpdatePositions()
          return { success: true, message: '✅ Этап удален' }
        } catch (error) {
          console.error('❌ Ошибка удаления:', error)
          return { success: false, message: '❌ Ошибка удаления' }
        }
      }

  // Обновляет этап на сервере и синхронизирует локальный state.
  const updateBlock = async (block) => {
    try {
      if (isReadOnly.value) {
        return { success: false, message: 'Режим только просмотра' }
      }
      const response = await putWithRetry(apiPath(`/blocks/${block.id}`), block)
      const index = blocks.value.findIndex(b => b.id === block.id)
      const prev = index !== -1 ? blocks.value[index] : null
      const merged = {
        ...response.data,
        tasks: normalizeTasksArray(response.data.tasks),
        // Локальные расширения модели этапа (могут не приходить из API в response.data).
        stagePredecessorIds: response.data.stagePredecessorIds ?? block.stagePredecessorIds ?? prev?.stagePredecessorIds ?? [],
        stageDependencyMeta: response.data.stageDependencyMeta ?? block.stageDependencyMeta ?? prev?.stageDependencyMeta ?? null
      }
      if (index !== -1) {
        if (belongsToActiveProject(merged)) {
          blocks.value[index] = merged
        } else {
          // Этап перенесён в другой проект — сразу убираем его из текущего списка.
          blocks.value.splice(index, 1)
        }
      }
      return { success: true, block: merged }
    } catch (error) {
      console.error('Ошибка обновления:', error)
      if (isTransientNetworkError(error)) {
        return { success: false, message: 'Сеть нестабильна. Попробуйте ещё раз.' }
      }
      return { success: false, message: 'Ошибка обновления' }
    }
  }




  // Частичное обновление только даты релиза этапа.
  const updateBlockDate = async (block, newDate) => {
    try {
      if (isReadOnly.value) {
        return { success: false, error: new Error('read-only') }
      }
      const updatedBlock = { ...block, releaseDate: newDate }
      const response = await axios.put(apiPath(`/blocks/${block.id}`), updatedBlock)
      const index = blocks.value.findIndex(b => b.id === block.id)
      const prev = index !== -1 ? blocks.value[index] : null
      const merged = {
        ...response.data,
        tasks: normalizeTasksArray(response.data.tasks),
        stagePredecessorIds: response.data.stagePredecessorIds ?? updatedBlock.stagePredecessorIds ?? prev?.stagePredecessorIds ?? [],
        stageDependencyMeta: response.data.stageDependencyMeta ?? updatedBlock.stageDependencyMeta ?? prev?.stageDependencyMeta ?? null
      }
      if (index !== -1) {
        if (belongsToActiveProject(merged)) {
          blocks.value[index] = merged
        } else {
          blocks.value.splice(index, 1)
        }
      }
      forceUpdatePositions()
      return { success: true, block: merged }
    } catch (error) {
      console.error('❌ Ошибка при обновлении даты:', error)
      return { success: false, error }
    }
  }

  // Пересчет локальных layout-полей и сортировки задач после мутаций.
const forceUpdatePositions = () => {
  console.log('🔄 forceUpdatePositions called')
  blocks.value = blocks.value.map(block => ({
    ...block,
    positionInMonth: undefined,
    positionInQuarter: undefined,
    tasks: block.tasks
      ? normalizeTasksArray(block.tasks).sort((a, b) => (a.order || 0) - (b.order || 0))
      : []
  }))
  
  // Принудительно вызываем пересчет sortedBlocks в компонентах
  // через nextTick, чтобы Vue успел обновить DOM
  setTimeout(() => {
    console.log('✅ positions updated, blocks count:', blocks.value.length)
  }, 50)
}

  // Агрегаты для статистики в шапке/виджетах.
  const completedReleasesCount = computed(() => {
    return blocks.value.filter(block => {
      if (!block.tasks || block.tasks.length === 0) return false
      return block.tasks.every(task => task.status === 'done')
    }).length
  })

  const inProgressReleasesCount = computed(() => {
    return blocks.value.filter(block => {
      if (!block.tasks || block.tasks.length === 0) return false
      const hasProgress = block.tasks.some(task => task.status === 'progress')
      const hasTodo = block.tasks.some(task => task.status === 'todo')
      return hasProgress || hasTodo
    }).length
  })

  const totalTasksCount = computed(() => {
    return blocks.value.reduce((sum, block) => sum + (block.tasks?.length || 0), 0)
  })

  const completedTasksCount = computed(() => {
    return blocks.value.reduce((sum, block) => {
      if (!block.tasks) return sum
      return sum + block.tasks.filter(task => task.status === 'done').length
    }, 0)
  })

  const overallProgress = computed(() => {
    if (totalTasksCount.value === 0) return 0
    return Math.round((completedTasksCount.value / totalTasksCount.value) * 100)
  })

  // Тепловая карта: суммарные трудозатраты (по полю block.effort)
  const totalEffort = computed(() => {
    return blocks.value.reduce((sum, block) => sum + (block.effort || 0), 0)
  })

  const completedEffort = computed(() => {
    return blocks.value.reduce((sum, block) => {
      if (!block.tasks || block.tasks.length === 0) return sum
      const allDone = block.tasks.every(task => task.status === 'done')
      return allDone ? sum + (block.effort || 0) : sum
    }, 0)
  })

  const completedEffortPercent = computed(() => {
    if (totalEffort.value === 0) return 0
    return Math.round((completedEffort.value / totalEffort.value) * 100)
  })

  // Утилиты прогресса этапов/задач.
  const getTaskProgress = (block) => {
    if (!block.tasks || block.tasks.length === 0) return 0
    const completedTasks = block.tasks.filter(task => task.status === 'done').length
    return Math.round((completedTasks / block.tasks.length) * 100)
  }

  const getCompletedTasksCount = (block) => {
    if (!block.tasks) return 0
    return block.tasks.filter(task => task.status === 'done').length
  }

  /** Есть ли у этапа хотя бы одна задача в статусе «в работе». */
  const blockHasTaskInProgress = (block) => {
    if (!block?.tasks?.length) return false
    return block.tasks.some((t) => t.status === 'progress')
  }

  /** Этап начат (есть выполненные или в работе), но не завершён полностью. */
  const blockIsStarted = (block) => {
    if (!block?.tasks?.length) return false
    const allDone = block.tasks.every((task) => task.status === 'done')
    if (allDone) return false
    return block.tasks.some((task) => task.status === 'progress' || task.status === 'done')
  }

  // Цвета карточки этапа (как у полосы Ганта: done / active / idle).
  const getBlockBackgroundColor = (block) => {
    if (!block.tasks || block.tasks.length === 0) return '#C0C0C0'
    const allTasksDone = block.tasks.every((task) => task.status === 'done')
    if (allTasksDone) return '#90EE90'
    if (blockIsStarted(block)) return '#87CEEB'
    return '#C0C0C0'
  }

  const getEffortColor = (effort, opacity = 1) => {
    const e = effort || 0
    if (e < 250) return `rgba(34, 197, 94, ${opacity})`
    if (e < 400) return `rgba(234, 179, 8, ${opacity})`
    if (e < 800) return `rgba(249, 115, 22, ${opacity})`
    return `rgba(239, 68, 68, ${opacity})`
  }

  const getPriorityClass = (effort) => {
    const e = effort || 0
    if (e < 40) return 'priority-low'
    if (e < 80) return 'priority-medium'
    if (e < 120) return 'priority-high'
    return 'priority-critical'
  }

  const getPriorityIcon = (effort) => {
    const e = effort || 0
    if (e < 40) return '●'
    if (e < 80) return '◆'
    if (e < 120) return '▲'
    return '❗'
  }

  const getProgressColor = (percent) => {
    if (percent < 30) return '#ef4444'
    if (percent < 70) return '#f97316'
    if (percent < 100) return '#eab308'
    return '#90EE90'
  }

  const calculateBlockHeight = (block) => {
    let height = 80
    if (block.title && block.title.length > 30) height += 20
    else if (block.title && block.title.length > 20) height += 10
    if (block.description) height += 20
    if (block.tasks && block.tasks.length > 0) {
      height += 40
      height += block.tasks.length * 30
    } else {
      height += 40
    }
    height += 50
    height += 40
    return Math.min(height, 1200)
  }

  // Получение оригинального блока по ID (для тепловой карты)
  const getOriginalBlock = (stageId) => {
    return blocks.value.find(b => b.id === stageId)
  }

  return {
  blocks,
  isLoadingBlocks,
  loadBlocks,
  createNewBlock,
  updateBlock,
  deleteBlock,
  updateBlockDate,
  forceUpdatePositions,
  completedReleasesCount,
  inProgressReleasesCount,
  totalTasksCount,
  completedTasksCount,
  overallProgress,
    totalEffort,
    completedEffort,
    completedEffortPercent,
  getTaskProgress,
  getCompletedTasksCount,
  blockHasTaskInProgress,
  getBlockBackgroundColor,
  getEffortColor,
  getPriorityClass,
  getPriorityIcon,
  getProgressColor,
    getOriginalBlock,
  calculateBlockHeight
  }
}