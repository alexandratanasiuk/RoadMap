<template>
  <div class="assistant-view">
    <header class="assistant-head">
      <h2>🤖 Ассистент</h2>
      <p v-if="statusLoading" class="assistant-sub">Проверка доступности…</p>
      <p v-else-if="status?.reason === 'guest'" class="assistant-sub assistant-sub--warn">
        В режиме гостя чат с ассистентом недоступен.
      </p>
      <p v-else-if="!status?.available && status?.reason === 'network'" class="assistant-sub assistant-sub--warn">
        Не удалось связаться с сервером (сеть или прокси). Проверьте, что backend запущен, адрес сайта совпадает с
        API, вы вошли в систему; при доступе по DNS — проброс портов и
        <code>DEV_PROXY_TARGET</code> во <code>frontend/.env</code>.
      </p>
      <p v-else-if="!status?.available && status?.reason === 'http'" class="assistant-sub assistant-sub--warn">
        Ответ сервера по ассистенту: HTTP {{ status.httpStatus }}{{ status.serverMessage ? ' — ' + status.serverMessage : '' }}. Часто это сессия: выйдите и войдите снова
        (401/403) или ошибка API (5xx — смотрите логи backend).
      </p>
      <p v-else-if="!status?.available" class="assistant-sub assistant-sub--warn">
        Ассистент на сервере выключен или не настроен{{ status?.reason ? ` (${status.reason})` : '' }}. Проверьте
        <code>ASSISTANT_ENABLED</code> и ключ GigaChat в <code>backend/.env</code>.
      </p>
      <p v-else-if="!activeProjectId" class="assistant-sub assistant-sub--warn">
        Выберите проект в шапке — иначе ассистент не видит этапы и задачи и отвечает только общими фразами.
      </p>
      <p v-else class="assistant-sub">
        Подключено: {{ status?.provider === 'gigachat' ? 'GigaChat' : status?.provider }}. Контекст проекта:
        <strong>«{{ activeProjectName }}»</strong>
        — этапы и задачи подставляются в запрос. Подсказки и сценарии без записи в БД — в колонке справа.
      </p>
    </header>

    <div class="assistant-body">
      <div class="assistant-chat-col">
        <div ref="scrollRef" class="assistant-messages" role="log" aria-live="polite">
          <div v-if="!messages.length" class="assistant-empty">
            Напишите вопрос по дорожной карте. Быстрые сценарии (резюме, неделя, сравнение этапов) — в правой панели.
          </div>
          <div
            v-for="(m, idx) in messages"
            :key="idx"
            class="assistant-row"
            :class="m.role === 'user' ? 'assistant-row--user' : 'assistant-row--bot'"
          >
            <span class="assistant-role">{{ m.role === 'user' ? 'Вы' : 'Ассистент' }}</span>
            <div class="assistant-bubble">{{ m.content }}</div>
          </div>
          <div v-if="thinking" class="assistant-row assistant-row--bot assistant-row--thinking">
            <span class="assistant-role">Ассистент</span>
            <div class="assistant-bubble assistant-bubble--muted">Печатает…</div>
          </div>
        </div>

        <div class="assistant-input-bar">
          <textarea
            v-model="draft"
            class="assistant-textarea"
            rows="2"
            placeholder="Сообщение…"
            :disabled="thinking || inputDisabled"
            @keydown.enter.exact.prevent="send"
          />
          <button
            type="button"
            class="btn btn-primary assistant-send"
            :disabled="thinking || !draftTrimmed || inputDisabled"
            @click="send"
          >
            Отправить
          </button>
        </div>
      </div>

      <aside class="assistant-sidebar" aria-label="Подсказки и быстрые сценарии">
        <div class="assistant-sidebar-inner">
          <h3 class="assistant-sidebar-heading">Что умеет ассистент</h3>
          <p class="assistant-sidebar-lead">
            Ответы строятся по выбранному в шапке проекту. Ниже — готовые сценарии и кратко, как формулировать запросы
            вручную.
          </p>

          <ul class="assistant-sidebar-list">
            <li>
              <strong>Обычный диалог</strong> — планирование, формулировки задач, сроки и зависимости; можно спросить
              про конкретный этап по названию или номеру.
            </li>
            <li>
              <strong>Резюме для руководства</strong> — краткий обзор целей, статуса и рисков; данные в системе не
              меняются.
            </li>
            <li>
              <strong>За неделю</strong> — сводка по журналу изменений этапов этого проекта (если у вашей роли есть
              доступ к истории, как у вкладки «Пользователи»).
            </li>
            <li>
              <strong>Сравнение этапов</strong> — два номера этапа в порядке отображения на доске (слева направо по
              датам релиза).
            </li>
            <li>
              <strong>Действия в дорожной карте</strong> — фразы вроде «добавь в 3-й этап задачу …» или «создай этап …»
              при наличии прав реально создают задачу или пустой этап (остальные сценарии выше — только чтение).
            </li>
          </ul>

          <div v-if="!inputDisabled" class="assistant-quick">
            <div class="assistant-quick-title">Контекст и объяснения (только чтение)</div>
            <div class="assistant-quick-actions">
              <button
                type="button"
                class="assistant-chip assistant-chip--block"
                :disabled="thinking"
                @click="runQuickScenario('executive_summary', 'Краткое резюме проекта для руководства.')"
              >
                Резюме для руководства
              </button>
              <button
                type="button"
                class="assistant-chip assistant-chip--block"
                :disabled="thinking"
                @click="runQuickScenario('weekly_digest', 'Что изменилось за неделю в этом проекте?')"
              >
                За неделю
              </button>
            </div>
            <div class="assistant-compare-block">
              <div class="assistant-compare-heading">Сравнить этапы</div>
              <p class="assistant-compare-hint">Номера как на доске (1 — первый этап в списке и т.д.).</p>
              <div class="assistant-compare-row">
                <span class="assistant-compare-label">№</span>
                <input
                  v-model.number="compareStageA"
                  class="assistant-compare-input"
                  type="number"
                  min="1"
                  step="1"
                  :disabled="thinking"
                  aria-label="Номер первого этапа"
                />
                <span class="assistant-compare-and">и</span>
                <input
                  v-model.number="compareStageB"
                  class="assistant-compare-input"
                  type="number"
                  min="1"
                  step="1"
                  :disabled="thinking"
                  aria-label="Номер второго этапа"
                />
              </div>
              <button
                type="button"
                class="assistant-chip assistant-chip--block assistant-chip--primary"
                :disabled="thinking || !comparePairValid"
                @click="runCompareScenario"
              >
                Сравнить
              </button>
            </div>
          </div>
          <p v-else class="assistant-sidebar-foot">
            Выберите проект в шапке — тогда появятся быстрые кнопки и контекст этапов.
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import axios from 'axios'
import { useAuth } from '@/composables/useAuth'
import { useProjects } from '@/composables/useProjects'
import { useBlocks } from '@/composables/useBlocks'

