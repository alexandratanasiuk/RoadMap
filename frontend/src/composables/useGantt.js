import { ref, computed } from 'vue'
import { useBlocks } from './useBlocks'

// Базовые константы шкалы времени и drag-поведения.
const DAY_MS = 1000 * 60 * 60 * 24
const DRAG_DAY_THRESHOLD_PX = 3

// Нормализует дату к началу суток для стабильных вычислений.
const toStartOfDay = (d) => {
  const date = d instanceof Date ? new Date(d) : new Date(d)
  date.setHours(0, 0, 0, 0)
  return date
}

// Date helpers для операций с диапазонами.
const addDays = (dateLike, days) => {
  const d = toStartOfDay(dateLike)
  d.setDate(d.getDate() + days)
  return d
}

const diffInDays = (aLike, bLike) => {
  const a = toStartOfDay(aLike).getTime()
  const b = toStartOfDay(bLike).getTime()
  return Math.round((a - b) / DAY_MS)
}

const deltaPxToRawDays = (deltaPx, dayWidthPx) => {
  if (!Number.isFinite(deltaPx) || !Number.isFinite(dayWidthPx) || dayWidthPx <= 0) return 0
  const absPx = Math.abs(deltaPx)
  if (absPx < DRAG_DAY_THRESHOLD_PX) return 0
  const sign = deltaPx < 0 ? -1 : 1
  const roundedDays = Math.round(absPx / dayWidthPx)
  return sign * Math.max(1, roundedDays)
}

