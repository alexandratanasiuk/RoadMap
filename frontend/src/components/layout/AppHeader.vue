<template>
  <header class="header">
    <div class="header-top">
      <div class="brand-block">
        <div class="project-title-wrap" ref="projectMenuRoot">
          <h1>
            <img :src="roadmapIcon" alt="" class="logo-icon">
            <span>Дорожная карта проекта:</span>
            <button
              v-if="isAuthenticated"
              class="active-project-toggle"
              type="button"
              :title="projectMenuOpen ? 'Скрыть меню проекта' : 'Показать меню проекта'"
              @click="toggleProjectMenu"
            >
              "{{ activeProject?.name || 'Без проекта' }}"
            </button>
            <strong v-else class="active-project-name">"{{ activeProject?.name || 'Без проекта' }}"</strong>
          </h1>
          <div v-if="isAuthenticated && projectMenuOpen" class="project-switcher project-switcher-popover">
            <div class="project-switcher-row">
              <select
                class="project-select"
                :value="activeProjectId"
                :disabled="projectsLoading || !projects.length"
                @change="onProjectSelect"
              >
                <option v-if="!projects.length" value="">Нет проектов</option>
                <option v-for="project in projects" :key="project.id" :value="project.id">
                  {{ project.name }}
                </option>
              </select>
              <button class="btn btn-small" :disabled="isReadOnly" @click="requestCreateProject">+ Проект</button>
              <button class="btn btn-small" :disabled="isReadOnly || !activeProject" @click="requestRenameProject">
                ✏️ Переименовать
              </button>
              <button class="btn btn-small btn-danger-inline" :disabled="isReadOnly || !activeProject" @click="requestDeleteProject">
                🗑 Удалить
              </button>
            </div>
          </div>
        </div>
      </div>
      <div v-if="isAuthenticated" class="header-top-actions">
        <div class="header-radio-controls">
          <select
            v-model="headerRadioSelectedUrl"
            class="header-radio-select"
            title="Радиостанция"
            @change="onHeaderRadioStationChange"
          >
            <option v-for="station in RADIO_STATIONS" :key="station.name" :value="station.url">
              {{ station.name }}
            </option>
          </select>
          <button
            class="btn btn-small header-radio-btn"
            type="button"
            :title="headerRadioError || (headerRadioPlaying ? 'Пауза' : 'Старт')"
            @click="toggleHeaderRadioPlayback"
          >
            {{ headerRadioPlaying ? '⏸ Пауза' : '▶ Старт' }}
          </button>
          <div class="header-radio-volume-wrap" title="Громкость радио">
            <span class="header-radio-volume-icon">🔊</span>
            <input
              v-model.number="headerRadioVolume"
              class="header-radio-volume"
              type="range"
              min="0"
              max="100"
              step="1"
              @input="onHeaderRadioVolumeChange"
            >
          </div>
        </div>
        <span v-if="isReadOnly" class="read-only-badge" title="Доступен только просмотр">👁 Просмотр</span>
        <button class="btn btn-small" @click="handleLogout" title="Выйти">
          👋 Выйти ({{ loginUsername }})
        </button>
      </div>
    </div>

    <!-- Вход в систему -->
    <div v-if="!isAuthenticated" class="login-overlay">
      <div class="login-modal">
        <h3>🔐 Вход в Roadmap</h3>
        <div class="form-group">
          <label>Логин</label>
          <input v-model="loginUsername" type="text" placeholder="admin" @keyup.enter="onLogin" autofocus>
        </div>
        <div class="form-group">
          <label>Пароль</label>
          <input v-model="loginPassword" type="password" placeholder="••••••••" @keyup.enter="onLogin">
        </div>
        <div v-if="authError" class="login-error">{{ authError }}</div>
        <div class="login-actions">
          <button class="btn btn-primary" @click="onLogin">🔓 Войти</button>
        </div>
      </div>
    </div>

    <div
      v-if="projectModalOpen"
      class="project-modal-overlay"
      @pointerdown.self="onProjectModalOverlayPointerDown"
      @pointermove.self="onProjectModalOverlayPointerMove"
      @pointerup.self="onProjectModalOverlayPointerUp"
      @pointercancel.self="onProjectModalOverlayPointerCancel"
    >
      <div class="project-modal" @click.stop>
        <h3>{{ projectModalTitle }}</h3>
        <input
          v-if="projectModalMode !== 'delete'"
          v-model="projectModalValue"
          type="text"
          class="project-modal-input"
          :placeholder="projectModalMode === 'create' ? 'Название проекта' : 'Новое название проекта'"
          @keyup.enter="submitProjectModal"
          autofocus
        >
        <div v-else class="project-modal-warning">
          <p>Удалить проект "{{ activeProject?.name || 'без названия' }}"? Его этапы будут перенесены в другой проект.</p>
          <p class="project-modal-warning-note">
            Для подтверждения введите точное название проекта:
            <strong>{{ deleteProjectExpectedName || 'без названия' }}</strong>
          </p>
          <input
            v-model="projectModalValue"
            type="text"
            class="project-modal-input"
            placeholder="Введите название проекта"
            @input="projectModalError = ''"
            @keyup.enter="submitProjectModal"
            autofocus
          >
        </div>
        <div v-if="projectModalError" class="project-modal-error">{{ projectModalError }}</div>
        <div class="project-modal-actions">
          <button class="btn btn-text" @click="closeProjectModal">Отмена</button>
          <button
            class="btn btn-secondary"
            :disabled="projectModalMode === 'delete' && !isDeleteProjectNameConfirmed"
            @click="submitProjectModal"
          >
            {{
              projectModalMode === 'create'
                ? 'Создать'
                : projectModalMode === 'rename'
                  ? 'Сохранить'
                  : 'Удалить'
            }}
          </button>
        </div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-group">
        <button
          v-for="tab in visibleToolbarTabs"
          :key="tab.id"
          class="btn btn-tab"
          :class="{
            active: viewMode === tab.id,
            'btn-tab--drag-over': dragOverTabId === tab.id && draggedTabId !== tab.id,
            'btn-tab--dragging': draggedTabId === tab.id
          }"
          draggable="true"
          @click="setViewMode(tab.id)"
          @dragstart="onTabDragStart(tab.id, $event)"
          @dragover="onTabDragOver(tab.id, $event)"
          @drop="onTabDrop(tab.id, $event)"
          @dragend="onTabDragEnd"
        >
          <img v-if="tab.iconSrc" :src="tab.iconSrc" alt="" class="btn-tab-icon-img">
          <span v-else>{{ tab.icon }}</span>
          <span>{{ tab.label }}</span>
        </button>
      </div>
      <div class="toolbar-group">
        <button
          v-if="!isReadOnly && viewMode !== 'users' && viewMode !== 'workspace' && viewMode !== 'table' && viewMode !== 'assistant'"
          class="btn btn-primary"
          @click="$emit('create-block')"
        >
          + Новый этап
        </button>
        <button
          v-if="!isReadOnly && viewMode !== 'users' && viewMode !== 'workspace' && viewMode !== 'table' && viewMode !== 'assistant'"
          class="btn"
          @click="$emit('export-png')"
        >
          📸 PNG
        </button>
        <button
          v-if="!isReadOnly && viewMode !== 'users' && viewMode !== 'workspace' && viewMode !== 'table' && viewMode !== 'assistant'"
          class="btn"
          @click="$emit('export-pdf')"
        >
          📄 PDF
        </button>
        <button v-if="viewMode === 'table'" class="btn" @click="$emit('export-excel')">📊 Выгрузка в Excel</button>
      </div>
    </div>

    <!-- Статистика -->
    <div
      class="statistics-top"
      v-if="
        viewMode !== 'heatmap' &&
        viewMode !== 'gantt' &&
        viewMode !== 'roadmap' &&
        viewMode !== 'users' &&
        viewMode !== 'workspace' &&
        viewMode !== 'table' &&
        viewMode !== 'assistant'
      "
    >
      <div class="stat-item">
        <span class="stat-icon">📊</span>
        <span class="stat-label">Этапов:</span>
        <span class="stat-value">{{ blocksLength }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-icon">✅</span>
        <span class="stat-label">Завершено:</span>
        <span class="stat-value">{{ completedReleasesCount }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-icon">🕛</span>
        <span class="stat-label">В работе:</span>
        <span class="stat-value">{{ inProgressReleasesCount }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-icon">📋</span>
        <span class="stat-label">Всего задач:</span>
        <span class="stat-value">{{ totalTasksCount }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-icon">✅</span>
        <span class="stat-label">Задач выполнено:</span>
        <span class="stat-value">{{ completedTasksCount }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-icon">📈</span>
        <span class="stat-label">Прогресс:</span>
        <span class="stat-value">{{ overallProgress }}%</span>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { useViewMode } from '@/composables/useViewMode'
import { useBlocks } from '@/composables/useBlocks'
import { STAGING_ARCHITECT_USERNAME } from '@/config/stagingFlags'
import roadmapIcon from '@/assets/project-header-icon-blue.svg'
import ganttIcon from '@/assets/gantt-icon.png'
import workspaceIcon from '@/assets/workspace-icon.svg'
import {
  DEFAULT_RADIO_URL,
  RADIO_STATIONS,
  SHARED_RADIO_PLAYER_KEY,
  normalizeSharedRadioPlayer
} from '@/constants/radioStations'


// Входные данные шапки: проекты и состояние выбора проекта.
const props = defineProps({
  projects: { type: Array, default: () => [] },
  activeProjectId: { type: String, default: '' },
  projectsLoading: { type: Boolean, default: false }
})

// Глобальные состояния auth/view/blocks, используемые в хедере.
const { isAuthenticated, isReadOnly, loginUsername, loginPassword, authError, handleLogin, handleLogout } = useAuth()
const showTestUsersTab = computed(
  () =>
    isAuthenticated.value &&
    String(loginUsername.value || '').trim().toLowerCase() ===
      STAGING_ARCHITECT_USERNAME.trim().toLowerCase()
)
const { viewMode, setViewMode } = useViewMode()
const { blocks, completedReleasesCount, inProgressReleasesCount, totalTasksCount, completedTasksCount, overallProgress } = useBlocks()

// События наверх: управление этапами, экспортом, авторизацией и проектами.
const emit = defineEmits([
  'create-block',
  'export-png',
  'export-pdf',
  'export-excel',
  'login-success',
  'switch-project',
  'create-project',
  'rename-project',
  'delete-project'
])

// Настройки порядка/состава вкладок тулбара.
const TOOLBAR_TAB_ORDER_KEY_PREFIX = 'roadmap-toolbar-tab-order:'
const DEFAULT_TAB_ORDER = [
  'horizontal',
  'quarters',
  'heatmap',
  'gantt',
  'roadmap',
  'workspace',
  'assistant',
  'table',
  'users'
]
const TAB_DEFINITIONS = {
  horizontal: { id: 'horizontal', icon: '📅', label: 'По месяцам' },
  quarters: { id: 'quarters', icon: '📊', label: 'По кварталам' },
  heatmap: { id: 'heatmap', icon: '🔥', label: 'Тепловая карта' },
  gantt: { id: 'gantt', icon: '📈', iconSrc: ganttIcon, label: 'Диаграмма Ганта' },
  roadmap: { id: 'roadmap', icon: '🛣️', label: 'Roadmap Canvas' },
  workspace: { id: 'workspace', icon: '🧰', iconSrc: workspaceIcon, label: 'Рабочий стол' },
  assistant: { id: 'assistant', icon: '💬', label: 'Ассистент' },
  table: { id: 'table', icon: '📋', label: 'Таблица' },
  users: { id: 'users', icon: '👥', label: 'Пользователи' }
}

// Конфиг встроенного радио-плеера в шапке (общий инстанс между компонентами).
const tabOrder = ref([...DEFAULT_TAB_ORDER])
const draggedTabId = ref('')
const dragOverTabId = ref('')
const projectMenuOpen = ref(false)
const projectMenuRoot = ref(null)
const headerRadioSelectedUrl = ref(DEFAULT_RADIO_URL)
const headerRadioPlaying = ref(false)
const headerRadioError = ref('')
const headerRadioVolume = ref(35)
let headerRadioPlayHandler = null
let headerRadioPauseHandler = null
let headerRadioErrorHandler = null

const getSharedRadioPlayer = () => {
  if (typeof window === 'undefined') return null
  if (!window[SHARED_RADIO_PLAYER_KEY]) {
    const audio = new Audio()
    audio.preload = 'none'
    window[SHARED_RADIO_PLAYER_KEY] = {
      audio,
      currentUrl: DEFAULT_RADIO_URL,
      volume: 35
    }
  }
  return window[SHARED_RADIO_PLAYER_KEY]
}

const syncHeaderRadioState = () => {
  const shared = getSharedRadioPlayer()
  if (!shared) return
  const currentUrl = normalizeSharedRadioPlayer(shared)
  headerRadioSelectedUrl.value = currentUrl
  if (Number.isFinite(Number(shared.volume))) {
    headerRadioVolume.value = Math.max(0, Math.min(100, Number(shared.volume)))
  }
  headerRadioPlaying.value = !shared.audio.paused && !shared.audio.ended
}

const onHeaderRadioVolumeChange = () => {
  const shared = getSharedRadioPlayer()
  if (!shared) return
  const normalized = Math.max(0, Math.min(100, Number(headerRadioVolume.value) || 0))
  headerRadioVolume.value = normalized
  shared.volume = normalized
  shared.audio.volume = normalized / 100
}

const onHeaderRadioStationChange = async () => {
  const shared = getSharedRadioPlayer()
  if (!shared) return
  headerRadioError.value = ''
  const nextUrl = String(headerRadioSelectedUrl.value || '').trim()
  const wasPlaying = !shared.audio.paused && !shared.audio.ended
  shared.currentUrl = nextUrl
  if (!nextUrl) return
  if (!String(shared.audio.src || '').includes(nextUrl)) {
    shared.audio.src = nextUrl
  }
  if (wasPlaying) {
    try {
      await shared.audio.play()
      headerRadioPlaying.value = true
    } catch {
      headerRadioPlaying.value = false
      headerRadioError.value = 'Не удалось запустить станцию'
    }
  }
}

const toggleHeaderRadioPlayback = async () => {
  const shared = getSharedRadioPlayer()
  if (!shared) return
  headerRadioError.value = ''
  const nextUrl = String(headerRadioSelectedUrl.value || '').trim()
  if (!nextUrl) return
  shared.currentUrl = nextUrl
  if (!String(shared.audio.src || '').includes(nextUrl)) {
    shared.audio.src = nextUrl
  }
  try {
    if (!shared.audio.paused && !shared.audio.ended) {
      shared.audio.pause()
      headerRadioPlaying.value = false
      return
    }
    onHeaderRadioVolumeChange()
    await shared.audio.play()
    headerRadioPlaying.value = true
  } catch {
    headerRadioPlaying.value = false
    headerRadioError.value = 'Не удалось запустить станцию'
  }
}

const normalizedUserName = computed(() => String(loginUsername.value || '').trim().toLowerCase())
const toolbarTabStorageKey = computed(() => {
  if (!isAuthenticated.value || !normalizedUserName.value) return ''
  return `${TOOLBAR_TAB_ORDER_KEY_PREFIX}${normalizedUserName.value}`
})

const normalizeTabOrder = (rawOrder) => {
  const list = Array.isArray(rawOrder) ? rawOrder : []
  const uniqueKnown = list.filter((id, idx) => DEFAULT_TAB_ORDER.includes(id) && list.indexOf(id) === idx)
  DEFAULT_TAB_ORDER.forEach((id) => {
    if (!uniqueKnown.includes(id)) uniqueKnown.push(id)
  })
  return uniqueKnown
}

const loadTabOrder = (storageKey) => {
  if (!storageKey) return [...DEFAULT_TAB_ORDER]
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return [...DEFAULT_TAB_ORDER]
    return normalizeTabOrder(JSON.parse(raw))
  } catch {
    return [...DEFAULT_TAB_ORDER]
  }
}

const saveTabOrder = () => {
  if (!toolbarTabStorageKey.value) return
  localStorage.setItem(toolbarTabStorageKey.value, JSON.stringify(normalizeTabOrder(tabOrder.value)))
}

const visibleToolbarTabs = computed(() => {
  const canShowUsers = showTestUsersTab.value
  const canShowWorkspace = !isReadOnly.value
  return normalizeTabOrder(tabOrder.value)
    .filter(
      (id) =>
        (id !== 'users' || canShowUsers) &&
        (id !== 'workspace' || canShowWorkspace)
    )
    .map((id) => TAB_DEFINITIONS[id])
    .filter(Boolean)
})

const moveTabBefore = (draggedId, targetId) => {
  if (!draggedId || !targetId || draggedId === targetId) return
  const order = normalizeTabOrder(tabOrder.value)
  const from = order.indexOf(draggedId)
  const to = order.indexOf(targetId)
  if (from < 0 || to < 0) return
  const next = [...order]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  tabOrder.value = next
  saveTabOrder()
}

const onTabDragStart = (tabId, event) => {
  draggedTabId.value = tabId
  dragOverTabId.value = ''
  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', tabId)
  }
}

const onTabDragOver = (tabId, event) => {
  if (!draggedTabId.value || draggedTabId.value === tabId) return
  event.preventDefault()
  dragOverTabId.value = tabId
}

const onTabDrop = (tabId, event) => {
  event.preventDefault()
  const droppedId = draggedTabId.value || event?.dataTransfer?.getData('text/plain') || ''
  moveTabBefore(droppedId, tabId)
  draggedTabId.value = ''
  dragOverTabId.value = ''
}

const onTabDragEnd = () => {
  draggedTabId.value = ''
  dragOverTabId.value = ''
}

const onLogin = async () => {
  const result = await handleLogin()
  if (result?.success) {
    tabOrder.value = loadTabOrder(toolbarTabStorageKey.value)
    emit('login-success')
  }
}

const blocksLength = computed(() => blocks.value.length)
const activeProject = computed(() =>
  (props.projects || []).find((project) => String(project.id) === String(props.activeProjectId)) || null
)

const onProjectSelect = (event) => {
  const projectId = String(event?.target?.value || '')
  emit('switch-project', projectId)
  projectMenuOpen.value = false
}

const requestCreateProject = () => {
  projectMenuOpen.value = false
  openProjectModal('create')
}

const requestRenameProject = () => {
  if (!activeProject.value) return
  projectMenuOpen.value = false
  openProjectModal('rename')
}

const requestDeleteProject = () => {
  if (!activeProject.value) return
  projectMenuOpen.value = false
  openProjectModal('delete')
}

const toggleProjectMenu = () => {
  if (!isAuthenticated.value) return
  projectMenuOpen.value = !projectMenuOpen.value
}

const onProjectMenuDocumentPointerDown = (event) => {
  if (!projectMenuOpen.value) return
  const root = projectMenuRoot.value
  const target = event?.target
  if (root && target instanceof Node && root.contains(target)) return
  projectMenuOpen.value = false
}

const projectModalOpen = ref(false)
const projectModalMode = ref('create')
const projectModalValue = ref('')
const projectModalError = ref('')
const projectModalOverlayPointer = ref({
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  moved: false
})
const projectModalTitle = computed(() =>
  projectModalMode.value === 'create'
    ? 'Создать проект'
    : projectModalMode.value === 'rename'
      ? 'Переименовать проект'
      : 'Удалить проект'
)
const deleteProjectExpectedName = computed(() => String(activeProject.value?.name || '').trim())
const isDeleteProjectNameConfirmed = computed(() => {
  if (projectModalMode.value !== 'delete') return true
  return String(projectModalValue.value || '').trim() === deleteProjectExpectedName.value
})

const openProjectModal = (mode) => {
  projectModalMode.value = ['rename', 'delete'].includes(mode) ? mode : 'create'
  projectModalValue.value =
    projectModalMode.value === 'rename'
      ? String(activeProject.value?.name || '')
      : ''
  projectModalError.value = ''
  projectModalOpen.value = true
}

const closeProjectModal = () => {
  projectModalOpen.value = false
  projectModalError.value = ''
}

const onProjectModalOverlayPointerDown = (event) => {
  projectModalOverlayPointer.value = {
    active: true,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    moved: false
  }
}

const onProjectModalOverlayPointerMove = (event) => {
  const state = projectModalOverlayPointer.value
  if (!state.active || state.pointerId !== event.pointerId) return
  const dx = Math.abs(event.clientX - state.startX)
  const dy = Math.abs(event.clientY - state.startY)
  if (dx > 4 || dy > 4) state.moved = true
}

const onProjectModalOverlayPointerUp = (event) => {
  const state = projectModalOverlayPointer.value
  if (!state.active || state.pointerId !== event.pointerId) return
  const shouldClose = !state.moved
  projectModalOverlayPointer.value = {
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    moved: false
  }
  if (shouldClose) closeProjectModal()
}

const onProjectModalOverlayPointerCancel = () => {
  projectModalOverlayPointer.value = {
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    moved: false
  }
}

const submitProjectModal = () => {
  if (projectModalMode.value === 'delete') {
    if (!activeProject.value) {
      projectModalError.value = 'Проект не выбран'
      return
    }
    if (!isDeleteProjectNameConfirmed.value) {
      projectModalError.value = 'Введите точное название проекта для удаления'
      return
    }
    emit('delete-project', activeProject.value.id)
    closeProjectModal()
    return
  }

  const name = String(projectModalValue.value || '').trim()
  if (!name) {
    projectModalError.value = 'Введите название проекта'
    return
  }

  if (projectModalMode.value === 'create') {
    emit('create-project', name)
    closeProjectModal()
    return
  }

  if (!activeProject.value) {
    projectModalError.value = 'Проект не выбран'
    return
  }

  emit('rename-project', { projectId: activeProject.value.id, name })
  closeProjectModal()
}

onMounted(() => {
  tabOrder.value = loadTabOrder(toolbarTabStorageKey.value)
  document.addEventListener('pointerdown', onProjectMenuDocumentPointerDown)
  const sharedRadio = getSharedRadioPlayer()
  syncHeaderRadioState()
  if (sharedRadio) {
    headerRadioPlayHandler = () => {
      headerRadioPlaying.value = true
      headerRadioError.value = ''
    }
    headerRadioPauseHandler = () => {
      headerRadioPlaying.value = false
    }
    headerRadioErrorHandler = () => {
      headerRadioPlaying.value = false
      headerRadioError.value = 'Ошибка потока'
    }
    sharedRadio.audio.addEventListener('play', headerRadioPlayHandler)
    sharedRadio.audio.addEventListener('pause', headerRadioPauseHandler)
    sharedRadio.audio.addEventListener('error', headerRadioErrorHandler)
  }
  onHeaderRadioVolumeChange()
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onProjectMenuDocumentPointerDown)
  const sharedRadio = getSharedRadioPlayer()
  if (sharedRadio) {
    if (headerRadioPlayHandler) sharedRadio.audio.removeEventListener('play', headerRadioPlayHandler)
    if (headerRadioPauseHandler) sharedRadio.audio.removeEventListener('pause', headerRadioPauseHandler)
    if (headerRadioErrorHandler) sharedRadio.audio.removeEventListener('error', headerRadioErrorHandler)
  }
  headerRadioPlayHandler = null
  headerRadioPauseHandler = null
  headerRadioErrorHandler = null
})

watch(toolbarTabStorageKey, (newKey) => {
  tabOrder.value = loadTabOrder(newKey)
})

</script>

<style scoped>
/* Стили скопированы из App.vue, адаптированы */
.header {
  flex-shrink: 0;
  margin-bottom: 2px;
}
.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 7px;
}
.brand-block {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.project-title-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.header h1 {
  font-size: 1.04rem;
  font-weight: 600;
  color: #1e293b;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 0;
}
.logo-icon {
  width: 1em;
  height: 1em;
  border-radius: 0;
  object-fit: contain;
  flex-shrink: 0;
}
.header h1 span { color: #334155; }
.active-project-name {
  color: #2563eb;
  font-weight: 700;
}
.active-project-toggle {
  border: none;
  background: transparent;
  color: #2563eb;
  font: inherit;
  font-weight: 700;
  padding: 0;
  margin: 0;
  cursor: pointer;
  line-height: 1.1;
}
.active-project-toggle:hover {
  color: #1d4ed8;
  text-decoration: underline;
}
.project-switcher {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  margin-top: 0;
}
.project-switcher-popover {
  position: absolute;
  left: 0;
  top: calc(100% + 8px);
  transform: none;
  background: #ffffff;
  border: 1px solid #dbe4ee;
  border-radius: 10px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.18);
  padding: 8px;
  z-index: 50;
  min-width: 320px;
  max-width: min(92vw, 560px);
}
.project-switcher-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-start;
}
.project-select {
  min-width: 180px;
  max-width: 300px;
  background: white;
  border: 1px solid #e2e8f0;
  padding: 5px 9px;
  border-radius: 8px;
  font-size: 0.76rem;
  color: #334155;
}
.project-select:focus {
  outline: none;
  border-color: #60a5fa;
}
.header-top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.header-radio-controls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.header-radio-select {
  min-width: 180px;
  max-width: 260px;
  background: white;
  border: 1px solid #e2e8f0;
  padding: 5px 8px;
  border-radius: 8px;
  font-size: 0.74rem;
  color: #334155;
}
.header-radio-select:focus {
  outline: none;
  border-color: #60a5fa;
}
.header-radio-btn {
  white-space: nowrap;
}
.header-radio-volume-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #ffffff;
}
.header-radio-volume-icon {
  font-size: 0.7rem;
  line-height: 1;
}
.header-radio-volume {
  width: 74px;
  height: 14px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.toolbar-group {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.btn {
  background: white;
  border: 1px solid #e2e8f0;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}

.btn-tab {
  user-select: none;
  position: relative;
}
.btn-tab-icon-img {
  width: 14px;
  height: 14px;
  object-fit: contain;
  flex: 0 0 auto;
}

.btn-tab--drag-over {
  border-color: #60a5fa;
}

.btn-tab--drag-over::before {
  content: '';
  position: absolute;
  left: -9px;
  top: 50%;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-right: 8px solid #3b82f6;
  pointer-events: none;
}

.btn-tab--drag-over::after {
  content: '';
  position: absolute;
  left: -1px;
  top: 4px;
  bottom: 4px;
  width: 2px;
  background: #3b82f6;
  border-radius: 2px;
  pointer-events: none;
}

.btn-tab--dragging {
  opacity: 0.6;
}
.btn:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}
.btn.active {
  background: #3b82f6;
  color: white;
  border-color: #2563eb;
}
.btn-primary {
  background: #3b82f6;
  color: white;
  border-color: #2563eb;
}
.btn-primary:hover { background: #2563eb; }
.btn-small { padding: 4px 8px; font-size: 0.7rem; }
.statistics-top {
  display: flex;
  gap: 20px;
  padding: 10px 16px;
  background: white;
  border-radius: 5px;
  border: 1px solid #e2e8f0;
  margin-bottom: 12px;
  font-size: 0.85rem;
  flex-wrap: wrap;
  justify-content: center;
}
.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 20px;
  background: #f8fafc;
}
.stat-icon { font-size: 1rem; }
.stat-label { color: #64748b; font-weight: 500; }
.stat-value {
  font-weight: 700;
  color: #0f172a;
  background: white;
  padding: 2px 8px;
  border-radius: 30px;
  min-width: 40px;
  text-align: center;
}
.stat-item:nth-child(6) .stat-value {
  background: linear-gradient(135deg, #3b82f6, #22c55e);
  color: white;
}
.login-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(5px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}
.login-modal {
  background: white;
  border-radius: 24px;
  padding: 32px;
  width: 460px;
  max-width: 90%;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  box-sizing: border-box;
}
.login-modal h3 { font-size: 1.5rem; margin-bottom: 24px; color: #1e293b; text-align: center; }
.login-modal .form-group { margin-bottom: 20px; }
.login-modal label { display: block; margin-bottom: 8px; color: #475569; font-weight: 500; }
.login-modal input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  font-size: 1rem;
  box-sizing: border-box;
}
.login-modal input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
.login-error { color: #ef4444; font-size: 0.9rem; margin-bottom: 16px; padding: 8px 12px; background: #fee2e2; border-radius: 8px; }
.login-actions { display: flex; justify-content: center; margin: 24px 0 16px; }
.login-hint { text-align: center; color: #94a3b8; font-size: 0.8rem; }
.header-top-actions .btn-small {
  padding: 6px 10px;
  font-size: 0.74rem;
  border-radius: 9px;
}
.project-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 12000;
}
.project-modal {
  width: min(92vw, 420px);
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 14px 38px rgba(15, 23, 42, 0.25);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.project-modal h3 {
  margin: 0;
  font-size: 1rem;
  color: #0f172a;
}
.project-modal-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.9rem;
  color: #0f172a;
}
.project-modal-input:focus {
  outline: none;
  border-color: #60a5fa;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}
.project-modal-error {
  font-size: 0.78rem;
  color: #dc2626;
}
.project-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.project-modal-warning {
  font-size: 0.86rem;
  line-height: 1.4;
  color: #7f1d1d;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  border-radius: 8px;
  padding: 8px 10px;
}
.project-modal-warning p {
  margin: 0 0 6px 0;
}
.project-modal-warning p:last-child {
  margin-bottom: 0;
}
.project-modal-warning-note {
  color: #991b1b;
}
.btn-danger-inline {
  border-color: #fecaca;
  color: #b91c1c;
  background: #fff1f2;
}
.btn-danger-inline:hover {
  background: #ffe4e6;
  border-color: #fda4af;
}
.read-only-badge {
  font-size: 0.72rem;
  font-weight: 600;
  color: #475569;
  background: #e2e8f0;
  padding: 4px 10px;
  border-radius: 20px;
  border: 1px solid #cbd5e1;
}
</style>