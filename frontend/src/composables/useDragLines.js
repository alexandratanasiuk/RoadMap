import { ref } from 'vue'

// Логика drag-линии даты этапа на timeline (режим "потянуть вертикальную линию срока").
export function useDragLines(
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
) {
  // Локальное состояние drag-preview.
  const draggedLineBlock = ref(null)
  const draggedBlockId = ref(null)
  const isDraggingLine = ref(false)
  const dragCurrentX = ref(0)
  const previewDate = ref('')
  const blockDragCurrentX = ref(0)
  const blockDragCurrentY = ref(0)
  const dragPreviewMonthIndex = ref(null)
  
  const dragStartClientX = ref(0)
  const dragStartScrollLeft = ref(0)
  const dragStartLineX = ref(0)
  const dragStartBlockX = ref(0)
  const dragStartBlockY = ref(0)

  // Формат даты для всплывающего превью.
  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    return `${day}.${month}.${year}`
  }

  // Обновляет превью-позицию блока при смене целевого месяца во время drag.
  const updateDraggedPreviewForDate = (dateStringOrDate) => {
    const dateObj = dateStringOrDate instanceof Date ? dateStringOrDate : new Date(dateStringOrDate)
    const targetMonth = getAbsoluteMonthIndexFromDate(dateObj)

    if (dragPreviewMonthIndex.value !== targetMonth) {
      const blocksInMonth = sortedBlocks.value.filter(b => {
        if (!b.releaseDate || b.id === draggedLineBlock.value?.id) return false
        return getAbsoluteMonthIndexFromDate(b.releaseDate) === targetMonth
      })

      let newTop = 20
      if (blocksInMonth.length > 0) {
        blocksInMonth.sort((a, b) => (a.positionInMonth || 0) - (b.positionInMonth || 0))
        const lastBlock = blocksInMonth[blocksInMonth.length - 1]
        const lastBlockBottom = (lastBlock.positionInMonth || 0) + calculateBlockHeight(lastBlock)
        newTop = lastBlockBottom + 30
      }

      blockDragCurrentY.value = newTop
      dragPreviewMonthIndex.value = targetMonth
    }
    
    const monthData = visibleMonthsData.value.find(m => m.index === targetMonth)
    if (monthData) {
      const blockWidth = monthData.width * 0.9
      blockDragCurrentX.value = monthData.visibleStartX + (monthData.width - blockWidth) / 2
    }
  }

  // Инициализация drag линии этапа.
  const onLineDragStart = (event, block) => {
    event.stopPropagation()
    
    dragStartClientX.value = event.clientX
    dragStartScrollLeft.value = timelineWrapper.value ? timelineWrapper.value.scrollLeft : 0
    dragStartLineX.value = getVisibleLinePosition(block)
    dragStartBlockX.value = getVisibleBlockLeft(block)
    dragStartBlockY.value = block.positionInMonth || 20
    
    draggedLineBlock.value = block
    draggedBlockId.value = block.id
    isDraggingLine.value = true
    
    dragCurrentX.value = dragStartLineX.value
    blockDragCurrentX.value = dragStartBlockX.value
    blockDragCurrentY.value = dragStartBlockY.value
    dragPreviewMonthIndex.value = getAbsoluteMonthIndexFromDate(block.releaseDate)
    
    event.dataTransfer.setData('text/plain', JSON.stringify({
      blockId: block.id,
      type: 'line'
    }))
    event.dataTransfer.effectAllowed = 'move'
    
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    event.dataTransfer.setDragImage(canvas, 0, 0)
    
    previewDate.value = formatDate(block.releaseDate)
    document.body.classList.add('is-dragging')
  }

  // Движение по сетке: пересчет X-позиции и целевой даты.
  const onGridDragOver = async (event) => {
    event.preventDefault()
    
    if (isDraggingLine.value && draggedLineBlock.value) {
      const currentClientX = event.clientX
      const deltaX = currentClientX - dragStartClientX.value
      const currentScrollLeft = timelineWrapper.value ? timelineWrapper.value.scrollLeft : 0
      const scrollDelta = currentScrollLeft - dragStartScrollLeft.value
      const newLineX = dragStartLineX.value + deltaX - scrollDelta
      
      const lastMonth = visibleMonthsData.value[visibleMonthsData.value.length - 1]
      const maxX = lastMonth ? lastMonth.visibleEndX : 5000
      const constrainedLineX = Math.max(20, Math.min(newLineX, maxX))
      
      dragCurrentX.value = constrainedLineX
      
      const newDate = getDateFromVisiblePosition(constrainedLineX)
      if (newDate) {
        previewDate.value = formatDate(newDate)
        updateDraggedPreviewForDate(newDate)
      }
      
      showPositionIndicator(constrainedLineX)
      updateElementPositions(draggedLineBlock.value.id, constrainedLineX, blockDragCurrentX.value, blockDragCurrentY.value)
    }
  }

  // Определяет дату по текущей X-позиции в видимом диапазоне.
  const getDateFromVisiblePosition = (lineX) => {
    const adjustedX = lineX - 20
    if (adjustedX < 0) return null
    
    const targetDay = visibleDays.value.find(day => 
      adjustedX >= day.startX && adjustedX < day.endX
    )
    
    if (!targetDay) return null
    
    const date = targetDay.date
    const year = date.getFullYear()
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    
    return `${year}-${month}-${day}`
  }

  // Прямое обновление DOM-позиций для максимально плавного превью.
  const updateElementPositions = (blockId, lineX, blockX, blockY) => {
    const line = document.querySelector(`.timeline-line[data-block-id="${blockId}"]`)
    if (line) {
      line.style.transition = 'none'
      line.style.left = lineX + 'px'
      line.classList.add('line-dragging-active')
    }
    
    const block = document.querySelector(`.block[data-block-id="${blockId}"]`)
    if (block) {
      block.style.transition = 'none'
      block.style.left = blockX + 'px'
      block.style.top = blockY + 'px'
      block.classList.add('block-dragging')
    }
  }

  // Завершение drag: коммит новой даты и очистка временного UI-состояния.
  const onLineDragEnd = async () => {
    if (isDraggingLine.value && draggedLineBlock.value && previewDate.value) {
      try {
        const dateParts = previewDate.value.split('.')
        if (dateParts.length === 3) {
          const [day, month, year] = dateParts
          await updateBlockDate(draggedLineBlock.value, `${year}-${month}-${day}`)
          showNotificationMessage(`📅 Дата изменена на ${previewDate.value}`)
        }
      } catch (error) {
        console.error('❌ Ошибка при обновлении даты:', error)
        showNotificationMessage('❌ Ошибка при изменении даты', 'error')
      }
    }
    
    document.querySelectorAll('.line-dragging, .line-dragging-active, .block-dragging').forEach(el => {
      el.classList.remove('line-dragging', 'line-dragging-active', 'block-dragging')
      el.style.transition = ''
      el.style.left = ''
      el.style.top = ''
    })
    
    draggedLineBlock.value = null
    draggedBlockId.value = null
    isDraggingLine.value = false
    dragCurrentX.value = 0
    blockDragCurrentX.value = 0
    blockDragCurrentY.value = 0
    dragStartClientX.value = 0
    dragStartScrollLeft.value = 0
    dragStartLineX.value = 0
    dragStartBlockX.value = 0
    dragStartBlockY.value = 0
    dragPreviewMonthIndex.value = null
    previewDate.value = ''
    removePositionIndicator()
    document.body.classList.remove('is-dragging')
  }

  // Drop-сценарий (на случай завершения через drop-событие).
  const onGridDrop = async (event) => {
    event.preventDefault()
    event.stopPropagation()
    
    if (!draggedLineBlock.value) return
    
    try {
      const dragData = JSON.parse(event.dataTransfer.getData('text/plain'))
      if (dragData.type !== 'line') return
      
      if (!previewDate.value) {
        showNotificationMessage('❌ Не удалось определить дату', 'error')
        return
      }
      
      const dateParts = previewDate.value.split('.')
      if (dateParts.length === 3) {
        const [day, month, year] = dateParts
        await updateBlockDate(draggedLineBlock.value, `${year}-${month}-${day}`)
        showNotificationMessage(`📅 Дата изменена на ${previewDate.value}`)
      }
      
      removePositionIndicator()
    } catch (error) {
      console.error('❌ Ошибка при перемещении линии:', error)
      showNotificationMessage('❌ Ошибка при изменении даты', 'error')
    }
    
    draggedLineBlock.value = null
    isDraggingLine.value = false
    dragPreviewMonthIndex.value = null
  }

  // Вертикальный индикатор позиции курсора во время drag.
  const showPositionIndicator = (x) => {
    const oldIndicator = document.querySelector('.line-position-indicator')
    if (oldIndicator) oldIndicator.remove()
    
    const indicator = document.createElement('div')
    indicator.className = 'line-position-indicator'
    indicator.style.left = x + 'px'
    
    const grid = document.querySelector('.timeline-grid')
    if (grid) grid.appendChild(indicator)
  }

  const removePositionIndicator = () => {
    const indicator = document.querySelector('.line-position-indicator')
    if (indicator) indicator.remove()
  }

  return {
    draggedLineBlock,
    isDraggingLine,
    dragCurrentX,
    previewDate,
    onLineDragStart,
    onGridDragOver,
    onLineDragEnd,
    onGridDrop,
    blockDragCurrentX,
    blockDragCurrentY
  }
}