const { API_URL } = useAuth()
const { activeProjectId, projects } = useProjects()
const { loadBlocks } = useBlocks()
const LS_ASSISTANT_CHAT_PREFIX = 'assistant-chat:'

const activeProjectName = computed(() => {
  const id = String(activeProjectId.value || '').trim()
  if (!id) return ''
  const p = projects.value.find((x) => String(x.id) === id)
  return p?.name ? String(p.name) : id
})
const chatStorageKey = computed(() => {
  const pid = String(activeProjectId.value || '').trim()
  if (!pid) return ''
  return `${LS_ASSISTANT_CHAT_PREFIX}${pid}`
})
const apiPath = (path) => `${API_URL}${path.startsWith('/') ? path : `/${path}`}`

const messages = ref([])
const draft = ref('')
const thinking = ref(false)
const scrollRef = ref(null)
const statusLoading = ref(true)
const status = ref(null)

const draftTrimmed = computed(() => String(draft.value || '').trim())

const compareStageA = ref(1)
const compareStageB = ref(2)

const comparePairValid = computed(() => {
  const a = Number(compareStageA.value)
  const b = Number(compareStageB.value)
  return Number.isFinite(a) && Number.isFinite(b) && a >= 1 && b >= 1 && a !== b
})

const inputDisabled = computed(
  () =>
    statusLoading.value ||
    !status.value?.available ||
    status.value?.reason === 'guest' ||
    !String(activeProjectId.value || '').trim()
)

const scrollToBottom = async () => {
  await nextTick()
  const el = scrollRef.value
  if (el) el.scrollTop = el.scrollHeight
}

const postAssistantChat = async (body) => {
  const payload = messages.value.map((m) => ({ role: m.role, content: m.content }))
  const { data } = await axios.post(apiPath('/assistant/chat'), {
    messages: payload,
    projectId: String(activeProjectId.value || '').trim(),
    ...body
  })
  const reply = typeof data?.reply === 'string' ? data.reply : ''
  if (data?.applied) {
    await loadBlocks()
  }
  messages.value.push({
    role: 'assistant',
    content: reply || 'Пустой ответ от сервера.'
  })
}

