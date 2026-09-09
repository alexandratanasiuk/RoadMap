import { ref, watch } from 'vue'
import { useBlocks } from './useBlocks'

export function useHeatmap() {
  // Данные этапов + агрегаты для расчета treemap.
  const { blocks, totalEffort, getBlockBackgroundColor, getTaskProgress } = useBlocks()
  const stagePositions = ref([])
  const taskPositions = ref({})

  // Размер рабочей области treemap (обновляется по размеру контейнера).
  let TREEMAP_WIDTH = 1600
  let TREEMAP_HEIGHT = 600

  // Дата helpers для overdue-подсветки задач.
  const normalizeIsoDate = (value) => {
    const raw = String(value || '').trim()
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return null
    const year = Number(match[1])
    const monthIdx = Number(match[2]) - 1
    const day = Number(match[3])
    const date = new Date(year, monthIdx, day)
    if (Number.isNaN(date.getTime())) return null
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
  }

  const isOverdueByDate = (dateLike) => {
    const dueDate = normalizeIsoDate(dateLike)
    if (!dueDate) return false
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return dueDate.getTime() < today.getTime()
  }

  // Базовый алгоритм разбиения прямоугольника на области (treemap).
  const calculateTreemap = (items, totalValue, x, y, width, height) => {
    if (!items.length) return []
    const sorted = [...items].sort((a, b) => (b.value || 0) - (a.value || 0))
    const result = []

    const split = (items, x, y, width, height) => {
      if (items.length === 0) return
      if (items.length === 1) {
        const minVisibleSize = 1
        result.push({
          ...items[0],
          x: Math.round(x),
          y: Math.round(y),
          width: Math.max(minVisibleSize, Math.round(width)),
          height: Math.max(minVisibleSize, Math.round(height))
        })
        return
      }
      const total = items.reduce((sum, item) => sum + (item.value || 0), 0)
      const isHorizontal = width >= height

      let splitIndex = 1
      let sum1 = items[0].value
      let sum2 = total - sum1
      let bestRatio = Math.abs(sum1 / total - 0.5)

      for (let i = 2; i < items.length; i++) {
        sum1 += items[i-1].value
        sum2 = total - sum1
        const ratio = Math.abs(sum1 / total - 0.5)
        if (ratio < bestRatio) {
          bestRatio = ratio
          splitIndex = i
        }
      }

      const items1 = items.slice(0, splitIndex)
      const items2 = items.slice(splitIndex)
      const sum1Value = items1.reduce((sum, item) => sum + (item.value || 0), 0)

      if (isHorizontal) {
        const splitX = x + Math.round(width * sum1Value / total)
        split(items1, x, y, splitX - x, height)
        split(items2, splitX, y, x + width - splitX, height)
      } else {
        const splitY = y + Math.round(height * sum1Value / total)
        split(items1, x, y, width, splitY - y)
        split(items2, x, splitY, width, y + height - splitY)
      }
    }

    split(sorted, x, y, width, height)
    const maxX = x + width
    const maxY = y + height
    return result.map((item) => {
      const left = Math.max(x, Math.min(maxX - 1, item.x))
      const top = Math.max(y, Math.min(maxY - 1, item.y))
      const safeWidth = Math.max(1, Math.min(item.width, maxX - left))
      const safeHeight = Math.max(1, Math.min(item.height, maxY - top))
      return {
        ...item,
        x: left,
        y: top,
        width: safeWidth,
        height: safeHeight
      }
    })
  }

  // Раскладка этапов по площади в зависимости от block.effort.
  const calculateStagePositions = () => {
    if (!blocks.value.length || totalEffort.value === 0) return []
    const stages = blocks.value.map(block => ({
      id: block.id,
      title: block.title,
      effort: block.effort || 0,
      value: block.effort || 0,
      releaseDate: block.releaseDate
    }))
    return calculateTreemap(stages, totalEffort.value, 0, 0, TREEMAP_WIDTH, TREEMAP_HEIGHT)
  }

  // Раскладка задач внутри этапа по effort с fallback-правилами для нулевых значений.
  const calculateTaskPositionsForStage = (stageWithTasks) => {
    if (!stageWithTasks.tasks || stageWithTasks.tasks.length === 0) return []
    const rawTasks = stageWithTasks.tasks.map((task, index) => {
      const effort = Number(task?.effort)
      return {
        id: task.id,
        title: task.title,
        status: task.status,
        releaseDate: task?.releaseDate || stageWithTasks?.releaseDate || '',
        value: Number.isFinite(effort) && effort > 0 ? effort : 0,
        index
      }
    })
    const hasAnyPositiveEffort = rawTasks.some((task) => task.value > 0)
    // Если есть хотя бы одна задача с effort > 0, то задачи с effort = 0
    // считаем как 1 только для визуального распределения площади.
    // Если у всех задач effort = 0 — заполняем площадь равномерно.
    const tasks = hasAnyPositiveEffort
      ? rawTasks.map((task) => ({ ...task, value: task.value === 0 ? 1 : task.value }))
      : rawTasks.map((task) => ({ ...task, value: 1 }))
    const totalValue = tasks.reduce((sum, task) => sum + (task.value || 0), 0)
    if (totalValue <= 0) return []
    const stagePos = stagePositions.value.find(s => s.id === stageWithTasks.id)
    if (!stagePos) return []
    // Размеры внутренней области задач в карточке этапа:
    // учитываем внутренние отступы stage + высоту header.
    const STAGE_PADDING_X = 12 // 6px слева + 6px справа
    const TASKS_TOP_OFFSET = 28 // header + отступ до tasks-area
    const availableWidth = Math.max(1, stagePos.width - STAGE_PADDING_X)
    const availableHeight = Math.max(1, stagePos.height - TASKS_TOP_OFFSET)
    return calculateTreemap(tasks, totalValue, 0, 0, availableWidth, availableHeight)
  }

  // Полный пересчет координат этапов и задач.
  const updateAllPositions = () => {
    stagePositions.value = calculateStagePositions()
    const taskMap = {}
    stagePositions.value.forEach(stage => {
      const originalBlock = blocks.value.find(b => b.id === stage.id)
      if (originalBlock) {
        taskMap[stage.id] = calculateTaskPositionsForStage({
          ...stage,
          tasks: originalBlock.tasks || []
        })
      } else {
        taskMap[stage.id] = []
      }
    })
    taskPositions.value = taskMap
  }

  // Инлайн-стили карточки этапа в treemap.
  const getStageStyle = (stage) => {
    const originalBlock = blocks.value.find(b => b.id === stage.id)
    return {
      position: 'absolute',
      left: stage.x + 'px',
      top: stage.y + 'px',
      width: stage.width + 'px',
      height: stage.height + 'px',
      backgroundColor: originalBlock ? getBlockBackgroundColor(originalBlock) : '#f3f4f6',
      border: '1px solid rgba(0,0,0,0.1)',
      boxSizing: 'border-box',
      padding: '6px',
      overflow: 'hidden',
      cursor: 'pointer',
      transition: 'all 0.2s',
      display: 'flex',
      flexDirection: 'column',
      borderRadius: '4px'
    }
  }

  // Инлайн-стили задачи: цвет статуса, overdue-режим и авторазмер шрифта.
  const getTaskStyle = (task) => {
    const status = String(task?.status || 'todo')
    const colors = {
      'done': '#bfe9da',
      'progress': '#c7d7fb',
      'todo': '#d8d9e0'
    }
    const overdue = isOverdueByDate(task?.releaseDate)
    const isOverdueTodo = overdue && status === 'todo'
    const isOverdueProgress = overdue && status === 'progress'
    const minSize = 4
    const width = Math.max(minSize, task.width)
    const height = Math.max(minSize, task.height)
    const minEdge = Math.min(width, height)
    const fontSizePx = Math.max(9, Math.min(14, Math.round(minEdge * 0.28)))
    const padX = width < 52 ? 2 : 4
    const padY = height < 30 ? 1 : 2
    const backgroundColor = (isOverdueTodo || isOverdueProgress)
      ? '#ef4444'
      : (colors[status] || '#d8d9e0')
    const backgroundImage = isOverdueProgress
      ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.26) 0px, rgba(255,255,255,0.26) 5px, rgba(239,68,68,0) 5px, rgba(239,68,68,0) 10px)'
      : 'none'
    const labelColor = (isOverdueTodo || isOverdueProgress)
      ? '#ffffff'
      : (status === 'done' ? '#159a79' : (status === 'progress' ? '#3f66bf' : '#6b7280'))
    return {
      position: 'absolute',
      left: task.x + 'px',
      top: task.y + 'px',
      width: width + 'px',
      height: height + 'px',
      backgroundColor,
      backgroundImage,
      border: '1px solid rgba(255,255,255,0.35)',
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      color: labelColor,
      fontSize: `${fontSizePx}px`,
      fontWeight: 'bold',
      lineHeight: '1.2',
      borderRadius: '2px',
      cursor: 'pointer',
      transition: 'filter 0.15s ease',
      zIndex: 10,
      padding: `${padY}px ${padX}px`,
      '--task-label-color': labelColor
    }
  }

  // Короткая подпись задачи (если нужна компактная форма).
  const getTaskInitials = (title) => {
    if (!title) return '?'
    const words = title.split(' ')
    if (words.length === 1) return title.substring(0, 2).toUpperCase()
    return words.slice(0, 2).map(w => w[0]).join('').toUpperCase()
  }

  // Подгоняет treemap под фактический размер контейнера в DOM.
  const updateTreemapSize = () => {
    const treemapArea = document.querySelector('.treemap-area')
    if (treemapArea) {
      TREEMAP_WIDTH = treemapArea.clientWidth
      TREEMAP_HEIGHT = treemapArea.clientHeight
      updateAllPositions()
    }
  }

  // Автопересчет карты при изменениях этапов/трудозатрат.
  watch(
    () => [blocks.value, totalEffort.value],
    () => {
      updateAllPositions()
    },
    { deep: true }
  )

  return {
    stagePositions,
    taskPositions,
    updateAllPositions,
    getStageStyle,
    getTaskStyle,
    getTaskInitials,
    updateTreemapSize
  }
}