export function useGantt(options = {}) {
  const { onStageCommitted } = options
  // Источник данных этапов + базовые операции.
  const { blocks, getTaskProgress, updateBlock } = useBlocks()

  // UI-состояние масштаба/фильтра.
  const zoomLevel = ref(1)
  const ganttRiskOnly = ref(false)
  const scaleMode = ref('month') // day | week | month

  /** Целые пиксели: сетка, шапка и бары считают ширину дня одинаково. */
  const dayWidth = computed(() => Math.max(4, Math.round(20 * zoomLevel.value)))

  // Видимый диапазон дат по всем этапам (+поля по краям для удобства drag).
  const visibleRange = computed(() => {
    const items = blocks.value || []
    const dates = []

    for (const block of items) {
      if (!block?.releaseDate) continue
      const start = block.startDate ? block.startDate : block.releaseDate
      dates.push(toStartOfDay(start))
      dates.push(toStartOfDay(block.releaseDate))
    }

    if (dates.length === 0) {
      const base = new Date(2026, 0, 1)
      dates.push(base)
      dates.push(addDays(base, 90))
    }

    const min = new Date(Math.min(...dates.map(d => d.getTime())))
    const max = new Date(Math.max(...dates.map(d => d.getTime())))

    // Небольшой запас вокруг диапазона для удобства перетаскивания.
    const paddedStart = addDays(min, -7)
    const paddedEnd = addDays(max, 7)

    const days = Math.max(1, diffInDays(paddedEnd, paddedStart) + 1)
    return { start: paddedStart, end: paddedEnd, days }
  })

  const totalTimelineWidth = computed(() => visibleRange.value.days * dayWidth.value)

  // Перевод даты в x-координату таймлайна.
  const getDayOffsetX = (dateLike) => {
    return diffInDays(dateLike, visibleRange.value.start) * dayWidth.value
  }

  // Стили полосы этапа по датам.
  const getTaskBarStyle = (block) => {
    if (!block.startDate || !block.releaseDate) return {}
    const start = toStartOfDay(block.startDate)
    const end = toStartOfDay(block.releaseDate)
    const durationDays = diffInDays(end, start) + 1
    const duration = Math.max(1, durationDays)
    return {
      left: getDayOffsetX(start) + 'px',
      width: duration * dayWidth.value + 'px'
    }
  }

  // Статусные helpers (overdue/risk/on-track) для боковой панели и подсветки.
  const isOverdue = (block) => {
    if (!block.releaseDate) return false
    const releaseDate = new Date(block.releaseDate)
    return releaseDate < new Date() && getTaskProgress(block) < 100
  }

  const getGanttStatus = (block) => {
    const progress = getTaskProgress(block)
    if (progress >= 100) return 'on-track'
    if (!block.releaseDate) return 'on-track'

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = block.startDate ? new Date(block.startDate) : null
    const end = new Date(block.releaseDate)
    end.setHours(0, 0, 0, 0)

    if (end < today) return 'delayed'

    if (start) {
      start.setHours(0, 0, 0, 0)
      const total = end - start
      const elapsed = today - start
      if (total > 0 && elapsed > 0) {
        const expectedProgress = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)))
        if (progress + 15 < expectedProgress) return 'risk'
      }
    }

    const dayMs = 1000 * 60 * 60 * 24
    const daysLeft = Math.ceil((end - today) / dayMs)
    if (daysLeft <= 7 && progress < 85) return 'risk'

    return 'on-track'
  }

  const getGanttStatusLabel = (block) => {
    const status = getGanttStatus(block)
    if (status === 'delayed') return 'просрочен'
    if (status === 'risk') return 'риск'
    return 'в графике'
  }

  const filteredGanttBlocks = computed(() => {
    if (!ganttRiskOnly.value) return blocks.value
    return blocks.value.filter(block => {
      const status = getGanttStatus(block)
      return status === 'risk' || status === 'delayed'
    })
  })

  // Управление масштабом.
  const zoomIn = () => { zoomLevel.value = Math.min(zoomLevel.value + 0.2, 2) }
  const zoomOut = () => { zoomLevel.value = Math.max(zoomLevel.value - 0.2, 0.5) }
  const resetZoom = () => { zoomLevel.value = 1 }

  // Формирует тики шапки для month/week/day режимов.
  const ticks = computed(() => {
    const start = visibleRange.value.start
    const days = visibleRange.value.days
    const end = addDays(start, days - 1)

    if (scaleMode.value === 'month') {
      const result = []
      const startMonth = new Date(start.getFullYear(), start.getMonth(), 1)
      let cur = new Date(startMonth)
      while (cur <= end) {
        const monthStart = new Date(cur.getFullYear(), cur.getMonth(), 1)
        const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
        const widthDays = diffInDays(monthEnd, monthStart) + 1
        result.push({
          key: `m-${cur.getFullYear()}-${cur.getMonth()}`,
          label: cur.toLocaleString('ru', { month: 'long', year: 'numeric' }),
          left: getDayOffsetX(monthStart),
          width: widthDays * dayWidth.value
        })
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      }
      return result
    }

    if (scaleMode.value === 'week') {
      // ISO-week “по понедельникам”.
      const result = []
      const startD = toStartOfDay(start)
      const dayOfWeek = (startD.getDay() + 6) % 7 // 0..6 where Monday=0
      const monday = addDays(startD, -dayOfWeek)
      let cur = new Date(monday)
      const weekMs = DAY_MS * 7
      while (cur <= end) {
        const weekStart = new Date(cur)
        const weekEnd = addDays(weekStart, 6)
        const widthDays = 7
        const label = `Нед ${Math.ceil(diffInDays(weekStart, startD) / 7) + 1}`
        result.push({
          key: `w-${weekStart.toISOString()}`,
          label,
          left: getDayOffsetX(weekStart),
          width: widthDays * dayWidth.value
        })
        cur = new Date(cur.getTime() + weekMs)
      }
      return result
    }

    // day — метка на каждый день; в шапке Ганта текст рисуется вертикально (см. tick-label--day-scale).
    const result = []
    const startD = toStartOfDay(start)
    const rangeDays = visibleRange.value.days
    const labelEvery = rangeDays > 400 ? 2 : 1
    for (let i = 0; i < rangeDays; i += labelEvery) {
      const d = addDays(startD, i)
      result.push({
        key: `d-${d.toISOString()}`,
        label: d.toLocaleString('ru', { day: '2-digit', month: '2-digit' }),
        left: i * dayWidth.value,
        width: labelEvery * dayWidth.value
      })
    }
    return result
  })

  // ===== Drag/move/resize =====
  const dragging = ref(null)
  const dragPreview = ref(null)

  const snapDays = (rawDeltaDays) => {
    const mode = scaleMode.value
    if (mode === 'day') return rawDeltaDays
    if (mode === 'week') return Math.round(rawDeltaDays / 7) * 7
    // month: двигаем по дневной сетке, чтобы дата совпадала с линиями дней.
    return rawDeltaDays
  }

  // Преобразование Date в yyyy-mm-dd для сохранения в модель.
