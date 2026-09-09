import { ref } from 'vue'

// Ключ хранения выбранного режима отображения.
const LS_KEY = 'roadmap-view-mode'

const VALID_MODES = [
  'horizontal',
  'quarters',
  'months',
  'heatmap',
  'gantt',
  'roadmap',
  'users',
  'workspace',
  'table',
  'assistant'
]

// Читает режим из localStorage и валидирует значение.
const readStoredViewMode = () => {
  const raw = localStorage.getItem(LS_KEY) || 'horizontal'
  if (!VALID_MODES.includes(raw)) {
    localStorage.setItem(LS_KEY, 'horizontal')
    return 'horizontal'
  }
  return raw
}

// Shared singleton state so all consumers react to the same value.
const viewMode = ref(readStoredViewMode())

export function useViewMode() {
  // Переключение режима с валидацией и записью в storage.
  const setViewMode = (mode) => {
    if (!VALID_MODES.includes(mode)) return
    viewMode.value = mode
    localStorage.setItem('roadmap-view-mode', mode)
  }

  return {
    viewMode,
    setViewMode
  }
}