const runQuickScenario = async (assistantMode, userLine) => {
  if (thinking.value || inputDisabled.value) return
  messages.value.push({ role: 'user', content: userLine })
  thinking.value = true
  try {
    await postAssistantChat({ assistantMode })
  } catch (e) {
    const msg =
      e?.response?.data?.error ||
      (e?.code === 'ERR_NETWORK' ? 'Сеть: не удалось связаться с API' : e?.message) ||
      'Ошибка запроса'
    messages.value.push({ role: 'assistant', content: `Ошибка: ${msg}` })
  } finally {
    thinking.value = false
  }
}

const runCompareScenario = async () => {
  if (!comparePairValid.value || thinking.value || inputDisabled.value) return
  const a = Math.floor(Number(compareStageA.value))
  const b = Math.floor(Number(compareStageB.value))
  const userLine = `Сравни этап ${a} и этап ${b} по задачам и срокам.`
  messages.value.push({ role: 'user', content: userLine })
  thinking.value = true
  try {
    await postAssistantChat({
      assistantMode: 'stage_compare',
      compareStageIndexA: a,
      compareStageIndexB: b
    })
  } catch (e) {
    const msg =
      e?.response?.data?.error ||
      (e?.code === 'ERR_NETWORK' ? 'Сеть: не удалось связаться с API' : e?.message) ||
      'Ошибка запроса'
    messages.value.push({ role: 'assistant', content: `Ошибка: ${msg}` })
  } finally {
    thinking.value = false
  }
}

watch(
  () => messages.value.length,
  () => {
    scrollToBottom()
  }
)

watch(
  chatStorageKey,
  (nextKey) => {
    if (!nextKey) {
      messages.value = []
      return
    }
    try {
      const raw = localStorage.getItem(nextKey)
      const parsed = raw ? JSON.parse(raw) : []
      messages.value = Array.isArray(parsed)
        ? parsed.filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
        : []
    } catch {
      messages.value = []
    }
  },
  { immediate: true }
)

watch(
  messages,
  (nextMessages) => {
    if (!chatStorageKey.value) return
    try {
      localStorage.setItem(chatStorageKey.value, JSON.stringify(nextMessages.slice(-80)))
    } catch {
      // ignore storage errors
    }
  },
  { deep: true }
)

watch(thinking, (v) => {
  if (v) scrollToBottom()
})

onMounted(async () => {
  statusLoading.value = true
  try {
    const { data } = await axios.get(apiPath('/assistant/status'))
    status.value = data
  } catch (e) {
    const res = e?.response
    if (res) {
      const serverMsg = res.data?.error
      status.value = {
        available: false,
        reason: 'http',
        httpStatus: res.status,
        serverMessage: typeof serverMsg === 'string' ? serverMsg : ''
      }
    } else {
      status.value = { available: false, reason: 'network' }
    }
  } finally {
    statusLoading.value = false
  }
})

const send = async () => {
  const text = draftTrimmed.value
  if (!text || thinking.value || inputDisabled.value) return
  messages.value.push({ role: 'user', content: text })
  draft.value = ''
  thinking.value = true
  try {
    await postAssistantChat({})
  } catch (e) {
    const msg =
      e?.response?.data?.error ||
      (e?.code === 'ERR_NETWORK' ? 'Сеть: не удалось связаться с API' : e?.message) ||
      'Ошибка запроса'
    messages.value.push({ role: 'assistant', content: `Ошибка: ${msg}` })
  } finally {
    thinking.value = false
  }
}
</script>

<style scoped>
.assistant-view {
  container-type: inline-size;
  container-name: assistant-root;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  width: 100%;
  max-width: min(1180px, 100%);
  margin: 0 auto;
  padding: 1rem 1.25rem 1.5rem;
  box-sizing: border-box;
}

.assistant-head {
  flex-shrink: 0;
  margin-bottom: 0.75rem;
}

.assistant-body {
  display: flex;
  flex: 1;
  gap: 1rem;
  align-items: stretch;
  min-height: 0;
}

