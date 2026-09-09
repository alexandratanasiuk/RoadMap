import { ref, computed } from 'vue'
import axios from 'axios'

// Глобальное auth-состояние (singleton): доступно всем потребителям composable.
const isAuthenticated = ref(false)
const userRole = ref('')
const loginUsername = ref('')
const loginPassword = ref('')
const authError = ref('')

// Базовый URL API и helper построения пути.
const API_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const apiPath = (path) => `${API_URL}${path.startsWith('/') ? path : `/${path}`}`

// Ключи локального хранения сессии.
const LS_TOKEN = 'jwtToken'
const LS_ROLE = 'authRole'
const LS_USER = 'authUsername'

// guest-пользователь работает в read-only режиме.
const isReadOnly = computed(() => userRole.value === 'guest')

// Очистка сессии в localStorage.
const clearStoredSession = () => {
  localStorage.removeItem(LS_TOKEN)
  localStorage.removeItem(LS_ROLE)
  localStorage.removeItem(LS_USER)
}

// Восстановление сессии при перезагрузке страницы.
const restoreSessionFromStorage = () => {
  const token = localStorage.getItem(LS_TOKEN)
  if (!token) return
  const role = localStorage.getItem(LS_ROLE) ?? ''
  const username = localStorage.getItem(LS_USER) ?? ''
  axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
  userRole.value = role
  loginUsername.value = username
  isAuthenticated.value = true
}

// Единая точка выхода пользователя.
function handleLogout(options = {}) {
  console.log('👋 Выход из системы')
  clearStoredSession()
  delete axios.defaults.headers.common['Authorization']
  userRole.value = ''
  loginPassword.value = ''
  isAuthenticated.value = false
  if (options.reason === 'unauthorized') {
    authError.value = 'Сессия недействительна. Войдите снова.'
  } else {
    authError.value = ''
  }
}

// Глобальная обработка 401: автоматический logout при просрочке/ошибке токена.
axios.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && isAuthenticated.value) {
      handleLogout({ reason: 'unauthorized' })
    }
    return Promise.reject(error)
  }
)

restoreSessionFromStorage()

export function useAuth() {
  // Логин: запрос токена, сохранение в storage и установка auth-header для axios.
  const handleLogin = async () => {
    console.log('🔐 Попытка входа:', loginUsername.value)
    try {
      const response = await axios.post(apiPath('/login'), {
        username: loginUsername.value.trim(),
        password: loginPassword.value.trim()
      })

      const token = response.data.token
      const role = response.data.role ?? ''
      const username = response.data.username || loginUsername.value.trim()

      userRole.value = role
      loginUsername.value = username
      loginPassword.value = ''

      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`

      localStorage.setItem(LS_TOKEN, token)
      localStorage.setItem(LS_ROLE, role)
      localStorage.setItem(LS_USER, username)

      isAuthenticated.value = true
      authError.value = ''
      console.log('✅ Вход выполнен, токен установлен')
      return { success: true, username, role }
    } catch (error) {
      console.error('❌ Ошибка входа:', error)
      authError.value = 'Неверный логин или пароль'
      return { success: false }
    }
  }

  return {
    isAuthenticated,
    userRole,
    isReadOnly,
    loginUsername,
    loginPassword,
    authError,
    handleLogin,
    handleLogout,
    API_URL
  }
}
