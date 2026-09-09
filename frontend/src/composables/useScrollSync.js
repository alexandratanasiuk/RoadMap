export function useScrollSync(timelineWrapper, horizontalHeader, quartersHeader, monthsHeader) {
  // Синхронизирует горизонтальный скролл контента и шапок разных режимов.
  const syncScroll = () => {
    if (!timelineWrapper.value) return
    const scrollLeft = timelineWrapper.value.scrollLeft

    if (horizontalHeader?.value) {
      horizontalHeader.value.scrollLeft = scrollLeft
    }
    if (quartersHeader?.value) {
      quartersHeader.value.scrollLeft = scrollLeft
    }
    if (monthsHeader?.value) {
      monthsHeader.value.scrollLeft = scrollLeft
    }
  }

  // Обратная синхронизация: когда скроллят шапку, двигаем основной timeline.
  const onHeaderScroll = (event) => {
    if (!timelineWrapper.value) return
    timelineWrapper.value.scrollLeft = event.target.scrollLeft
  }

  return {
    syncScroll,
    onHeaderScroll
  }
}