import { ref } from 'vue'

export function useNotification() {
  // Простое глобальное состояние toast-уведомления.
  const showNotification = ref(false)
  const notificationMessage = ref('')
  const notificationType = ref('success')

  // Показывает уведомление на фиксированное время.
  const showNotificationMessage = (message, type = 'success') => {
    notificationMessage.value = message
    notificationType.value = type
    showNotification.value = true
    setTimeout(() => {
      showNotification.value = false
    }, 2000)
  }

  return {
    showNotification,
    notificationMessage,
    notificationType,
    showNotificationMessage
  }
}