.assistant-chat-col {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.assistant-head h2 {
  margin: 0 0 0.35rem;
  font-size: 1.25rem;
  font-weight: 600;
}

.assistant-sub {
  margin: 0;
  font-size: 0.875rem;
  color: #64748b;
  line-height: 1.4;
}

.assistant-sub--warn {
  color: #b45309;
}

.assistant-sub code {
  font-size: 0.8em;
}

.assistant-messages {
  flex: 1;
  min-height: 160px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  padding: 0.75rem;
}

.assistant-sidebar {
  flex-shrink: 0;
  width: min(300px, 100%);
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}

.assistant-sidebar-inner {
  padding: 0.85rem 1rem 1rem;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.assistant-sidebar-heading {
  margin: 0 0 0.4rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #0f172a;
}

.assistant-sidebar-lead {
  margin: 0 0 0.65rem;
  font-size: 0.8rem;
  line-height: 1.45;
  color: #64748b;
}

.assistant-sidebar-list {
  margin: 0 0 0.85rem;
  padding-left: 1.1rem;
  font-size: 0.8rem;
  line-height: 1.5;
  color: #475569;
}

.assistant-sidebar-list li {
  margin-bottom: 0.45rem;
}

.assistant-sidebar-list li:last-child {
  margin-bottom: 0;
}

.assistant-sidebar-foot {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.45;
  color: #94a3b8;
}

.assistant-sidebar-list strong {
  color: #334155;
}

.assistant-empty {
  font-size: 0.9rem;
  color: #94a3b8;
  padding: 1rem 0.5rem;
  text-align: center;
}

.assistant-row {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin-bottom: 0.75rem;
}

.assistant-row:last-child {
  margin-bottom: 0;
}

.assistant-row--user {
  align-items: flex-end;
}

.assistant-row--bot {
  align-items: flex-start;
}

.assistant-row--thinking .assistant-bubble {
  animation: assistant-pulse 1s ease-in-out infinite;
}

@keyframes assistant-pulse {
  50% {
    opacity: 0.65;
  }
}

.assistant-role {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
}

.assistant-bubble {
  max-width: 100%;
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  font-size: 0.9rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.assistant-row--user .assistant-bubble {
  background: #2563eb;
  color: #fff;
  border-bottom-right-radius: 4px;
}

.assistant-row--bot .assistant-bubble {
  background: #fff;
  color: #0f172a;
  border: 1px solid #e2e8f0;
  border-bottom-left-radius: 4px;
}

.assistant-bubble--muted {
  color: #64748b;
  font-style: italic;
}

.assistant-input-bar {
  flex-shrink: 0;
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
  margin-top: 0.75rem;
}

.assistant-textarea {
  flex: 1;
  resize: vertical;
  min-height: 2.5rem;
  max-height: 8rem;
  padding: 0.5rem 0.65rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-family: inherit;
  font-size: 0.9rem;
}

.btn {
  background: #fff;
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

.btn:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.btn-primary {
  background: #3b82f6;
  color: #fff;
  border-color: #2563eb;
}

.btn-primary:hover {
  background: #2563eb;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.assistant-send {
  flex-shrink: 0;
}

.assistant-quick {
  flex-shrink: 0;
  margin-top: 0.25rem;
  padding-top: 0.75rem;
  border-top: 1px solid #e2e8f0;
}

.assistant-quick-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #64748b;
  margin-bottom: 0.5rem;
}

.assistant-quick-actions {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin-bottom: 0.75rem;
}

.assistant-compare-block {
  padding-top: 0.5rem;
  border-top: 1px solid #f1f5f9;
}

.assistant-compare-heading {
  font-size: 0.8rem;
  font-weight: 600;
  color: #334155;
  margin-bottom: 0.25rem;
}

.assistant-compare-hint {
  margin: 0 0 0.45rem;
  font-size: 0.72rem;
  line-height: 1.35;
  color: #94a3b8;
}

.assistant-chip {
  font-family: inherit;
  font-size: 0.8rem;
  padding: 0.45rem 0.75rem;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.assistant-chip--block {
  display: block;
  width: 100%;
  text-align: center;
}

.assistant-chip:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #94a3b8;
}

.assistant-chip--primary {
  border-color: #3b82f6;
  color: #1d4ed8;
  font-weight: 500;
}

.assistant-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.assistant-compare-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: #475569;
  margin-bottom: 0.5rem;
}

.assistant-compare-label {
  margin-right: 0.15rem;
}

.assistant-compare-and {
  color: #64748b;
}

.assistant-compare-input {
  width: 3.25rem;
  padding: 0.3rem 0.35rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.85rem;
  text-align: center;
}

@container assistant-root (max-width: 640px) {
  .assistant-body {
    flex-direction: column;
  }

  .assistant-sidebar {
    width: 100%;
    max-height: min(340px, 42vh);
  }
}

@media (max-width: 640px) {
  .assistant-input-bar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
