<template>
  <div v-if="showNotification" class="notification" :class="notificationType">
    {{ notificationMessage }}
  </div>
</template>

<script setup>
import { useNotification } from '@/composables/useNotification'

// Презентационный слой глобальных toast-уведомлений.
const { showNotification, notificationMessage, notificationType } = useNotification()
</script>

<style scoped>
.notification {
  position: fixed;
  bottom: 20px;
  right: 20px;
  padding: 8px 16px;
  border-radius: 30px;
  color: white;
  font-size: 0.85rem;
  z-index: 2500;
  animation: slideIn 0.2s;
}
.notification.success { background: #10b981; }
.notification.error { background: #ef4444; }
@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
</style>