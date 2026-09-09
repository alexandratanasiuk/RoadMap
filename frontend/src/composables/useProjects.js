import { ref, computed } from 'vue'
import axios from 'axios'
import { useAuth } from './useAuth'

// Глобальное состояние проектов (singleton) для всех экранов.
const projects = ref([])
const isLoadingProjects = ref(false)
const activeProjectId = ref('')

// Ключ localStorage для запоминания проекта по пользователю.
const LS_ACTIVE_PROJECT_PREFIX = 'roadmap-active-project:'

const normalizeProjectName = (value) => String(value || '').trim().slice(0, 80)
const parseSharedUsernames = (input) => {
  if (Array.isArray(input)) return input.map((x) => String(x || '').trim()).filter(Boolean)
  if (typeof input === 'string') {
    return input
      .split(',')
      .map((x) => String(x || '').trim())
      .filter(Boolean)
  }
  return []
}

const normalizeProject = (project) => {
  if (!project || typeof project !== 'object') return project
  return {
    ...project,
    sharedUsernames: parseSharedUsernames(project.sharedUsernames)
  }
}

export function useProjects() {
  // auth/API контекст.
  const { isAuthenticated, loginUsername, API_URL, handleLogout } = useAuth()
  const apiPath = (path) => `${API_URL}${path.startsWith('/') ? path : `/${path}`}`

  // Индивидуальный storage key на пользователя.
  const storageKey = computed(() => {
    const username = String(loginUsername.value || '').trim().toLowerCase()
    if (!username) return ''
    return `${LS_ACTIVE_PROJECT_PREFIX}${username}`
  })

  // Persist/restore активного проекта между сессиями.
  const persistActiveProject = (projectId) => {
    if (!storageKey.value) return
    if (!projectId) {
      localStorage.removeItem(storageKey.value)
      return
    }
    localStorage.setItem(storageKey.value, String(projectId))
  }

  const restoreActiveProject = () => {
    if (!storageKey.value) return ''
    return String(localStorage.getItem(storageKey.value) || '')
  }

  const setActiveProject = (projectId) => {
    activeProjectId.value = String(projectId || '')
    persistActiveProject(activeProjectId.value)
  }

  // Загрузка списка проектов и восстановление активного проекта.
  const loadProjects = async () => {
    if (!isAuthenticated.value) return { success: false, projects: [] }
    if (isLoadingProjects.value) return { success: true, projects: projects.value }

    isLoadingProjects.value = true
    try {
      const response = await axios.get(apiPath('/projects'))
      projects.value = Array.isArray(response.data) ? response.data.map(normalizeProject) : []

      const savedProjectId = restoreActiveProject()
      const availableIds = new Set(projects.value.map((p) => String(p.id)))
      if (savedProjectId && availableIds.has(savedProjectId)) {
        activeProjectId.value = savedProjectId
      } else {
        activeProjectId.value = projects.value[0]?.id ? String(projects.value[0].id) : ''
      }
      persistActiveProject(activeProjectId.value)
      return { success: true, projects: projects.value }
    } catch (error) {
      if (error.response?.status === 401) {
        handleLogout({ reason: 'unauthorized' })
      }
      return { success: false, error, projects: [] }
    } finally {
      isLoadingProjects.value = false
    }
  }

  // CRUD проектов.
  const createProject = async (name) => {
    const normalizedName = normalizeProjectName(name)
    if (!normalizedName) {
      return { success: false, message: 'Введите название проекта' }
    }
    try {
      const response = await axios.post(apiPath('/projects'), { name: normalizedName })
      const created = normalizeProject(response.data)
      projects.value.push(created)
      projects.value = [...projects.value]
      setActiveProject(created?.id || '')
      return { success: true, project: created }
    } catch (error) {
      const message = error.response?.data?.error || 'Не удалось создать проект'
      return { success: false, message, error }
    }
  }

  const renameProject = async (projectId, nextName) => {
    const normalizedName = normalizeProjectName(nextName)
    if (!normalizedName) {
      return { success: false, message: 'Введите название проекта' }
    }
    try {
      const response = await axios.put(apiPath(`/projects/${projectId}`), { name: normalizedName })
      const updated = normalizeProject(response.data)
      const idx = projects.value.findIndex((p) => String(p.id) === String(projectId))
      if (idx !== -1) {
        projects.value[idx] = updated
        projects.value = [...projects.value]
      }
      return { success: true, project: updated }
    } catch (error) {
      const message = error.response?.data?.error || 'Не удалось переименовать проект'
      return { success: false, message, error }
    }
  }

  const deleteProject = async (projectId) => {
    const id = String(projectId || '').trim()
    if (!id) {
      return { success: false, message: 'Проект не выбран' }
    }
    try {
      const response = await axios.delete(apiPath(`/projects/${id}`))
      const fallbackProjectId = String(response.data?.fallbackProjectId || '')
      projects.value = projects.value.filter((p) => String(p.id) !== id)
      const fallbackProject = normalizeProject(response.data?.fallbackProject)
      if (fallbackProject && !projects.value.some((p) => String(p.id) === String(fallbackProject.id))) {
        projects.value.unshift(fallbackProject)
      }
      projects.value = [...projects.value]
      if (activeProjectId.value === id) {
        setActiveProject(fallbackProjectId || projects.value[0]?.id || '')
      } else if (!projects.value.some((p) => String(p.id) === String(activeProjectId.value))) {
        setActiveProject(fallbackProjectId || projects.value[0]?.id || '')
      }
      return { success: true, fallbackProjectId, data: response.data }
    } catch (error) {
      const message = error.response?.data?.error || 'Не удалось удалить проект'
      return { success: false, message, error }
    }
  }

  // Текущий выбранный проект как computed-ссылка.
  const activeProject = computed(() =>
    projects.value.find((p) => String(p.id) === String(activeProjectId.value)) || null
  )

  const addProjectMember = async ({ projectId, username }) => {
    const id = String(projectId || '').trim()
    const member = String(username || '').trim()
    if (!id || !member) return { success: false, message: 'Проект или пользователь не указан' }
    try {
      const response = await axios.post(apiPath(`/projects/${id}/members`), { username: member })
      const updated = normalizeProject(response.data?.project || response.data)
      if (updated?.id) {
        const idx = projects.value.findIndex((p) => String(p.id) === String(updated.id))
        if (idx !== -1) {
          projects.value[idx] = updated
          projects.value = [...projects.value]
        } else {
          projects.value.push(updated)
          projects.value = [...projects.value]
        }
      } else {
        await loadProjects()
      }
      return { success: true, project: updated || null }
    } catch (error) {
      const message = error.response?.data?.error || 'Не удалось добавить участника'
      return { success: false, message, error }
    }
  }

  const removeProjectMember = async ({ projectId, username }) => {
    const id = String(projectId || '').trim()
    const member = String(username || '').trim()
    if (!id || !member) return { success: false, message: 'Проект или пользователь не указан' }
    try {
      const response = await axios.delete(apiPath(`/projects/${id}/members`), {
        data: { username: member }
      })
      const updated = normalizeProject(response.data?.project || response.data)
      if (updated?.id) {
        const idx = projects.value.findIndex((p) => String(p.id) === String(updated.id))
        if (idx !== -1) {
          projects.value[idx] = updated
          projects.value = [...projects.value]
        } else {
          await loadProjects()
        }
      } else {
        await loadProjects()
      }
      return { success: true, project: updated || null }
    } catch (error) {
      const message = error.response?.data?.error || 'Не удалось удалить участника'
      return { success: false, message, error }
    }
  }

  return {
    projects,
    activeProjectId,
    activeProject,
    isLoadingProjects,
    loadProjects,
    setActiveProject,
    createProject,
    renameProject,
    deleteProject,
    addProjectMember,
    removeProjectMember
  }
}
