import { ref, computed, watch } from 'vue'
import { useBlocks } from './useBlocks'

/** Сколько пустых месяцев показывать справа после последнего месяца с этапами (0 или 1). */
const MAX_TRAILING_EMPTY_MONTHS = 1
const MONTH_DAY_WIDTH_STORAGE_KEY = 'put-roadmap.horizontal.globalDayWidth.v1'

export function useDates() {
  // Источник этапов для расчета диапазонов и видимой шкалы.
  const { blocks } = useBlocks()
  const trailingEmptyMonthsCount = ref(0)

  // Читает пользовательскую ширину дня (общий масштаб месяцев) из localStorage.
  const readStoredGlobalDayWidth = () => {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const raw = window.localStorage.getItem(MONTH_DAY_WIDTH_STORAGE_KEY)
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }
  const globalDayWidthOverride = ref(readStoredGlobalDayWidth())

  // Базовые настройки календарной сетки.
  const BASE_YEAR = 2026
  const DAY_WIDTH = 10
  const MONTH_WIDTH = 320
  const QUARTER_WIDTH = 350
  const FUTURE_MONTHS_PAD = 12

  const MONTH_LABELS = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ]

  // Преобразования дат <-> индексов месяцев/границ.
  const getAbsoluteMonthIndexFromDate = (dateLike) => {
    const date = new Date(dateLike)
    return (date.getFullYear() - BASE_YEAR) * 12 + date.getMonth()
  }

  const getMonthEndDate = (monthIndex) => {
    const year = BASE_YEAR + Math.floor(monthIndex / 12)
    const monthInYear = monthIndex % 12
    return new Date(year, monthInYear + 1, 0)
  }

  const clampNumber = (value, min, max) => Math.max(min, Math.min(max, value))
  const getBaseMonthWidth = () => MONTH_WIDTH

  // Ограничения и управление шириной видимых месяцев.
  const getMonthWidthBounds = (month) => {
    const baseWidth = getBaseMonthWidth(month)
    return {
      min: 320,
      max: Math.round(baseWidth * 2.4)
    }
  }
  const getMonthWidthByIndex = (monthIndex) => {
    const month = extendedTimelineMonths.value.find((item) => item.index === monthIndex)
    if (!month) return null
    const baseWidth = getBaseMonthWidth(month)
    const dayWidth = Number(globalDayWidthOverride.value)
    if (!Number.isFinite(dayWidth)) return baseWidth
    const clampedDayWidth = clampNumber(dayWidth, 6, 24)
    const bounds = getMonthWidthBounds(month)
    const scaledWidth = Math.round(month.days * clampedDayWidth)
    return clampNumber(scaledWidth, bounds.min, bounds.max)
  }
  const setVisibleMonthWidth = (monthIndex, widthPx) => {
    const month = extendedTimelineMonths.value.find((item) => item.index === monthIndex)
    if (!month) return
    const numericWidth = Number(widthPx)
    if (!Number.isFinite(numericWidth)) return
    const bounds = getMonthWidthBounds(month)
    const nextWidth = clampNumber(Math.round(numericWidth), bounds.min, bounds.max)
    globalDayWidthOverride.value = clampNumber(nextWidth / Math.max(1, month.days), 6, 24)
  }
  const resetVisibleMonthWidth = (minMonthWidthPx = 0) => {
    const minWidth = Number(minMonthWidthPx)
    if (Number.isFinite(minWidth) && minWidth > 0 && visibleMonthsData.value.length) {
      if (minWidth <= MONTH_WIDTH) {
        globalDayWidthOverride.value = null
        return
      }
      const minDays = Math.max(1, Math.min(...visibleMonthsData.value.map((month) => Number(month.days) || 31)))
      const requiredDayWidth = clampNumber(minWidth / minDays, 6, 24)
      if (requiredDayWidth > DAY_WIDTH) {
        globalDayWidthOverride.value = requiredDayWidth
        return
      }
    }
    globalDayWidthOverride.value = null
  }
  const hasCustomMonthWidth = computed(() => Number.isFinite(Number(globalDayWidthOverride.value)))

  // Полная шкала месяцев (с запасом вправо для планирования).
  const extendedTimelineMonths = computed(() => {
    const endBaseIndex = 11
    const blockMonthIndexes = blocks.value
      .filter(block => block.releaseDate)
      .map(block => getAbsoluteMonthIndexFromDate(block.releaseDate))
      .filter(index => index >= 0)
    const maxBlockMonthIndex = blockMonthIndexes.length ? Math.max(...blockMonthIndexes) : endBaseIndex
    const endIndex = maxBlockMonthIndex + FUTURE_MONTHS_PAD

    const result = []
    for (let absoluteIndex = 0; absoluteIndex <= endIndex; absoluteIndex++) {
      const year = BASE_YEAR + Math.floor(absoluteIndex / 12)
      const monthInYear = absoluteIndex % 12
      const days = new Date(year, monthInYear + 1, 0).getDate()
      result.push({
        index: absoluteIndex,
        monthInYear,
        year,
        label: MONTH_LABELS[monthInYear],
        sub: String(year),
        days
      })
    }
    return result
  })

  // Границы месяцев, где реально есть этапы.
  const firstMonthWithBlock = computed(() => {
    if (blocks.value.length === 0) return 0
    const months = blocks.value
      .map(block => getAbsoluteMonthIndexFromDate(block.releaseDate))
      .filter(idx => idx >= 0)
    if (months.length === 0) return 0
    return Math.min(...months)
  })

  const lastMonthWithBlock = computed(() => {
    if (blocks.value.length === 0) return 11
    const months = blocks.value
      .map(block => getAbsoluteMonthIndexFromDate(block.releaseDate))
      .filter(idx => idx >= 0)
    if (months.length === 0) return 11
    return Math.max(...months)
  })

  const monthsWithBlocks = computed(() => {
    const months = new Set()
    blocks.value.forEach(block => {
      if (block.releaseDate) {
        months.add(getAbsoluteMonthIndexFromDate(block.releaseDate))
      }
    })
    return months
  })

  const maxMonthIndexInTimeline = computed(() => {
    const m = extendedTimelineMonths.value
    return m.length ? m[m.length - 1].index : 0
  })

  // ВИДИМЫЕ МЕСЯЦЫ - это главная функция.
  const visibleMonthsData = computed(() => {
    let currentX = 0
    const result = []
    const first = firstMonthWithBlock.value
    const last = lastMonthWithBlock.value
    const trail = trailingEmptyMonthsCount.value
    const lastVisibleIndex = last + trail

    const showMonth = (month) => month.index >= first && month.index <= lastVisibleIndex

    extendedTimelineMonths.value.forEach((month) => {
      if (showMonth(month)) {
        const width = getMonthWidthByIndex(month.index)
        result.push({
          ...month,
          width,
          startX: currentX,
          endX: currentX + width,
          visibleStartX: currentX,
          visibleEndX: currentX + width
        })
        currentX += width
      }
    })

    return result
  })

  // Позиции месяцев для линии/шапки (alias visibleMonthsData).
  const visibleMonthPositions = computed(() => visibleMonthsData.value)

  // Производные видимые дни внутри текущего набора видимых месяцев.
  const visibleDays = computed(() => {
    const days = []
    let globalIndex = 0
    visibleMonthsData.value.forEach(month => {
      const dayWidth = month.days > 0 ? month.width / month.days : DAY_WIDTH
      for (let day = 1; day <= month.days; day++) {
        const dayStartX = month.visibleStartX + (day - 1) * dayWidth
        const dayCenterX = dayStartX + dayWidth / 2
        days.push({
          id: `${month.index}-${day}`,
          month: month.index,
          day: day,
          globalIndex: globalIndex++,
          startX: dayStartX,
          centerX: dayCenterX,
          visibleCenterX: dayCenterX,
          endX: dayStartX + dayWidth,
          date: new Date(month.year, month.monthInYear, day)
        })
      }
    })
    return days
  })

  const visibleHorizontalTotalWidth = computed(() => {
    const lastMonth = visibleMonthsData.value[visibleMonthsData.value.length - 1]
    return lastMonth ? lastMonth.visibleEndX + 50 : 1000
  })

  const todayIn2026 = computed(() => {
    const today = new Date()
    return new Date(BASE_YEAR, today.getMonth(), today.getDate())
  })

  const todayVisiblePosition = computed(() => {
    if (!visibleDays.value.length) return 0
    const today = todayIn2026.value
    const month = getAbsoluteMonthIndexFromDate(today)
    const day = today.getDate()
    const targetDay = visibleDays.value.find(d => d.month === month && d.day === day)
    return targetDay ? targetDay.visibleCenterX : 0
  })

  // Управление "хвостом" пустых месяцев после последнего месяца с этапом.
  const canExtendTrailingEmptyMonth = computed(() => {
    if (trailingEmptyMonthsCount.value >= MAX_TRAILING_EMPTY_MONTHS) return false
    const next = lastMonthWithBlock.value + trailingEmptyMonthsCount.value + 1
    return next <= maxMonthIndexInTimeline.value
  })

  const extendTrailingEmptyMonth = () => {
    if (!canExtendTrailingEmptyMonth.value) return
    trailingEmptyMonthsCount.value += 1
  }

  const collapseTrailingEmptyMonth = () => {
    if (trailingEmptyMonthsCount.value > 0) trailingEmptyMonthsCount.value -= 1
  }

  /** Позиция контрола на последнем дне последнего видимого месяца (шапка «по месяцам»). */
  const trailingMonthControl = computed(() => {
    const months = visibleMonthsData.value
    if (!months.length) return null
    const lastM = months[months.length - 1]
    const lastDay = visibleDays.value.find((d) => d.month === lastM.index && d.day === lastM.days)
    if (!lastDay) return null
    const isTrailingEmpty = lastM.index > lastMonthWithBlock.value
    return {
      centerX: lastDay.visibleCenterX,
      isTrailingEmpty,
      showCollapse: isTrailingEmpty && trailingEmptyMonthsCount.value > 0,
      showExtend: !isTrailingEmpty && canExtendTrailingEmptyMonth.value
    }
  })

  watch(
    [lastMonthWithBlock, monthsWithBlocks],
    () => {
      if (trailingEmptyMonthsCount.value === 0) return
      const last = lastMonthWithBlock.value
      const end = last + trailingEmptyMonthsCount.value
      for (let i = last + 1; i <= end; i++) {
        if (monthsWithBlocks.value.has(i)) {
          trailingEmptyMonthsCount.value = 0
          return
        }
      }
    },
    { deep: true }
  )

  // Сохраняем глобальный dayWidth override в localStorage.
  watch(globalDayWidthOverride, (value) => {
    if (typeof window === 'undefined' || !window.localStorage) return
    if (!Number.isFinite(Number(value))) {
      window.localStorage.removeItem(MONTH_DAY_WIDTH_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(MONTH_DAY_WIDTH_STORAGE_KEY, String(value))
  })

  return {
    getAbsoluteMonthIndexFromDate,
    getMonthEndDate,
    extendedTimelineMonths,
    firstMonthWithBlock,
    lastMonthWithBlock,
    monthsWithBlocks,
    visibleMonthsData,
    visibleMonthPositions,
    visibleDays,
    visibleHorizontalTotalWidth,
    todayVisiblePosition,
    trailingEmptyMonthsCount,
    canExtendTrailingEmptyMonth,
    hasCustomMonthWidth,
    extendTrailingEmptyMonth,
    collapseTrailingEmptyMonth,
    trailingMonthControl
    ,
    setVisibleMonthWidth,
    resetVisibleMonthWidth
  }
}