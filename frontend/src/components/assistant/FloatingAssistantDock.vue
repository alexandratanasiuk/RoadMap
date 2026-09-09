<template>
  <div v-if="showDock" class="assistant-dock" aria-live="polite">
    <transition name="assistant-dock-panel">
      <div
        v-show="panelOpen"
        class="assistant-dock-panel"
        role="dialog"
        aria-label="Чат с ассистентом"
        @keydown.esc="closePanel"
      >
        <div class="assistant-dock-head">
          <span class="assistant-dock-title">Ассистент</span>
          <button type="button" class="assistant-dock-min" aria-label="Свернуть" @click="closePanel">−</button>
        </div>
        <div class="assistant-dock-body">
          <AssistantView />
        </div>
      </div>
    </transition>
    <button
      type="button"
      class="assistant-dock-fab"
      :class="{ 'assistant-dock-fab--open': panelOpen }"
      :aria-expanded="panelOpen"
      aria-label="Открыть или свернуть чат с ассистентом"
      @click="togglePanel"
    >
      <img class="assistant-dock-fab-icon" :src="assistantFabIcon" alt="" width="30" height="30" />
    </button>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { useViewMode } from '@/composables/useViewMode'
import { ASSISTANT_UI_ENABLED } from '@/config/assistantFlags'
import AssistantView from '@/components/views/AssistantView.vue'
import assistantFabIcon from '@/assets/assistant-chat-icon.svg'

const LS_OPEN = 'assistant-dock-open'

const { isAuthenticated } = useAuth()
const { viewMode } = useViewMode()
/** Плавающий чат на всех вкладках, кроме полноэкранной «Ассистент». */
const showDock = computed(
  () => ASSISTANT_UI_ENABLED && isAuthenticated.value && viewMode.value !== 'assistant'
)

const readStoredOpen = () => {
  try {
    return localStorage.getItem(LS_OPEN) === '1'
  } catch {
    return false
  }
}

const panelOpen = ref(false)

const persistOpen = (v) => {
  try {
    localStorage.setItem(LS_OPEN, v ? '1' : '0')
  } catch {
    // ignore
  }
}

watch(panelOpen, (v) => persistOpen(v))

const togglePanel = () => {
  panelOpen.value = !panelOpen.value
}

const closePanel = () => {
  panelOpen.value = false
}

const onDocKeydown = (e) => {
  if (e.key === 'Escape' && panelOpen.value) closePanel()
}

onMounted(() => {
  panelOpen.value = readStoredOpen()
  document.addEventListener('keydown', onDocKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onDocKeydown)
})
</script>

<style scoped>
.assistant-dock {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 1500;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  pointer-events: none;
}

.assistant-dock > * {
  pointer-events: auto;
}

.assistant-dock-panel {
  width: min(420px, calc(100vw - 28px));
  height: min(560px, calc(100vh - 96px));
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.14);
  overflow: hidden;
}

.assistant-dock-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.assistant-dock-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #0f172a;
}

.assistant-dock-min {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #fff;
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, border-color 0.15s;
}

.assistant-dock-min:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.assistant-dock-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.assistant-dock-body :deep(.assistant-view) {
  max-width: none;
  margin: 0;
  padding: 0.5rem 0.65rem 0.75rem;
  height: 100%;
}

.assistant-dock-body :deep(.assistant-head h2) {
  display: none;
}

.assistant-dock-body :deep(.assistant-head) {
  margin-bottom: 0.4rem;
}

.assistant-dock-fab {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 1px solid #e2e8f0;
  background: linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%);
  color: #0f172a;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.assistant-dock-fab-icon {
  display: block;
  width: 30px;
  height: 30px;
  object-fit: contain;
}

.assistant-dock-fab:hover {
  border-color: #cbd5e1;
  transform: translateY(-1px);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.16);
}

.assistant-dock-fab--open {
  border-color: #93c5fd;
  background: linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%);
  box-shadow: 0 6px 20px rgba(37, 99, 235, 0.22);
}

.assistant-dock-panel-enter-active,
.assistant-dock-panel-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.assistant-dock-panel-enter-from,
.assistant-dock-panel-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 480px) {
  .assistant-dock-panel {
    width: calc(100vw - 20px);
    height: min(72vh, calc(100vh - 88px));
  }
}
</style>