const dateToInputValue = (d) => {
  const date = toStartOfDay(d)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

  // Инициализирует drag операции полосы (move/resize-left/resize-right).
  const startDrag = (block, mode, event) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()

    if (!block?.startDate || !block?.releaseDate) return

    const start = toStartOfDay(block.startDate)
    const end = toStartOfDay(block.releaseDate)
    const startX = event.clientX

    dragging.value = {
      blockId: block.id,
      mode, // move | resize-left | resize-right
      startDate: start,
      endDate: end,
      startX,
      startLeftPx: getDayOffsetX(start),
      durationDays: Math.max(1, diffInDays(end, start) + 1)
    }

    // Для “move” сразу задаем left/width в пикселях, чтобы не было визуального скачка.
    if (mode === 'move') {
      dragPreview.value = {
        startDate: start,
        endDate: end,
        leftPx: dragging.value.startLeftPx,
        widthPx: dragging.value.durationDays * dayWidth.value
      }
    } else {
      dragPreview.value = { startDate: start, endDate: end }
    }

    document.body.classList.add('is-dragging')

    const onMove = (e) => {
      if (!dragging.value) return
      const deltaPx = e.clientX - dragging.value.startX
      const rawDeltaDays = deltaPxToRawDays(deltaPx, dayWidth.value)
      const deltaDays = snapDays(rawDeltaDays)

      let nextStart = dragging.value.startDate
      let nextEnd = dragging.value.endDate

      if (mode === 'move') {
        // Плавная визуализация по пикселям: без округления до дней во время drag.
        const leftPx = dragging.value.startLeftPx + deltaPx
        const widthPx = dragging.value.durationDays * dayWidth.value

        // Для отображения дат в UI используем снаппинг по дням,
        // но при этом сам бар двигаем плавно по пикселям.
        nextStart = addDays(dragging.value.startDate, deltaDays)
        // Для move длительность должна оставаться прежней.
        nextEnd = addDays(nextStart, dragging.value.durationDays - 1)

        dragPreview.value = {
          startDate: nextStart,
          endDate: nextEnd,
          leftPx,
          widthPx
        }
        return
      }

      // Для ресайза используем снаппинг по дням.
      if (mode === 'resize-right') {
        nextEnd = addDays(dragging.value.endDate, deltaDays)
        // Меняется только конец; начало фиксированное.
        if (nextEnd < dragging.value.startDate) nextEnd = dragging.value.startDate

        dragPreview.value = {
          startDate: dragging.value.startDate,
          endDate: nextEnd
        }
      } else if (mode === 'resize-left') {
        nextStart = addDays(dragging.value.startDate, deltaDays)
        // Меняется только начало; конец фиксированный.
        if (nextStart > dragging.value.endDate) nextStart = dragging.value.endDate

        dragPreview.value = {
          startDate: nextStart,
          endDate: dragging.value.endDate
        }
      }
    }

    const onUp = async (e) => {
      try {
        if (!dragging.value) return
        const blk = blocks.value.find(b => b.id === dragging.value.blockId)
        if (!blk) return
        const { startDate, endDate } = dragPreview.value || {}
        if (!startDate || !endDate) return

        // На отпускании сохраняем в БД.
        const prevStartDate = String(blk.startDate || '')
        const prevReleaseDate = String(blk.releaseDate || '')
        const updated = { ...blk }

        updated.startDate = dateToInputValue(startDate)
        updated.releaseDate = dateToInputValue(endDate)
        const res = await updateBlock(updated)
        if (res?.success) {
          onStageCommitted?.({
            blockId: String(blk.id),
            prevStartDate,
            prevReleaseDate
          })
        }
      } finally {
        dragging.value = null
        dragPreview.value = null
        document.body.classList.remove('is-dragging')
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const getBarStyleWithPreview = (block) => {
    const isActive = dragging.value?.blockId === block.id && dragPreview.value
    if (!isActive) return getTaskBarStyle(block)

    // Для перемещения (move) храним left/width в пикселях для “плавности”.
    if (typeof dragPreview.value.leftPx === 'number' && typeof dragPreview.value.widthPx === 'number') {
      return {
        left: `${dragPreview.value.leftPx}px`,
        width: `${dragPreview.value.widthPx}px`
      }
    }

    const durationDays = diffInDays(dragPreview.value.endDate, dragPreview.value.startDate) + 1
    const duration = Math.max(1, durationDays)
    return {
      left: getDayOffsetX(dragPreview.value.startDate) + 'px',
      width: `${duration * dayWidth.value}px`
    }
  }

  return {
    zoomLevel,
    ganttRiskOnly,
    scaleMode,
    ticks,
    dayWidth,
    totalTimelineWidth,
    getTaskBarStyle,
    isOverdue,
    getGanttStatus,
    getGanttStatusLabel,
    filteredGanttBlocks,
    zoomIn,
    zoomOut,
    resetZoom,
    startDrag,
    getBarStyleWithPreview,
    dragging,
    dragPreview,
    setScaleMode: (mode) => { scaleMode.value = mode },
    visibleRange,
    getDayOffsetX
  }
}