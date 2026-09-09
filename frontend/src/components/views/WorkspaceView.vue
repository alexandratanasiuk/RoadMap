<template>
  <div class="workspace-root" :style="workspaceGridStyle">
    <button
      v-if="isDayCollapsed"
      type="button"
      class="edge-tail edge-tail-left"
      @click="toggleDayColumn"
      title="Показать колонку Сегодня"
    >
      ▸
    </button>
    <button
      v-if="isWidgetsCollapsed"
      type="button"
      class="edge-tail edge-tail-right"
      @click="toggleWidgetsColumn"
      title="Показать колонку Виджеты"
    >
      ◂
    </button>

    <section class="col col-day" :class="{ collapsed: isDayCollapsed }">
      <button
        type="button"
        class="edge-hide-btn edge-hide-btn-day"
        @click="toggleDayColumn"
        title="Скрыть колонку Сегодня"
      >
        ◂
      </button>
      <header class="col-header">
        <div class="day-head-row">
          <div class="day-head-left">
            <h3>{{ dayColumnHeading }}</h3>
            <button
              type="button"
              class="day-reminder-enable-btn"
              :title="plannerReminderHint"
              @click="enableWorkspacePlanReminders"
            >
              🔔
            </button>
          </div>
          <div class="day-switch">
            <button type="button" class="day-switch-btn" :class="{ active: isTodayView }" @click="goToToday">Сегодня</button>
            <button type="button" class="day-switch-btn" :class="{ active: isTomorrowView }" @click="goToTomorrow">Завтра</button>
          </div>
        </div>
        <div class="date">{{ todayLabel }}</div>
      </header>
      <Teleport to="body">
        <div
          v-if="planReminderToasts.length"
          class="plan-reminder-layer plan-reminder-layer--fixed"
          aria-live="polite"
        >
          <div
            v-for="toast in planReminderToasts"
            :key="toast.key"
            class="plan-reminder-toast"
          >
            <span class="plan-reminder-toast-bell" aria-hidden="true">🔔</span>
            <div class="plan-reminder-toast-text">
              <div class="plan-reminder-toast-kicker">{{ PLAN_REMINDER_HEADING }}</div>
              <div class="plan-reminder-toast-body">
                <span v-if="toast.lead">~{{ toast.lead }} мин до начала · </span>{{ toast.time }} — {{ toast.text }}
              </div>
            </div>
            <button type="button" class="plan-reminder-toast-close" title="Закрыть" @click="dismissPlanReminder(toast.key)">
              ×
            </button>
          </div>
        </div>
      </Teleport>
      <div class="quick-add day-quick-add">
        <input v-model="newPlanTime" type="time" class="input-time">
        <input v-model="newPlanDate" type="date" class="input-date">
        <select v-model="newPlanRecurrence" class="input-select">
          <option value="none">Без повтора</option>
          <option value="daily">Каждый день</option>
          <option value="weekdays">Будние (пн–пт)</option>
          <option value="monthly">Раз в месяц</option>
          <option value="custom_days">По выбранным дням…</option>
        </select>
      </div>
      <div v-if="newPlanRecurrence === 'custom_days'" class="recurrence-weekdays-row recurrence-weekdays-row--new">
        <span class="recurrence-weekdays-hint">Дни недели:</span>
        <label
          v-for="opt in weekdayRecurrenceOptions"
          :key="'new-wd-' + opt.value"
          class="recurrence-day-label"
        >
          <input
            type="checkbox"
            :checked="newPlanWeekdays.includes(opt.value)"
            @change="toggleNewPlanWeekday(opt.value)"
          >
          <span>{{ opt.label }}</span>
        </label>
      </div>
      <div class="quick-add quick-add-second-row day-quick-add-second-row">
        <input
          v-model.trim="newPlanText"
          type="text"
          class="input-text input-text-full"
          placeholder="Новая задача/план"
          @keyup.enter="addPlan"
        >
        <button class="btn-add" type="button" @click="addPlan">Добавить</button>
      </div>
      <div v-if="addInfo" class="add-info add-info-day">{{ addInfo }}</div>

      <div ref="timelineRef" class="timeline">
        <div class="timeline-scale" :style="{ height: `${timelineHeight}px` }">
          <div
            v-for="slot in hourSlots"
            :key="slot.hour"
            class="time-slot"
          >
            <span class="time-label">{{ slot.label }}</span>
            <span class="time-line" />
          </div>
        </div>

        <div class="timeline-plans">
          <div
            v-for="plan in sortedPlans"
            :key="plan.id"
            class="plan-dot"
            :style="{ top: `${planTop(plan.time)}px` }"
            :class="{
              done: plan.done,
              dragging: draggingPlanId === plan.id,
              overdue: plan.overdue && !plan.done,
              'plan-dot--pulse': pulsingPlanDotIds.includes(plan.id)
            }"
            :title="`${plan.time} · ${plan.text}`"
            @mousedown.prevent="startPlanDrag($event, plan)"
            @click.stop="startEditPlan(plan)"
          >
            <button
              class="dot-done-btn"
              :class="{ checked: plan.done }"
              type="button"
              @mousedown.stop
              @click.stop="toggleDone(plan.id)"
              :title="plan.done ? 'Снять отметку готово' : 'Отметить как готово'"
            >
              <span v-if="plan.done">✓</span>
            </button>
            <span class="dot-time">{{ plan.time }}</span>
            <span class="dot-text">{{ plan.text }}</span>
            <span v-if="plan.recurrence !== 'none'" class="dot-repeat">{{ recurrenceLabel(plan.recurrence, plan.recurrenceWeekdays) }}</span>
          </div>

          <div v-if="isTodayView" class="now-line" :style="{ top: `${nowLineTop}px` }">
            <span class="now-label">Сейчас {{ nowTimeLabel }}</span>
          </div>
        </div>
      </div>
      <div v-if="editingPlanId" class="day-edit-card">
        <div class="day-edit-title">Редактирование задачи</div>
        <div class="plan-edit-grid">
          <input v-model="editPlanDraft.time" type="time" class="input-time">
          <input v-model="editPlanDraft.startDate" type="date" class="input-date">
          <select v-model="editPlanDraft.recurrence" class="input-select">
            <option value="none">Без повтора</option>
            <option value="daily">Каждый день</option>
            <option value="weekdays">Будние (пн–пт)</option>
            <option value="monthly">Раз в месяц</option>
            <option value="custom_days">По выбранным дням…</option>
          </select>
          <input
            v-model.trim="editPlanDraft.text"
            type="text"
            class="input-text"
            placeholder="Текст задачи"
            @keyup.enter="saveEditPlan"
          >
        </div>
        <div v-if="editPlanDraft.recurrence === 'custom_days'" class="recurrence-weekdays-row recurrence-weekdays-row--edit">
          <span class="recurrence-weekdays-hint">Дни недели:</span>
          <label
            v-for="opt in weekdayRecurrenceOptions"
            :key="'edit-wd-' + opt.value"
            class="recurrence-day-label"
          >
            <input
              type="checkbox"
              :checked="(editPlanDraft.recurrenceWeekdays || []).includes(opt.value)"
              @change="toggleEditPlanWeekday(opt.value)"
            >
            <span>{{ opt.label }}</span>
          </label>
        </div>
        <div class="plan-edit-actions">
          <button class="btn-mini btn-save" type="button" @click="saveEditPlan">Сохранить</button>
          <button class="btn-mini" type="button" @click="cancelEditPlan">Отмена</button>
          <button class="btn-mini btn-del btn-del--text" type="button" @click="removePlan(editingPlanId)">Удалить</button>
        </div>
      </div>
    </section>

    <section class="col col-notes">
      <header class="col-header">
        <h3>To-Do и заметки</h3>
      </header>
      <div v-if="workspaceSaveError" class="workspace-save-error" role="alert">
        {{ workspaceSaveError }}
      </div>

      <div class="todo-book">
        <div class="todo-book-header">
          <h4>To-Do лист (к совещанию / на выполнение)</h4>
          <button
            class="todo-expand-btn"
            type="button"
            :aria-expanded="isTodoExpanded"
            :title="isTodoExpanded ? 'Свернуть' : 'Развернуть'"
            @click="toggleTodoExpanded"
          >
            <span
              class="todo-expand-icon"
              :class="{ 'todo-expand-icon--expanded': isTodoExpanded }"
              aria-hidden="true"
            >
              ›
            </span>
          </button>
        </div>
        <div v-show="isTodoExpanded" class="todo-create-grid">
          <input
            v-model.trim="newTodoTitle"
            type="text"
            class="input-text"
            placeholder="Название заметки (например: Совещание с командой)"
          >
          <div class="todo-points-editor">
            <div v-for="(point, idx) in newTodoPoints" :key="point.id" class="todo-point-edit-row">
              <input
                v-model.trim="point.text"
                type="text"
                class="input-text todo-point-input"
                placeholder="Пункт списка"
                :data-point-id="point.id"
                data-todo-scope="new"
                @keyup.enter="addNewTodoPoint(idx)"
              >
              <input
                v-model.trim="point.linkUrl"
                type="url"
                class="input-text todo-point-link-input"
                placeholder="Ссылка"
              >
              <button class="btn-mini" type="button" @click="removeNewTodoPoint(point.id)">✕</button>
            </div>
            <button class="btn-mini todo-point-add-btn" type="button" @click="addNewTodoPoint()">+ Пункт</button>
          </div>
          <button class="btn-add todo-add-btn" type="button" @click="addTodoEntry">Добавить To-Do</button>
        </div>

        <div v-show="isTodoExpanded" class="todo-list expanded">
          <div v-if="todoNotebook.length === 0" class="muted">Пока нет заметок To-Do.</div>
          <div v-for="entry in todoNotebook" :key="entry.id" class="todo-item">
            <template v-if="editingTodoId === entry.id">
              <div class="todo-edit-grid">
                <input v-model.trim="editTodoDraft.title" type="text" class="input-text" placeholder="Название">
                <div class="todo-points-editor">
                  <div v-for="(point, idx) in editTodoDraft.points" :key="point.id" class="todo-point-edit-row">
                    <input
                      v-model.trim="point.text"
                      type="text"
                      class="input-text todo-point-input"
                      placeholder="Пункт списка"
                      :data-point-id="point.id"
                      data-todo-scope="edit"
                      @keyup.enter="addEditTodoPoint(idx)"
                    >
                    <input
                      v-model.trim="point.linkUrl"
                      type="url"
                      class="input-text todo-point-link-input"
                      placeholder="Ссылка"
                    >
                    <button class="btn-mini" type="button" @click="removeEditTodoPoint(point.id)">✕</button>
                  </div>
                  <button class="btn-mini todo-point-add-btn" type="button" @click="addEditTodoPoint()">+ Пункт</button>
                </div>
              </div>
              <div class="todo-actions">
                <button class="btn-mini btn-save" type="button" @click="saveEditTodo">Сохранить</button>
                <button class="btn-mini" type="button" @click="cancelEditTodo">Отмена</button>
              </div>
            </template>
            <template v-else>
              <div class="todo-title" title="Дважды — редактировать всю заметку (название и пункты)" @dblclick="startEditTodo(entry)">{{ entry.title }}</div>
              <ul class="todo-points">
                <li v-for="point in entry.points" :key="point.id" :class="{ done: point.done }">
                  <div class="todo-point-line">
                    <input
                      type="checkbox"
                      class="todo-point-check"
                      :checked="Boolean(point.done)"
                      @change="toggleTodoPoint(entry.id, point.id)"
                    >
                    <button
                      v-if="point.linkUrl"
                      type="button"
                      class="todo-point-link-btn"
                      title="Открыть ссылку"
                      @click.stop.prevent="openTodoPointLink(point.linkUrl)"
                    >
                      <img :src="linkIcon" alt="" class="todo-point-link-icon">
                    </button>
                    <span v-else class="todo-point-link-placeholder" aria-hidden="true" />
                    <input
                      v-if="isInlineTodoEdit(entry.id, point.id)"
                      v-model.trim="inlineTodoText"
                      type="text"
                      class="todo-point-input todo-point-inline-input"
                      @blur="commitInlineTodoPoint"
                      @keydown.enter.prevent="commitInlineTodoPoint"
                      @keydown.esc.prevent="cancelInlineTodoPoint"
                    >
                    <span
                      v-else
                      class="todo-point-text"
                      title="Дважды — изменить эту строку"
                      @dblclick.prevent="startInlineEditTodoPoint(entry, point)"
                    >{{ point.text }}</span>
                    <button
                      class="btn-del todo-point-remove-btn"
                      type="button"
                      title="Удалить пункт"
                      @click.stop.prevent="removeTodoPoint(entry.id, point.id)"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              </ul>
              <div class="todo-item-foot">
                <button
                  class="btn-mini todo-action-add-btn"
                  type="button"
                  title="Быстро добавить пункт в этот список"
                  @click="quickAddTodoPoint(entry.id)"
                >
                  + Пункт
                </button>
                <div class="todo-actions todo-actions--after-quick-add">
                  <button class="btn-edit" type="button" @click="startEditTodo(entry)" title="Редактировать заметку">
                    <svg class="btn-edit-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4.2 19.8l2.5-6.1L16.4 4l3.6 3.6-9.7 9.7-6.1 2.5z" fill="#4ea3e1" />
                      <path d="M15.8 4.6l1.9-1.9a1.8 1.8 0 0 1 2.6 0l1 1a1.8 1.8 0 0 1 0 2.6l-1.9 1.9-3.6-3.6z" fill="#2f5bd1" />
                      <path d="M17.6 3.8l2.6 2.6-1.8 1.8-2.6-2.6 1.8-1.8z" fill="#d5dbe5" />
                    </svg>
                  </button>
                  <button class="btn-del" type="button" @click="removeTodoEntry(entry.id)">✕</button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <textarea
        v-model="notes"
        class="notes-area"
        placeholder="Пиши любые заметки здесь. Текст сохраняется автоматически..."
      />
    </section>

    <section class="col col-widgets" :class="{ collapsed: isWidgetsCollapsed }">
      <button
        type="button"
        class="edge-hide-btn edge-hide-btn-widgets"
        @click="toggleWidgetsColumn"
        title="Скрыть колонку Виджеты"
      >
        ▸
      </button>

      <div class="widget">
        <div class="widget-title">Часы</div>
        <div class="clock">{{ nowTimeLabel }}</div>
      </div>

      <div class="widget">
        <div class="widget-title">Календарь</div>
        <div class="calendar-head">
          <button class="calendar-nav-btn" type="button" @click="shiftCalendarMonth(-1)">‹</button>
          <div class="calendar-title">{{ calendarTitle }}</div>
          <button class="calendar-nav-btn" type="button" @click="shiftCalendarMonth(1)">›</button>
        </div>
        <button class="calendar-today-btn" type="button" @click="jumpToCurrentMonth">Текущий месяц</button>
        <div class="calendar-grid calendar-weekdays">
          <span v-for="w in weekDayLabels" :key="w">{{ w }}</span>
        </div>
        <div class="calendar-grid calendar-days">
          <span
            v-for="cell in calendarCells"
            :key="cell.key"
            class="calendar-day"
            :class="{
              empty: !cell.inMonth,
              weekend: cell.isWeekend && cell.inMonth,
              holiday: cell.isHoliday && cell.inMonth,
              today: cell.isToday,
              'has-task': cell.hasTask,
              'calendar-day--clickable': cell.inMonth,
              selected: cell.inMonth && cell.key === dateKey
            }"
            :title="cell.holidayLabel || (cell.inMonth ? 'Показать план на этот день' : '')"
            role="button"
            :tabindex="cell.inMonth ? 0 : -1"
            @click="onCalendarDayClick(cell)"
            @keydown.enter.prevent="onCalendarDayClick(cell)"
            @keydown.space.prevent="onCalendarDayClick(cell)"
            @mouseenter="onCalendarDayEnter($event, cell)"
            @mousemove="onCalendarDayMove($event)"
            @mouseleave="onCalendarDayLeave"
          >
            {{ cell.label }}
          </span>
        </div>
      </div>

      <div class="widget">
        <div class="widget-title">Помидоро</div>
        <div class="pomodoro-time">{{ pomodoroLabel }}</div>
        <div class="pomodoro-controls">
          <button class="btn-small" type="button" @click="togglePomodoro">
            {{ pomodoroRunning ? 'Пауза' : 'Старт' }}
          </button>
          <button class="btn-small btn-ghost" type="button" @click="resetPomodoro">Сброс</button>
        </div>
      </div>

      <div class="widget widget-fx-split">
        <div class="fx-panel">
          <div class="weather-head">
            <div class="widget-title">Погода</div>
            <button class="weather-refresh" type="button" @click="loadWeather" :disabled="weatherLoading">
              ↻
            </button>
          </div>
          <div v-if="weatherLoading" class="muted">Загружаю погоду...</div>
          <div v-else-if="weatherError" class="muted">{{ weatherError }}</div>
          <div v-else class="weather-body">
            <div class="weather-main">
              <span class="weather-icon">{{ weatherIcon }}</span>
              <span class="weather-temp">{{ weatherTempLabel }}</span>
            </div>
            <div class="weather-desc">{{ weatherDescription }}</div>
            <div class="weather-meta">
              <span>{{ weatherLocation }}</span>
              <span>Ощущается: {{ weatherFeelsLikeLabel }}</span>
              <span>Влажность: {{ weatherHumidityLabel }}</span>
              <span>Ветер: {{ weatherWindLabel }}</span>
            </div>
          </div>
        </div>
        <div class="fx-panel">
          <div class="weather-head">
            <div class="widget-title">Курс валют</div>
            <button class="weather-refresh" type="button" @click="loadFxRates" :disabled="fxLoading">
              ↻
            </button>
          </div>
          <div v-if="fxLoading" class="muted">Загружаю курсы...</div>
          <div v-else-if="fxError" class="muted">{{ fxError }}</div>
          <div v-else class="fx-body">
            <div class="fx-row">
              <span class="fx-code">USD</span>
              <span class="fx-value">{{ fxRubLabel.usd }}</span>
            </div>
            <div class="fx-row">
              <span class="fx-code">EUR</span>
              <span class="fx-value">{{ fxRubLabel.eur }}</span>
            </div>
            <div class="fx-row">
              <span class="fx-code">CNY</span>
              <span class="fx-value">{{ fxRubLabel.cny }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="widget">
        <div class="widget-title">Радиостанция</div>
        <div class="radio-controls">
          <select v-model="selectedRadioUrl" class="input-select radio-select" @change="onRadioStationChange">
            <option v-for="station in RADIO_STATIONS" :key="station.name" :value="station.url">
              {{ station.name }}
            </option>
          </select>
          <button class="btn-small" type="button" @click="toggleRadioPlayback">
            {{ radioPlaying ? 'Пауза' : 'Старт' }}
          </button>
        </div>
        <div class="radio-volume-row">
          <span class="muted">Громкость</span>
          <input
            v-model.number="radioVolume"
            class="radio-volume"
            type="range"
            min="0"
            max="100"
            step="1"
            @input="onRadioVolumeChange"
          >
          <span class="muted">{{ radioVolume }}%</span>
        </div>
        <div v-if="radioError" class="muted">{{ radioError }}</div>
      </div>

      <div class="widget placeholder">
        <div class="widget-title">Трекер привычек</div>
        <div class="muted">Подключим на следующем шаге.</div>
      </div>
    </section>

    <div
      v-if="calendarTooltip"
      class="calendar-tooltip"
      :style="{ left: `${calendarTooltip.x}px`, top: `${calendarTooltip.y}px` }"
    >
      <div class="calendar-tooltip-title">{{ calendarTooltip.title }}</div>
      <div
        v-for="item in calendarTooltip.items"
        :key="item.id"
        class="calendar-tooltip-item"
      >
        <span class="calendar-tooltip-time">{{ item.time }}</span>
        <span class="calendar-tooltip-text">{{ item.text }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
defineOptions({ name: 'WorkspaceView' })
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import axios from 'axios'
import { useAuth } from '@/composables/useAuth'
import {
  DEFAULT_RADIO_URL,
  RADIO_STATIONS,
  SHARED_RADIO_PLAYER_KEY,
  normalizeSharedRadioPlayer
} from '@/constants/radioStations'
import linkIcon from '@/assets/link-icon.png'

// Персональный workspace: планы дня/завтра, заметки и To-Do notebook пользователя.
const START_HOUR = 6
const END_HOUR = 23
const SLOT_HEIGHT = 36
const SLOT_CENTER_OFFSET = SLOT_HEIGHT / 2
const LEGACY_NOTES_KEY = 'workspace-notes-by-date-v1'
const LEGACY_PLANS_KEY = 'workspace-plans-by-date-v1'
const LEGACY_NOTES_KEY_V2_BASE = 'workspace-notes-global-v2'
const LEGACY_TASKS_KEY_V2_BASE = 'workspace-tasks-v2'
const TODO_DRAFT_KEY_BASE = 'workspace-todo-draft-v1'
const POMODORO_SECONDS = 25 * 60
const { loginUsername, API_URL } = useAuth()

const now = ref(new Date())
const calendarCursor = ref(new Date(now.value.getFullYear(), now.value.getMonth(), 1))
const notes = ref('')
const tasks = ref([])
const todoNotebook = ref([])
const newPlanTime = ref('09:00')
const newPlanDate = ref('')
const newPlanRecurrence = ref('none')
const newPlanWeekdays = ref([])
const newPlanText = ref('')
const newTodoTitle = ref('')
const createTodoDraftPoint = (text = '', linkUrl = '') => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  text: String(text || ''),
  linkUrl: String(linkUrl || '')
})
const newTodoPoints = ref([createTodoDraftPoint('')])
const addInfo = ref('')
const editingPlanId = ref(null)
const editingTodoId = ref(null)
/** Редактирование одной строки списка: { entryId, pointId } */
const inlineTodoEdit = ref(null)
const inlineTodoText = ref('')
const isTodoExpanded = ref(true)
const editPlanDraft = ref({
  time: '09:00',
  startDate: '',
  recurrence: 'none',
  recurrenceWeekdays: [],
  text: ''
})
const editTodoDraft = ref({
  title: '',
  points: [createTodoDraftPoint('')]
})
const pomodoroSeconds = ref(POMODORO_SECONDS)
const pomodoroRunning = ref(false)
const timelineRef = ref(null)
const draggingPlanId = ref(null)
const dragPlanOffsetY = ref(0)
const calendarTooltip = ref(null)
const weatherLoading = ref(true)
const weatherError = ref('')
const weatherTemp = ref(null)
const weatherFeelsLike = ref(null)
const weatherHumidity = ref(null)
const weatherWind = ref(null)
const weatherDescription = ref('')
const weatherIcon = ref('🌤️')
const weatherLocation = ref('')
const selectedRadioUrl = ref(DEFAULT_RADIO_URL)
const radioPlaying = ref(false)
const radioError = ref('')
const radioVolume = ref(35)
const fxLoading = ref(true)
const fxError = ref('')
const fxRub = ref({
  usd: null,
  eur: null,
  cny: null
})
const fxSource = ref('')
const isDayCollapsed = ref(false)
const isWidgetsCollapsed = ref(false)

let clockTimer = null
let planReminderVisibilityHandler = null
let pomodoroTimer = null
let dragMoveHandler = null
let dragUpHandler = null
let saveWorkspaceTimer = null
let todoDraftTimer = null
let workspaceLoadGeneration = 0
let workspaceDirtyDuringLoad = false
let workspaceBeforeUnloadHandler = null
let weatherTimer = null
let fxTimer = null
let radioPlayHandler = null
let radioPauseHandler = null
let radioErrorHandler = null
let radioWaitingHandler = null

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

const workspaceGridStyle = computed(() => {
  if (isDayCollapsed.value && isWidgetsCollapsed.value) {
    return { gridTemplateColumns: '0 minmax(680px, 1fr) 0' }
  }
  if (isDayCollapsed.value) {
    return { gridTemplateColumns: '0 minmax(500px, 1fr) minmax(140px, 0.55fr)' }
  }
  if (isWidgetsCollapsed.value) {
    return { gridTemplateColumns: 'minmax(160px, 0.58fr) minmax(560px, 2fr) 0' }
  }
  return {
    gridTemplateColumns: 'minmax(160px, 0.58fr) minmax(520px, 2fr) minmax(140px, 0.55fr)'
  }
})

const storageUserSuffix = computed(() => {
  const raw = String(loginUsername.value || '').trim().toLowerCase()
  return raw || 'anonymous'
})
const todoDraftStorageKey = computed(() => `${TODO_DRAFT_KEY_BASE}:${storageUserSuffix.value}`)
const workspaceLoaded = ref(false)
const workspaceSaveError = ref('')

const formatDateKey = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const todayDateKey = computed(() => {
  const d = now.value
  return formatDateKey(d)
})

const dateKey = ref(todayDateKey.value)

const selectedDate = computed(() => parseDateKey(dateKey.value) || new Date())

const isTodayView = computed(() => dateKey.value === todayDateKey.value)

const isTomorrowView = computed(() => {
  const t = parseDateKey(todayDateKey.value)
  if (!t) return false
  t.setDate(t.getDate() + 1)
  return dateKey.value === formatDateKey(t)
})

/** Заголовок левой колонки: сегодня / завтра / день недели для произвольной даты. */
const dayColumnHeading = computed(() => {
  if (isTodayView.value) return 'Сегодня'
  if (isTomorrowView.value) return 'Завтра'
  const w = selectedDate.value.toLocaleDateString('ru-RU', { weekday: 'long' })
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : 'День'
})

const todayLabel = computed(() =>
  selectedDate.value.toLocaleDateString('ru-RU', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
)

const nowTimeLabel = computed(() =>
  now.value.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
)

const hourSlots = computed(() => {
  const out = []
  for (let h = START_HOUR; h <= END_HOUR; h += 1) {
    out.push({ hour: h, label: `${String(h).padStart(2, '0')}:00` })
  }
  return out
})

const weekDayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const VALID_TASK_RECURRENCES = ['none', 'daily', 'weekdays', 'monthly', 'custom_days']
const weekdayRecurrenceOptions = weekDayLabels.map((label, value) => ({ value, label }))

const normalizeWeekdays = (raw) => {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort(
    (a, b) => a - b
  )
}

const RU_FIXED_HOLIDAYS = {
  '01-01': 'Новогодние каникулы',
  '01-02': 'Новогодние каникулы',
  '01-03': 'Новогодние каникулы',
  '01-04': 'Новогодние каникулы',
  '01-05': 'Новогодние каникулы',
  '01-06': 'Новогодние каникулы',
  '01-07': 'Рождество Христово',
  '01-08': 'Новогодние каникулы',
  '02-23': 'День защитника Отечества',
  '03-08': 'Международный женский день',
  '05-01': 'Праздник Весны и Труда',
  '05-09': 'День Победы',
  '06-12': 'День России',
  '11-04': 'День народного единства'
}

const getRuHolidayLabel = (date) => {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const key = `${mm}-${dd}`
  return RU_FIXED_HOLIDAYS[key] || ''
}

const calendarTitle = computed(() =>
  calendarCursor.value.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
)

const singleTaskDateSet = computed(() => {
  const out = new Set()
  for (const task of tasks.value) {
    if ((task?.recurrence || 'none') !== 'none') continue
    const key = String(task?.startDate || '').trim()
    if (key) out.add(key)
  }
  return out
})

const calendarCells = computed(() => {
  const cursor = calendarCursor.value
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startOffset = (firstDay.getDay() + 6) % 7 // Monday-first
  const today = now.value
  const todayKey = formatDateKey(today)
  const cells = []

  for (let i = 0; i < startOffset; i += 1) {
    cells.push({
      key: `pad-start-${i}`,
      inMonth: false,
      isWeekend: false,
      isHoliday: false,
      holidayLabel: '',
      isToday: false,
      hasTask: false,
      label: ''
    })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day)
    const weekDay = (date.getDay() + 6) % 7
    const key = formatDateKey(date)
    const holidayLabel = getRuHolidayLabel(date)
    cells.push({
      key,
      inMonth: true,
      isWeekend: weekDay >= 5,
      isHoliday: Boolean(holidayLabel),
      holidayLabel,
      isToday: key === todayKey,
      hasTask: singleTaskDateSet.value.has(key),
      label: String(day)
    })
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      key: `pad-end-${cells.length}`,
      inMonth: false,
      isWeekend: false,
      isHoliday: false,
      holidayLabel: '',
      isToday: false,
      hasTask: false,
      label: ''
    })
  }

  return cells
})

const shiftCalendarMonth = (delta) => {
  const base = calendarCursor.value
  calendarCursor.value = new Date(base.getFullYear(), base.getMonth() + delta, 1)
}

const jumpToCurrentMonth = () => {
  calendarCursor.value = new Date(now.value.getFullYear(), now.value.getMonth(), 1)
}

const goToToday = () => {
  dateKey.value = todayDateKey.value
  const d = parseDateKey(dateKey.value)
  if (d) calendarCursor.value = new Date(d.getFullYear(), d.getMonth(), 1)
}

const goToTomorrow = () => {
  const d = parseDateKey(todayDateKey.value) || new Date()
  d.setDate(d.getDate() + 1)
  dateKey.value = formatDateKey(d)
  calendarCursor.value = new Date(d.getFullYear(), d.getMonth(), 1)
}

/** Клик по дню в виджете календаря — тот же день в левой колонке (план дня). */
const onCalendarDayClick = (cell) => {
  if (!cell?.inMonth) return
  const key = String(cell.key || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return
  dateKey.value = key
  const d = parseDateKey(key)
  if (d) calendarCursor.value = new Date(d.getFullYear(), d.getMonth(), 1)
  calendarTooltip.value = null
}

const timelineHeight = computed(() => (END_HOUR - START_HOUR + 1) * SLOT_HEIGHT)

const timeToMinutes = (timeStr) => {
  const [hRaw, mRaw] = String(timeStr || '').split(':')
  const h = Number(hRaw)
  const m = Number(mRaw)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return START_HOUR * 60
  return h * 60 + m
}

const planTop = (timeStr) => {
  const totalMin = timeToMinutes(timeStr)
  const startMin = START_HOUR * 60
  const endMin = END_HOUR * 60
  const clamped = Math.max(startMin, Math.min(endMin, totalMin))
  return ((clamped - startMin) / 60) * SLOT_HEIGHT + SLOT_CENTER_OFFSET
}

const topToTime = (topPx) => {
  const startMin = START_HOUR * 60
  const endMin = END_HOUR * 60
  const minutesRaw = startMin + ((topPx - SLOT_CENTER_OFFSET) / SLOT_HEIGHT) * 60
  const snapped = Math.round(minutesRaw / 5) * 5
  const clamped = Math.max(startMin, Math.min(endMin, snapped))
  const hh = Math.floor(clamped / 60)
  const mm = clamped % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

const nowLineTop = computed(() => {
  const totalMin = now.value.getHours() * 60 + now.value.getMinutes()
  const startMin = START_HOUR * 60
  const endMin = END_HOUR * 60
  const clamped = Math.max(startMin, Math.min(endMin, totalMin))
  return ((clamped - startMin) / 60) * SLOT_HEIGHT + SLOT_CENTER_OFFSET
})

function parseDateKey(key) {
  const [yRaw, mRaw, dRaw] = String(key || '').split('-')
  const y = Number(yRaw)
  const m = Number(mRaw)
  const d = Number(dRaw)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  return new Date(y, m - 1, d)
}

const recurrenceLabel = (recurrence, weekdays = []) => {
  if (recurrence === 'daily') return 'ежедн.'
  if (recurrence === 'weekdays') return 'будни'
  if (recurrence === 'monthly') return 'ежемес.'
  if (recurrence === 'custom_days') {
    const w = normalizeWeekdays(weekdays)
    if (!w.length) return 'дни'
    return w.map((d) => weekDayLabels[d] || '').filter(Boolean).join(', ')
  }
  return ''
}

const isTaskDueOnDate = (task, targetDateKey) => {
  const taskDate = String(task?.startDate || '')
  if (!taskDate) return false
  if ((task?.recurrence || 'none') === 'none') return taskDate === targetDateKey
  const targetDate = parseDateKey(targetDateKey)
  const startDate = parseDateKey(taskDate)
  if (!targetDate || !startDate) return false
  if (targetDate.getTime() < startDate.getTime()) return false
  if (task.recurrence === 'daily') return true
  if (task.recurrence === 'weekdays') {
    const weekDayMondayFirst = (targetDate.getDay() + 6) % 7
    return weekDayMondayFirst >= 0 && weekDayMondayFirst <= 4
  }
  if (task.recurrence === 'custom_days') {
    const w = normalizeWeekdays(task.recurrenceWeekdays)
    if (!w.length) return false
    const set = new Set(w)
    const weekDayMondayFirst = (targetDate.getDay() + 6) % 7
    return set.has(weekDayMondayFirst)
  }
  if (task.recurrence === 'monthly') {
    const startDay = startDate.getDate()
    const daysInTargetMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate()
    const dueDay = Math.min(startDay, daysInTargetMonth)
    return targetDate.getDate() === dueDay
  }
  return false
}

const sortedPlans = computed(() =>
  tasks.value
    .filter((task) => isTaskDueOnDate(task, dateKey.value))
    .map((task) => ({
      id: task.id,
      time: task.time,
      startDate: task.startDate,
      text: task.text,
      recurrence: task.recurrence || 'none',
      recurrenceWeekdays:
        task.recurrence === 'custom_days' && Array.isArray(task.recurrenceWeekdays)
          ? normalizeWeekdays(task.recurrenceWeekdays)
          : [],
      done: Boolean(task.doneByDate?.[dateKey.value]),
      overdue: false
    }))
    .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))
)

/** Напоминание один раз, когда до начала остаётся не больше 10 мин (календарный «сегодня»). */
const PLAN_REMINDER_LEAD_MAX_MS = 10 * 60 * 1000
/** Время показа всплывающего напоминания до автозакрытия. */
const PLAN_REMINDER_TOAST_MS = 45 * 1000
/** Заголовок всплывашки, системного уведомления и заголовка вкладки (краткий fallback). */
const PLAN_REMINDER_HEADING = 'Скоро нужно сделать задачу:'
const LS_PLAN_REM_PREFIX = 'putWsPlanRemV1'
const planReminderToasts = ref([])
const pulsingPlanDotIds = ref([])
let lastPlannerReminderSweep = 0
let titleFlashTimer = null
let titleFlashBase = ''

const plannerReminderHint = computed(() => {
  if (typeof Notification === 'undefined') {
    return 'Напоминание, когда до задачи осталось не больше 10 мин: звук и подсказка в этой вкладке'
  }
  if (Notification.permission === 'granted') {
    return 'Уведомления ОС включены. Нажмите для проверки звука. Напоминание — когда до задачи на сегодня остаётся ≤10 мин.'
  }
  if (Notification.permission === 'denied') {
    return 'Уведомления ОС запрещены — останутся звук, всплывашка и мигание заголовка вкладки. Нажмите для звука.'
  }
  return 'Нажмите: разрешить уведомления браузера и звук (напоминание при остатке ≤10 мин до задачи, в т.ч. с других вкладок).'
})

const reminderStorageKey = (planId, dayKey) =>
  `${LS_PLAN_REM_PREFIX}:${storageUserSuffix.value}:${dayKey}:${String(planId)}`

const planStartTimestamp = (dayKey, timeStr) => {
  const base = parseDateKey(dayKey)
  if (!base) return null
  const [hh, mm] = String(timeStr || '09:00').split(':')
  const h = Number(hh)
  const m = Number(mm)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0)
  return d.getTime()
}

const tryClaimPlanReminder = (planId, dayKey) => {
  try {
    const k = reminderStorageKey(planId, dayKey)
    if (localStorage.getItem(k)) return false
    localStorage.setItem(k, String(Date.now()))
    return true
  } catch {
    try {
      const sk = `${LS_PLAN_REM_PREFIX}:sess:${storageUserSuffix.value}:${dayKey}:${String(planId)}`
      if (sessionStorage.getItem(sk)) return false
      sessionStorage.setItem(sk, '1')
      return true
    } catch {
      return false
    }
  }
}

const playReminderChime = () => {
  if (typeof window === 'undefined') return
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.42, ctx.currentTime)
    master.connect(ctx.destination)

    const beep = (start, freq, len, vol) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.setValueAtTime(freq, start)
      g.gain.setValueAtTime(0.001, start)
      g.gain.linearRampToValueAtTime(vol, start + 0.025)
      g.gain.exponentialRampToValueAtTime(0.001, start + len)
      o.connect(g)
      g.connect(master)
      o.start(start)
      o.stop(start + len + 0.02)
    }

    const t0 = ctx.currentTime + 0.02
    beep(t0, 880, 0.38, 0.55)
    beep(t0 + 0.48, 880, 0.38, 0.55)
    beep(t0 + 0.96, 1046, 0.52, 0.62)

    const totalMs = 1800
    setTimeout(() => {
      try {
        ctx.close()
      } catch {
        /* ignore */
      }
    }, totalMs)
  } catch {
    /* autoplay / AudioContext */
  }
}

const stopTitleFlash = () => {
  if (titleFlashTimer) {
    clearInterval(titleFlashTimer)
    titleFlashTimer = null
  }
  if (typeof document !== 'undefined' && titleFlashBase) {
    document.title = titleFlashBase
    titleFlashBase = ''
  }
}

const startTitleFlash = (hint) => {
  if (typeof document === 'undefined') return
  stopTitleFlash()
  titleFlashBase = document.title
  const short = String(hint || PLAN_REMINDER_HEADING).slice(0, 48)
  let flip = false
  titleFlashTimer = setInterval(() => {
    flip = !flip
    document.title = flip ? `🔔 ${short}` : titleFlashBase
  }, 1000)
  setTimeout(() => stopTitleFlash(), 120000)
}

const dismissPlanReminder = (key) => {
  planReminderToasts.value = planReminderToasts.value.filter((t) => t.key !== key)
}

const pulsePlanDot = (planId, ms) => {
  const id = String(planId)
  if (!pulsingPlanDotIds.value.includes(id)) {
    pulsingPlanDotIds.value = [...pulsingPlanDotIds.value, id]
  }
  setTimeout(() => {
    pulsingPlanDotIds.value = pulsingPlanDotIds.value.filter((x) => x !== id)
  }, ms)
}

const firePlanReminderNotify = (plan, dayKey, leadMinutes) => {
  if (!tryClaimPlanReminder(plan.id, dayKey)) return
  const text = String(plan.text || 'Без названия').trim() || 'Без названия'
  const time = String(plan.time || '09:00')
  const lead = Number.isFinite(Number(leadMinutes)) ? Math.max(1, Math.round(Number(leadMinutes))) : 10
  const key = `${dayKey}::${plan.id}::${Date.now()}`
  planReminderToasts.value = [{ key, id: plan.id, time, text, lead }, ...planReminderToasts.value].slice(0, 5)
  setTimeout(() => dismissPlanReminder(key), PLAN_REMINDER_TOAST_MS)

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(PLAN_REMINDER_HEADING, {
        body: `Около ${lead} мин до начала · ${time} — ${text}`,
        tag: `workspace-plan-${dayKey}-${plan.id}`,
        requireInteraction: false
      })
    } catch {
      /* ignore */
    }
  }

  playReminderChime()
  pulsePlanDot(plan.id, 120000)

  if (typeof document !== 'undefined' && document.hidden) {
    startTitleFlash(text)
  }
}

const sweepUpcomingPlanReminders = () => {
  if (!workspaceLoaded.value) return
  const dayKey = todayDateKey.value
  const nowMs = Date.now()
  if (nowMs - lastPlannerReminderSweep < 1000) return
  lastPlannerReminderSweep = nowMs

  for (const task of tasks.value) {
    if (!isTaskDueOnDate(task, dayKey)) continue
    if (Boolean(task.doneByDate?.[dayKey])) continue
    const startTs = planStartTimestamp(dayKey, task.time)
    if (!startTs) continue
    const msUntil = startTs - nowMs
    if (msUntil <= 0 || msUntil > PLAN_REMINDER_LEAD_MAX_MS) continue
    const leadMin = Math.max(1, Math.ceil(msUntil / 60000))
    firePlanReminderNotify({ id: task.id, time: task.time, text: task.text }, dayKey, leadMin)
  }
}

const enableWorkspacePlanReminders = async () => {
  playReminderChime()
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    try {
      await Notification.requestPermission()
    } catch {
      /* ignore */
    }
  }
}

const getTasksForDate = (targetDateKey) =>
  tasks.value
    .filter((task) => isTaskDueOnDate(task, targetDateKey))
    .map((task) => ({
      id: task.id,
      time: task.time || '00:00',
      text: task.text || 'Без названия',
      recurrence: task.recurrence || 'none',
      recurrenceWeekdays:
        task.recurrence === 'custom_days' && Array.isArray(task.recurrenceWeekdays)
          ? normalizeWeekdays(task.recurrenceWeekdays)
          : [],
      done: Boolean(task.doneByDate?.[targetDateKey])
    }))
    .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))

const clearLegacyLocalWorkspace = () => {
  const suffix = storageUserSuffix.value
  localStorage.removeItem(LEGACY_NOTES_KEY)
  localStorage.removeItem(LEGACY_PLANS_KEY)
  localStorage.removeItem(`${LEGACY_NOTES_KEY_V2_BASE}:${suffix}`)
  localStorage.removeItem(`${LEGACY_TASKS_KEY_V2_BASE}:${suffix}`)
}

const normalizeTask = (task) => {
  let recurrence = VALID_TASK_RECURRENCES.includes(task?.recurrence) ? task.recurrence : 'none'
  let recurrenceWeekdays = normalizeWeekdays(task?.recurrenceWeekdays)
  if (recurrence === 'custom_days' && !recurrenceWeekdays.length) recurrence = 'none'
  if (recurrence !== 'custom_days') recurrenceWeekdays = []
  const base = {
    id: String(task?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    text: String(task?.text || ''),
    time: String(task?.time || '09:00'),
    startDate: String(task?.startDate || ''),
    recurrence,
    doneByDate: task?.doneByDate && typeof task.doneByDate === 'object' ? task.doneByDate : {}
  }
  if (recurrence === 'custom_days') return { ...base, recurrenceWeekdays }
  return base
}

const normalizeTodoPoint = (point) => {
  if (point && typeof point === 'object' && !Array.isArray(point)) {
    return {
      id: String(point.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      text: String(point.text || '').trim().slice(0, 220),
      done: Boolean(point.done),
      linkUrl: String(point.linkUrl || '').trim().slice(0, 400)
    }
  }
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: String(point || '').trim().slice(0, 220),
    done: false,
    linkUrl: ''
  }
}

const normalizeTodoEntry = (entry) => ({
  id: String(entry?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
  title: String(entry?.title || '').trim().slice(0, 140),
  points: Array.isArray(entry?.points)
    ? entry.points.map(normalizeTodoPoint).filter((point) => point.text).slice(0, 100)
    : []
})

const pointsDraftToItems = (draftPoints, previousPoints = []) => {
  const prevMap = new Map(
    (Array.isArray(previousPoints) ? previousPoints : [])
      .map((point) => normalizeTodoPoint(point))
      .map((point) => [String(point.id), point])
  )
  return (Array.isArray(draftPoints) ? draftPoints : [])
    .map((point) => ({
      id: String(point?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      text: String(point?.text || '').trim().slice(0, 220),
      linkUrl: String(point?.linkUrl || '').trim().slice(0, 400)
    }))
    .filter((point) => point.text)
    .map((point) => {
      const prev = prevMap.get(point.id)
      return {
        id: point.id,
        text: point.text,
        done: prev && prev.text === point.text && prev.linkUrl === point.linkUrl ? Boolean(prev.done) : false,
        linkUrl: point.linkUrl
      }
    })
    .slice(0, 100)
}

const normalizeTodoLinkUrl = (raw) => {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

const openTodoPointLink = (raw) => {
  const url = normalizeTodoLinkUrl(raw)
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

const buildWorkspacePayload = () => ({
  notes: String(notes.value || ''),
  tasks: Array.isArray(tasks.value) ? tasks.value.map(normalizeTask) : [],
  todoNotebook: Array.isArray(todoNotebook.value)
    ? todoNotebook.value.map(normalizeTodoEntry).filter((entry) => entry.title || entry.points.length)
    : []
})

const loadTodoDraft = () => {
  try {
    const raw = localStorage.getItem(todoDraftStorageKey.value)
    if (!raw) {
      newTodoTitle.value = ''
      newTodoPoints.value = [createTodoDraftPoint('')]
      return
    }
    const parsed = JSON.parse(raw)
    newTodoTitle.value = String(parsed?.title || '')
    const points = Array.isArray(parsed?.points) ? parsed.points : []
    newTodoPoints.value = points.length
      ? points.map((point) => createTodoDraftPoint(point?.text, point?.linkUrl))
      : [createTodoDraftPoint('')]
  } catch {
    newTodoTitle.value = ''
    newTodoPoints.value = [createTodoDraftPoint('')]
  }
}

const saveTodoDraft = () => {
  const title = String(newTodoTitle.value || '').trim()
  const points = (Array.isArray(newTodoPoints.value) ? newTodoPoints.value : [])
    .map((point) => ({
      text: String(point?.text || '').trim(),
      linkUrl: String(point?.linkUrl || '').trim()
    }))
    .filter((point) => point.text || point.linkUrl)
  if (!title && !points.length) {
    localStorage.removeItem(todoDraftStorageKey.value)
    return
  }
  localStorage.setItem(todoDraftStorageKey.value, JSON.stringify({
    title: newTodoTitle.value,
    points: Array.isArray(newTodoPoints.value) ? newTodoPoints.value : []
  }))
}

const clearTodoDraft = () => {
  localStorage.removeItem(todoDraftStorageKey.value)
  newTodoTitle.value = ''
  newTodoPoints.value = [createTodoDraftPoint('')]
}

const queueTodoDraftSave = () => {
  if (todoDraftTimer) clearTimeout(todoDraftTimer)
  todoDraftTimer = setTimeout(() => {
    todoDraftTimer = null
    saveTodoDraft()
  }, 300)
}

const flushWorkspaceSave = async () => {
  if (saveWorkspaceTimer) {
    clearTimeout(saveWorkspaceTimer)
    saveWorkspaceTimer = null
  }
  if (!workspaceLoaded.value) return
  await saveWorkspaceState()
}

const flushWorkspaceSaveKeepalive = () => {
  if (saveWorkspaceTimer) {
    clearTimeout(saveWorkspaceTimer)
    saveWorkspaceTimer = null
  }
  saveTodoDraft()
  if (!workspaceLoaded.value) return
  const token = localStorage.getItem('jwtToken')
  if (!token) return
  fetch(`${API_URL}/workspace-state`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(buildWorkspacePayload()),
    keepalive: true
  }).catch(() => {})
}

const loadWorkspaceState = async () => {
  const generation = ++workspaceLoadGeneration
  await flushWorkspaceSave()

  workspaceLoaded.value = false
  workspaceDirtyDuringLoad = false
  workspaceSaveError.value = ''
  try {
    const { data } = await axios.get(`${API_URL}/workspace-state`, { timeout: 20000 })
    if (generation !== workspaceLoadGeneration) return
    if (!workspaceDirtyDuringLoad) {
      notes.value = String(data?.notes || '')
      tasks.value = Array.isArray(data?.tasks) ? data.tasks.map(normalizeTask) : []
      todoNotebook.value = Array.isArray(data?.todoNotebook)
        ? data.todoNotebook.map(normalizeTodoEntry).filter((entry) => entry.title || entry.points.length)
        : []
    }
  } catch (e) {
    if (generation !== workspaceLoadGeneration) return
    workspaceSaveError.value = 'Не удалось загрузить рабочий стол'
  } finally {
    if (generation === workspaceLoadGeneration) {
      workspaceLoaded.value = true
      if (workspaceDirtyDuringLoad) {
        queueWorkspaceSave()
      }
    }
  }
}

const saveWorkspaceState = async () => {
  if (!workspaceLoaded.value) return
  workspaceSaveError.value = ''
  try {
    await axios.put(`${API_URL}/workspace-state`, buildWorkspacePayload(), { timeout: 20000 })
  } catch (e) {
    workspaceSaveError.value = 'Не удалось сохранить рабочий стол'
  }
}

const queueWorkspaceSave = () => {
  if (!workspaceLoaded.value) {
    workspaceDirtyDuringLoad = true
    return
  }
  if (saveWorkspaceTimer) clearTimeout(saveWorkspaceTimer)
  saveWorkspaceTimer = setTimeout(() => {
    saveWorkspaceTimer = null
    saveWorkspaceState()
  }, 450)
}

watch(notes, () => {
  queueWorkspaceSave()
})

watch(tasks, () => {
  queueWorkspaceSave()
}, { deep: true })

watch(todoNotebook, () => {
  queueWorkspaceSave()
}, { deep: true })

watch(newTodoTitle, () => {
  queueTodoDraftSave()
})

watch(newTodoPoints, () => {
  queueTodoDraftSave()
}, { deep: true })

watch(dateKey, () => {
  newPlanDate.value = dateKey.value
  addInfo.value = ''
  editingPlanId.value = null
})

watch(newPlanRecurrence, (v) => {
  if (v !== 'custom_days') newPlanWeekdays.value = []
})

watch(storageUserSuffix, async () => {
  await loadWorkspaceState()
  loadTodoDraft()
  editingPlanId.value = null
  editingTodoId.value = null
  inlineTodoEdit.value = null
  inlineTodoText.value = ''
  addInfo.value = ''
})

watch(now, () => {
  sweepUpcomingPlanReminders()
})

const addPlan = () => {
  const text = String(newPlanText.value || '').trim()
  if (!text) return
  const selectedDate = String(newPlanDate.value || dateKey.value)
  let recurrence = VALID_TASK_RECURRENCES.includes(newPlanRecurrence.value) ? newPlanRecurrence.value : 'none'
  let recurrenceWeekdays = normalizeWeekdays(newPlanWeekdays.value)
  if (recurrence === 'custom_days' && !recurrenceWeekdays.length) {
    addInfo.value = 'Выберите хотя бы один день недели для повтора.'
    return
  }
  if (recurrence !== 'custom_days') recurrenceWeekdays = []
  const payload = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: newPlanTime.value || '09:00',
    text,
    startDate: selectedDate,
    recurrence,
    doneByDate: {}
  }
  if (recurrence === 'custom_days') payload.recurrenceWeekdays = recurrenceWeekdays
  tasks.value.push(payload)
  newPlanText.value = ''
  addInfo.value = selectedDate === dateKey.value
    ? 'Задача добавлена на сегодня.'
    : `Задача запланирована на ${selectedDate}.`
}

const startEditPlan = (plan) => {
  const task = tasks.value.find((t) => t.id === plan.id) || {}
  const rec = VALID_TASK_RECURRENCES.includes(task.recurrence) ? task.recurrence : 'none'
  const wdays =
    rec === 'custom_days' && Array.isArray(task.recurrenceWeekdays)
      ? normalizeWeekdays(task.recurrenceWeekdays)
      : []
  editingPlanId.value = plan.id
  editPlanDraft.value = {
    time: String(plan.time || '09:00'),
    startDate: String(plan.startDate || dateKey.value),
    recurrence: rec,
    recurrenceWeekdays: wdays,
    text: String(plan.text || '')
  }
}

const cancelEditPlan = () => {
  editingPlanId.value = null
}

const saveEditPlan = () => {
  const id = editingPlanId.value
  if (!id) return
  const text = String(editPlanDraft.value.text || '').trim()
  if (!text) return
  let recurrence = VALID_TASK_RECURRENCES.includes(editPlanDraft.value.recurrence)
    ? editPlanDraft.value.recurrence
    : 'none'
  let recurrenceWeekdays = normalizeWeekdays(editPlanDraft.value.recurrenceWeekdays)
  if (recurrence === 'custom_days' && !recurrenceWeekdays.length) {
    addInfo.value = 'Выберите хотя бы один день недели для повтора.'
    return
  }
  if (recurrence !== 'custom_days') recurrenceWeekdays = []
  tasks.value = tasks.value.map((task) => {
    if (task.id !== id) return task
    const next = {
      ...task,
      time: String(editPlanDraft.value.time || '09:00'),
      startDate: String(editPlanDraft.value.startDate || dateKey.value),
      recurrence,
      text
    }
    if (recurrence === 'custom_days') next.recurrenceWeekdays = recurrenceWeekdays
    else delete next.recurrenceWeekdays
    return next
  })
  editingPlanId.value = null
}

const removePlan = (id) => {
  tasks.value = tasks.value.filter((x) => x.id !== id)
}

const toggleDone = (id) => {
  tasks.value = tasks.value.map((x) => {
    if (x.id !== id) return x
    const doneByDate = { ...(x.doneByDate || {}) }
    const cur = Boolean(doneByDate[dateKey.value])
    if (cur) delete doneByDate[dateKey.value]
    else doneByDate[dateKey.value] = true
    return { ...x, doneByDate }
  })
}

const toggleNewPlanWeekday = (wd) => {
  const cur = normalizeWeekdays(newPlanWeekdays.value)
  const set = new Set(cur)
  if (set.has(wd)) set.delete(wd)
  else set.add(wd)
  newPlanWeekdays.value = [...set].sort((a, b) => a - b)
}

const toggleEditPlanWeekday = (wd) => {
  const cur = normalizeWeekdays(editPlanDraft.value.recurrenceWeekdays)
  const set = new Set(cur)
  if (set.has(wd)) set.delete(wd)
  else set.add(wd)
  editPlanDraft.value = { ...editPlanDraft.value, recurrenceWeekdays: [...set].sort((a, b) => a - b) }
}

const isInlineTodoEdit = (entryId, pointId) =>
  inlineTodoEdit.value?.entryId === entryId && inlineTodoEdit.value?.pointId === pointId

const cancelInlineTodoPoint = () => {
  inlineTodoEdit.value = null
  inlineTodoText.value = ''
}

const startInlineEditTodoPoint = (entry, point) => {
  if (editingTodoId.value === entry.id) return
  inlineTodoEdit.value = { entryId: entry.id, pointId: point.id }
  inlineTodoText.value = String(point?.text || '')
  nextTick(() => {
    const input = document.querySelector('.todo-point-inline-input')
    if (input instanceof HTMLInputElement) {
      input.focus()
      input.select()
    }
  })
}

const commitInlineTodoPoint = () => {
  const target = inlineTodoEdit.value
  if (!target) return
  const { entryId, pointId } = target
  const text = String(inlineTodoText.value || '').trim()
  inlineTodoEdit.value = null
  inlineTodoText.value = ''
  if (!text) return
  todoNotebook.value = todoNotebook.value.map((entry) => {
    if (entry.id !== entryId) return entry
    const points = Array.isArray(entry.points) ? entry.points : []
    return {
      ...entry,
      points: points.map((p) => (p.id === pointId ? { ...p, text } : p))
    }
  })
}

const quickAddTodoPoint = (entryId) => {
  if (!entryId) return
  const createdPoint = normalizeTodoPoint(createTodoDraftPoint(''))
  let appended = false
  todoNotebook.value = todoNotebook.value.map((entry) => {
    if (entry.id !== entryId) return entry
    appended = true
    const points = Array.isArray(entry.points) ? entry.points : []
    return {
      ...entry,
      points: [...points, createdPoint]
    }
  })
  if (!appended) return
  inlineTodoEdit.value = { entryId, pointId: createdPoint.id }
  inlineTodoText.value = ''
  nextTick(() => {
    const input = document.querySelector('.todo-point-inline-input')
    if (input instanceof HTMLInputElement) {
      input.focus()
      input.select()
    }
  })
}

const addTodoEntry = () => {
  const title = String(newTodoTitle.value || '').trim()
  const points = pointsDraftToItems(newTodoPoints.value, [])
  if (!title && points.length === 0) return
  todoNotebook.value.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: title || 'Без названия',
    points
  })
  clearTodoDraft()
}

const startEditTodo = (entry) => {
  cancelInlineTodoPoint()
  editingTodoId.value = entry.id
  editTodoDraft.value = {
    title: String(entry?.title || ''),
    points: (Array.isArray(entry?.points) && entry.points.length
      ? entry.points.map((point) => ({
        id: String(point?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
        text: String(point?.text || ''),
        linkUrl: String(point?.linkUrl || '')
      }))
      : [createTodoDraftPoint('')])
  }
}

const cancelEditTodo = () => {
  editingTodoId.value = null
}

const saveEditTodo = () => {
  const id = editingTodoId.value
  if (!id) return
  const title = String(editTodoDraft.value.title || '').trim()
  todoNotebook.value = todoNotebook.value.map((entry) => {
    if (entry.id !== id) return entry
    const points = pointsDraftToItems(editTodoDraft.value.points, entry.points)
    if (!title && points.length === 0) return entry
    return {
      ...entry,
      title: title || 'Без названия',
      points
    }
  })
  editingTodoId.value = null
}

const focusTodoPointInput = (scope, pointId) => {
  if (!pointId) return
  nextTick(() => {
    const input = document.querySelector(`.todo-point-input[data-todo-scope="${scope}"][data-point-id="${pointId}"]`)
    if (input instanceof HTMLInputElement) {
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    }
  })
}

const addNewTodoPoint = (afterIdx = null) => {
  const next = [...newTodoPoints.value]
  const insertAt = Number.isInteger(afterIdx) ? Math.max(0, Math.min(next.length, afterIdx + 1)) : next.length
  const createdPoint = createTodoDraftPoint('')
  next.splice(insertAt, 0, createdPoint)
  newTodoPoints.value = next
  focusTodoPointInput('new', createdPoint.id)
}

const removeNewTodoPoint = (pointId) => {
  const next = newTodoPoints.value.filter((point) => point.id !== pointId)
  newTodoPoints.value = next.length ? next : [createTodoDraftPoint('')]
}

const addEditTodoPoint = (afterIdx = null) => {
  const current = Array.isArray(editTodoDraft.value.points) ? editTodoDraft.value.points : []
  const next = [...current]
  const insertAt = Number.isInteger(afterIdx) ? Math.max(0, Math.min(next.length, afterIdx + 1)) : next.length
  const createdPoint = createTodoDraftPoint('')
  next.splice(insertAt, 0, createdPoint)
  editTodoDraft.value = { ...editTodoDraft.value, points: next }
  focusTodoPointInput('edit', createdPoint.id)
}

const removeEditTodoPoint = (pointId) => {
  const current = Array.isArray(editTodoDraft.value.points) ? editTodoDraft.value.points : []
  const next = current.filter((point) => point.id !== pointId)
  editTodoDraft.value = {
    ...editTodoDraft.value,
    points: next.length ? next : [createTodoDraftPoint('')]
  }
}

const removeTodoEntry = (id) => {
  if (inlineTodoEdit.value?.entryId === id) cancelInlineTodoPoint()
  todoNotebook.value = todoNotebook.value.filter((entry) => entry.id !== id)
}

const toggleDayColumn = () => {
  isDayCollapsed.value = !isDayCollapsed.value
}

const toggleWidgetsColumn = () => {
  isWidgetsCollapsed.value = !isWidgetsCollapsed.value
}

const toggleTodoExpanded = () => {
  isTodoExpanded.value = !isTodoExpanded.value
}

const toggleTodoPoint = (entryId, pointId) => {
  todoNotebook.value = todoNotebook.value.map((entry) => {
    if (entry.id !== entryId) return entry
    const points = Array.isArray(entry.points) ? entry.points : []
    return {
      ...entry,
      points: points.map((point) => {
        if (point.id !== pointId) return point
        return { ...point, done: !Boolean(point.done) }
      })
    }
  })
}

const removeTodoPoint = (entryId, pointId) => {
  if (inlineTodoEdit.value?.entryId === entryId && inlineTodoEdit.value?.pointId === pointId) {
    cancelInlineTodoPoint()
  }
  todoNotebook.value = todoNotebook.value.map((entry) => {
    if (entry.id !== entryId) return entry
    const points = Array.isArray(entry.points) ? entry.points : []
    return {
      ...entry,
      points: points.filter((point) => point.id !== pointId)
    }
  })
}

const buildTooltipPosition = (e, maxWidth = 300, maxHeight = 260) => {
  const pad = 12
  let x = e.clientX + pad
  let y = e.clientY + pad
  if (x + maxWidth > window.innerWidth) x = Math.max(8, window.innerWidth - maxWidth - 8)
  if (y + maxHeight > window.innerHeight) y = Math.max(8, e.clientY - maxHeight)
  return { x, y }
}

const onCalendarDayEnter = (e, cell) => {
  if (!cell?.inMonth) return
  const items = getTasksForDate(cell.key)
  const holidayLabel = String(cell?.holidayLabel || '').trim()
  if (!items.length && !holidayLabel) {
    calendarTooltip.value = null
    return
  }
  const titleDate = parseDateKey(cell.key)
  const title = titleDate
    ? titleDate.toLocaleDateString('ru-RU', { weekday: 'long', day: '2-digit', month: 'long' })
    : cell.key
  const visibleTaskItems = items.slice(0, 8).map((item) => ({
    id: item.id,
    time: item.time,
    text: `${item.text}${item.recurrence !== 'none' ? ` (${recurrenceLabel(item.recurrence, item.recurrenceWeekdays)})` : ''}${item.done ? ' ✓' : ''}`
  }))
  const displayItems = [...visibleTaskItems]
  if (holidayLabel) {
    displayItems.unshift({
      id: `holiday-${cell.key}`,
      time: '🎉',
      text: holidayLabel
    })
  }
  const hiddenCount = items.length - visibleTaskItems.length
  if (hiddenCount > 0) {
    displayItems.push({
      id: `more-${cell.key}`,
      time: '…',
      text: `еще ${hiddenCount} задач`
    })
  }
  const pos = buildTooltipPosition(e)
  calendarTooltip.value = {
    x: pos.x,
    y: pos.y,
    title,
    items: displayItems
  }
}

const onCalendarDayMove = (e) => {
  if (!calendarTooltip.value) return
  const pos = buildTooltipPosition(e)
  calendarTooltip.value = { ...calendarTooltip.value, x: pos.x, y: pos.y }
}

const onCalendarDayLeave = () => {
  calendarTooltip.value = null
}

const updateTaskTimeById = (id, time) => {
  tasks.value = tasks.value.map((task) => (task.id === id ? { ...task, time } : task))
}

const stopPlanDrag = () => {
  draggingPlanId.value = null
  dragPlanOffsetY.value = 0
  if (dragMoveHandler) window.removeEventListener('mousemove', dragMoveHandler)
  if (dragUpHandler) window.removeEventListener('mouseup', dragUpHandler)
  dragMoveHandler = null
  dragUpHandler = null
}

const startPlanDrag = (event, plan) => {
  if (!timelineRef.value || !plan?.id) return
  const dotEl = event.currentTarget
  const dotRect = dotEl?.getBoundingClientRect?.()
  if (dotRect) {
    dragPlanOffsetY.value = event.clientY - dotRect.top
  } else {
    dragPlanOffsetY.value = 0
  }
  draggingPlanId.value = plan.id

  dragMoveHandler = (e) => {
    if (!timelineRef.value || draggingPlanId.value !== plan.id) return
    const rect = timelineRef.value.getBoundingClientRect()
    const relativeY = e.clientY - rect.top + timelineRef.value.scrollTop - dragPlanOffsetY.value
    const maxTop = timelineHeight.value
    const clampedTop = Math.max(0, Math.min(maxTop, relativeY))
    const nextTime = topToTime(clampedTop)
    updateTaskTimeById(plan.id, nextTime)
  }

  dragUpHandler = () => {
    stopPlanDrag()
  }

  window.addEventListener('mousemove', dragMoveHandler)
  window.addEventListener('mouseup', dragUpHandler)
}

const pomodoroLabel = computed(() => {
  const min = Math.floor(pomodoroSeconds.value / 60)
  const sec = pomodoroSeconds.value % 60
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
})

const togglePomodoro = () => {
  pomodoroRunning.value = !pomodoroRunning.value
}

const resetPomodoro = () => {
  pomodoroRunning.value = false
  pomodoroSeconds.value = POMODORO_SECONDS
}

const weatherCodeToUi = (code) => {
  const map = {
    0: { label: 'Ясно', icon: '☀️' },
    1: { label: 'Преимущественно ясно', icon: '🌤️' },
    2: { label: 'Переменная облачность', icon: '⛅' },
    3: { label: 'Пасмурно', icon: '☁️' },
    45: { label: 'Туман', icon: '🌫️' },
    48: { label: 'Изморозь', icon: '🌫️' },
    51: { label: 'Слабая морось', icon: '🌦️' },
    53: { label: 'Морось', icon: '🌦️' },
    55: { label: 'Сильная морось', icon: '🌧️' },
    61: { label: 'Небольшой дождь', icon: '🌦️' },
    63: { label: 'Дождь', icon: '🌧️' },
    65: { label: 'Сильный дождь', icon: '🌧️' },
    71: { label: 'Небольшой снег', icon: '🌨️' },
    73: { label: 'Снег', icon: '🌨️' },
    75: { label: 'Сильный снег', icon: '❄️' },
    77: { label: 'Снежные зерна', icon: '❄️' },
    80: { label: 'Ливень', icon: '🌧️' },
    81: { label: 'Сильный ливень', icon: '🌧️' },
    82: { label: 'Очень сильный ливень', icon: '⛈️' },
    85: { label: 'Снегопад', icon: '🌨️' },
    86: { label: 'Сильный снегопад', icon: '❄️' },
    95: { label: 'Гроза', icon: '⛈️' },
    96: { label: 'Гроза с градом', icon: '⛈️' },
    99: { label: 'Сильная гроза с градом', icon: '⛈️' }
  }
  return map[Number(code)] || { label: 'Нет данных', icon: '🌤️' }
}

const fetchWeatherByCoords = async (latitude, longitude, label) => {
  const { data } = await axios.get('https://api.open-meteo.com/v1/forecast', {
    params: {
      latitude,
      longitude,
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code',
      forecast_days: 1,
      timezone: 'auto'
    },
    timeout: 15000
  })
  const current = data?.current || {}
  const ui = weatherCodeToUi(current.weather_code)
  weatherTemp.value = Number.isFinite(Number(current.temperature_2m)) ? Number(current.temperature_2m) : null
  weatherFeelsLike.value = Number.isFinite(Number(current.apparent_temperature)) ? Number(current.apparent_temperature) : null
  weatherHumidity.value = Number.isFinite(Number(current.relative_humidity_2m)) ? Number(current.relative_humidity_2m) : null
  weatherWind.value = Number.isFinite(Number(current.wind_speed_10m)) ? Number(current.wind_speed_10m) : null
  weatherDescription.value = ui.label
  weatherIcon.value = ui.icon
  weatherLocation.value = label
}

const getBrowserCoords = () =>
  new Promise((resolve, reject) => {
    if (!navigator?.geolocation) {
      reject(new Error('No geolocation'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude
      }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 4500, maximumAge: 10 * 60 * 1000 }
    )
  })

const loadWeather = async () => {
  weatherLoading.value = true
  weatherError.value = ''
  try {
    try {
      const coords = await getBrowserCoords()
      await fetchWeatherByCoords(coords.latitude, coords.longitude, 'Ваша локация')
    } catch {
      await fetchWeatherByCoords(59.9386, 30.3141, 'Санкт-Петербург')
    }
  } catch {
    weatherError.value = 'Не удалось загрузить погоду'
  } finally {
    weatherLoading.value = false
  }
}

const weatherTempLabel = computed(() =>
  weatherTemp.value == null ? '—' : `${Math.round(weatherTemp.value)}°C`
)
const weatherFeelsLikeLabel = computed(() =>
  weatherFeelsLike.value == null ? '—' : `${Math.round(weatherFeelsLike.value)}°C`
)
const weatherHumidityLabel = computed(() =>
  weatherHumidity.value == null ? '—' : `${Math.round(weatherHumidity.value)}%`
)
const weatherWindLabel = computed(() =>
  weatherWind.value == null ? '—' : `${Math.round(weatherWind.value)} км/ч`
)

const formatRub = (value) => {
  if (!Number.isFinite(Number(value))) return '—'
  return `${Number(value).toFixed(2)} ₽`
}

const loadFxRates = async () => {
  fxLoading.value = true
  fxError.value = ''
  try {
    const { data } = await axios.get(`${API_URL}/fx-rates`, { timeout: 15000 })
    const rates = data?.rates || {}
    fxRub.value = {
      usd: Number.isFinite(Number(rates.USD)) ? Number(rates.USD) : null,
      eur: Number.isFinite(Number(rates.EUR)) ? Number(rates.EUR) : null,
      cny: Number.isFinite(Number(rates.CNY)) ? Number(rates.CNY) : null
    }
    const hasAny = Boolean(fxRub.value.usd || fxRub.value.eur || fxRub.value.cny)
    fxSource.value = String(data?.source || '').trim() || 'backend'
    if (!hasAny) fxError.value = 'Нет данных по курсам валют'
  } catch {
    fxError.value = 'Не удалось загрузить курсы валют'
    fxSource.value = ''
  } finally {
    fxLoading.value = false
  }
}

const fxRubLabel = computed(() => ({
  usd: formatRub(fxRub.value.usd),
  eur: formatRub(fxRub.value.eur),
  cny: formatRub(fxRub.value.cny)
}))

const fxSourceLabel = computed(() => fxSource.value || '—')

const syncRadioStateFromShared = () => {
  const shared = getSharedRadioPlayer()
  if (!shared) return
  selectedRadioUrl.value = normalizeSharedRadioPlayer(shared)
  if (Number.isFinite(Number(shared.volume))) {
    radioVolume.value = Math.max(0, Math.min(100, Number(shared.volume)))
  }
  radioPlaying.value = !shared.audio.paused && !shared.audio.ended
}

const onRadioVolumeChange = () => {
  const shared = getSharedRadioPlayer()
  if (!shared) return
  const normalized = Math.max(0, Math.min(100, Number(radioVolume.value) || 0))
  radioVolume.value = normalized
  shared.volume = normalized
  shared.audio.volume = normalized / 100
}

const onRadioStationChange = () => {
  radioError.value = ''
  const shared = getSharedRadioPlayer()
  if (!shared) return
  const nextUrl = String(selectedRadioUrl.value || '').trim()
  const wasPlaying = !shared.audio.paused && !shared.audio.ended
  shared.currentUrl = nextUrl
  if (!nextUrl) {
    shared.audio.pause()
    radioPlaying.value = false
    return
  }
  const currentSrc = String(shared.audio.src || '')
  if (!currentSrc.includes(nextUrl)) {
    shared.audio.src = nextUrl
  }
  if (wasPlaying) {
    shared.audio.play().then(() => {
      radioPlaying.value = true
    }).catch(() => {
      radioPlaying.value = false
      radioError.value = 'Не удалось запустить поток. Попробуйте другую станцию.'
    })
  }
}

const toggleRadioPlayback = async () => {
  const shared = getSharedRadioPlayer()
  if (!shared) return
  const audio = shared.audio
  radioError.value = ''

  const nextUrl = String(selectedRadioUrl.value || '').trim()
  if (!nextUrl) return
  shared.currentUrl = nextUrl
  if (!audio.src || !audio.src.includes(nextUrl)) {
    audio.src = nextUrl
  }

  try {
    if (!audio.paused && !audio.ended) {
      audio.pause()
      radioPlaying.value = false
      return
    }
    onRadioVolumeChange()
    await audio.play()
    radioPlaying.value = true
  } catch {
    radioPlaying.value = false
    radioError.value = 'Не удалось запустить поток. Попробуйте другую станцию.'
  }
}

onMounted(async () => {
  clearLegacyLocalWorkspace()
  await loadWorkspaceState()
  loadTodoDraft()
  if (typeof window !== 'undefined') {
    workspaceBeforeUnloadHandler = () => flushWorkspaceSaveKeepalive()
    window.addEventListener('beforeunload', workspaceBeforeUnloadHandler)
  }
  loadWeather()
  loadFxRates()
  const sharedRadio = getSharedRadioPlayer()
  syncRadioStateFromShared()
  onRadioVolumeChange()
  if (sharedRadio) {
    radioPlayHandler = () => {
      radioPlaying.value = true
      radioError.value = ''
    }
    radioPauseHandler = () => {
      radioPlaying.value = false
    }
    radioWaitingHandler = () => {
      radioPlaying.value = true
    }
    radioErrorHandler = () => {
      radioPlaying.value = false
      radioError.value = 'Не удалось запустить поток. Попробуйте другую станцию.'
    }
    sharedRadio.audio.addEventListener('play', radioPlayHandler)
    sharedRadio.audio.addEventListener('pause', radioPauseHandler)
    sharedRadio.audio.addEventListener('waiting', radioWaitingHandler)
    sharedRadio.audio.addEventListener('error', radioErrorHandler)
  }
  newPlanDate.value = dateKey.value
  clockTimer = setInterval(() => {
    now.value = new Date()
  }, 1000)
  weatherTimer = setInterval(() => {
    loadWeather()
  }, 15 * 60 * 1000)
  fxTimer = setInterval(() => {
    loadFxRates()
  }, 30 * 60 * 1000)
  pomodoroTimer = setInterval(() => {
    if (!pomodoroRunning.value) return
    if (pomodoroSeconds.value <= 0) {
      pomodoroRunning.value = false
      return
    }
    pomodoroSeconds.value -= 1
  }, 1000)
  planReminderVisibilityHandler = () => {
    if (typeof document !== 'undefined' && !document.hidden) stopTitleFlash()
  }
  document.addEventListener('visibilitychange', planReminderVisibilityHandler)
})

onUnmounted(() => {
  stopTitleFlash()
  if (workspaceBeforeUnloadHandler && typeof window !== 'undefined') {
    window.removeEventListener('beforeunload', workspaceBeforeUnloadHandler)
    workspaceBeforeUnloadHandler = null
  }
  if (planReminderVisibilityHandler && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', planReminderVisibilityHandler)
    planReminderVisibilityHandler = null
  }
  calendarTooltip.value = null
  stopPlanDrag()
  const sharedRadio = getSharedRadioPlayer()
  if (sharedRadio) {
    if (radioPlayHandler) sharedRadio.audio.removeEventListener('play', radioPlayHandler)
    if (radioPauseHandler) sharedRadio.audio.removeEventListener('pause', radioPauseHandler)
    if (radioWaitingHandler) sharedRadio.audio.removeEventListener('waiting', radioWaitingHandler)
    if (radioErrorHandler) sharedRadio.audio.removeEventListener('error', radioErrorHandler)
  }
  radioPlayHandler = null
  radioPauseHandler = null
  radioWaitingHandler = null
  radioErrorHandler = null
  if (todoDraftTimer) clearTimeout(todoDraftTimer)
  flushWorkspaceSave()
  if (clockTimer) clearInterval(clockTimer)
  if (weatherTimer) clearInterval(weatherTimer)
  if (fxTimer) clearInterval(fxTimer)
  if (pomodoroTimer) clearInterval(pomodoroTimer)
})
</script>

<style scoped>
.workspace-root {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(160px, 0.58fr) minmax(520px, 2fr) minmax(140px, 0.55fr);
  gap: 10px;
  padding: 10px;
  background: #f8fafc;
  min-width: 1080px;
  overflow-x: auto;
}
.col {
  position: relative;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 2px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.7);
}
.col.collapsed {
  min-width: 0;
  width: 0;
  border: none;
  box-shadow: none;
  padding: 0;
}
.col.collapsed > * {
  display: none;
}
.col-day { background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%); }
.col-notes {
  background: linear-gradient(180deg, #ffffff 0%, #f9fbf7 100%);
  overflow-y: auto;
  overflow-x: hidden;
}
.col-widgets { background: linear-gradient(180deg, #ffffff 0%, #faf8ff 100%); }
.edge-hide-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 128px;
  padding: 0;
  border: 1px solid #94a3b8;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.95);
  color: #334155;
  font-size: 0.78rem;
  line-height: 1;
  cursor: pointer;
  z-index: 12;
  opacity: 0;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.1);
  transition: opacity 0.16s ease, background 0.16s ease;
}
.col-day:hover .edge-hide-btn-day,
.col-day:focus-within .edge-hide-btn-day,
.col-widgets:hover .edge-hide-btn-widgets,
.col-widgets:focus-within .edge-hide-btn-widgets {
  opacity: 1;
  pointer-events: auto;
}
.edge-hide-btn-day {
  right: -8px;
}
.edge-hide-btn-widgets {
  left: -8px;
}
.edge-hide-btn:hover {
  background: #f8fafc;
}
.edge-tail {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 124px;
  padding: 0;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.98);
  color: #334155;
  font-size: 0.68rem;
  line-height: 1;
  cursor: pointer;
  z-index: 13;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
}
.edge-tail-left {
  left: 0;
}
.edge-tail-right {
  right: 0;
}
.edge-tail:hover {
  background: #f8fafc;
}
.col-header {
  padding: 10px 12px;
  border-bottom: 1px solid #dbe4ee;
  background: rgba(248, 250, 252, 0.9);
}
.col-header h3 {
  margin: 0;
  font-size: 0.95rem;
  color: #0f172a;
}
.day-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.day-head-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.day-reminder-enable-btn {
  flex-shrink: 0;
  width: 30px;
  height: 28px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fffbeb;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.day-reminder-enable-btn:hover {
  border-color: #fcd34d;
  background: #fef3c7;
}
.plan-reminder-layer {
  position: relative;
  z-index: 6;
  padding: 0 10px 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.plan-reminder-layer--fixed {
  position: fixed;
  inset: 0;
  z-index: 10060;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 1rem;
  box-sizing: border-box;
  pointer-events: none;
}
.plan-reminder-layer--fixed .plan-reminder-toast {
  pointer-events: auto;
  width: 100%;
  max-width: min(440px, calc(100vw - 2rem));
}
.plan-reminder-toast {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #fcd34d;
  background: linear-gradient(135deg, #fffbeb 0%, #fef9c3 100%);
  box-shadow: 0 4px 14px rgba(234, 179, 8, 0.22);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 0.8rem;
  color: #713f12;
}
.plan-reminder-toast-bell {
  flex-shrink: 0;
  font-size: 1.15rem;
  line-height: 1.2;
}
.plan-reminder-toast-text {
  flex: 1;
  min-width: 0;
}
.plan-reminder-toast-kicker {
  font-weight: 700;
  font-size: 0.8125rem;
  letter-spacing: 0.01em;
  line-height: 1.35;
  color: #92400e;
  margin-bottom: 4px;
}
.plan-reminder-toast-body {
  font-weight: 600;
  line-height: 1.4;
  word-break: break-word;
}
.plan-reminder-toast-close {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.65);
  color: #78350f;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}
.plan-reminder-toast-close:hover {
  background: #fff;
}
.plan-dot--pulse {
  animation: plan-dot-pulse 1.1s ease-in-out infinite;
  border-color: #f59e0b !important;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.35);
}
@keyframes plan-dot-pulse {
  0%,
  100% {
    transform: translateY(0);
    filter: brightness(1);
  }
  50% {
    transform: translateY(-1px);
    filter: brightness(1.06);
  }
}
.day-switch {
  display: inline-flex;
  gap: 6px;
}
.day-switch-btn {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #475569;
  border-radius: 6px;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 3px 7px;
  cursor: pointer;
}
.day-switch-btn.active {
  border-color: #93c5fd;
  background: #eff6ff;
  color: #1d4ed8;
}
.date {
  margin-top: 2px;
  font-size: 0.78rem;
  color: #64748b;
  text-transform: capitalize;
}
.timeline {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.timeline-scale {
  position: relative;
}
.time-slot {
  height: 36px;
  display: grid;
  grid-template-columns: 52px 1fr;
  align-items: center;
  padding: 0 10px 0 8px;
}
.time-label {
  font-size: 0.72rem;
  color: #64748b;
}
.time-line {
  height: 1px;
  background: #e5e7eb;
}
.timeline-plans {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.plan-dot {
  position: absolute;
  left: 62px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px;
  border-radius: 6px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e3a8a;
  font-size: 0.73rem;
  cursor: grab;
  pointer-events: auto;
  user-select: none;
}
.dot-done-btn {
  width: 17px;
  height: 17px;
  border: 1px solid #93c5fd;
  border-radius: 5px;
  background: #ffffff;
  color: #2563eb;
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.dot-done-btn.checked {
  background: #2563eb;
  border-color: #1d4ed8;
  color: #ffffff;
}
.dot-repeat {
  margin-left: auto;
  font-size: 0.64rem;
  font-weight: 700;
  color: #1d4ed8;
  background: #dbeafe;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  padding: 1px 6px;
}
.plan-dot.done {
  background: #f1f5f9;
  color: #64748b;
  border-color: #e2e8f0;
  text-decoration: line-through;
}
.plan-dot.overdue {
  background: #fef2f2;
  color: #991b1b;
  border-color: #fca5a5;
}
.plan-dot.overdue .dot-time,
.plan-dot.overdue .dot-text {
  color: #991b1b;
}
.plan-dot.dragging {
  box-shadow: 0 4px 10px rgba(30, 58, 138, 0.18);
  border-color: #60a5fa;
  cursor: grabbing;
}
.dot-time {
  font-weight: 700;
}
.dot-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.now-line {
  position: absolute;
  left: 52px;
  right: 8px;
  height: 2px;
  background: #ef4444;
}
.now-label {
  position: absolute;
  top: -10px;
  right: 0;
  font-size: 0.66rem;
  font-weight: 700;
  color: #ef4444;
  background: #fff;
  padding: 0 4px;
}
.quick-add {
  display: grid;
  grid-template-columns: 92px 1fr 1fr;
  gap: 8px;
  padding: 10px 12px;
}
.quick-add-second-row {
  grid-template-columns: 1fr auto;
  padding-top: 0;
  border-bottom: 1px solid #eef2f7;
}
.day-quick-add {
  grid-template-columns: 86px 1fr;
  padding: 8px 10px 0;
}
.day-quick-add .input-select {
  grid-column: 1 / -1;
}
.day-quick-add-second-row {
  padding: 8px 10px 8px;
}
.input-time,
.input-text,
.input-date,
.input-select {
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  padding: 7px 8px;
  font-size: 0.8rem;
  caret-color: #000000;
  color: #111111;
}
.input-text-full {
  min-width: 0;
}
.btn-add {
  border: 1px solid #3b82f6;
  background: #3b82f6;
  color: #fff;
  border-radius: 7px;
  padding: 0 10px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.add-info {
  padding: 6px 12px 8px;
  font-size: 0.72rem;
  color: #64748b;
  border-bottom: 1px solid #eef2f7;
}
.add-info-day {
  padding: 4px 10px 6px;
}
.day-edit-card {
  margin: 8px 10px 10px;
  padding: 8px;
  border: 1px solid #dbe4ee;
  border-radius: 8px;
  background: #f8fafc;
}
.day-edit-title {
  font-size: 0.72rem;
  font-weight: 700;
  color: #334155;
  margin-bottom: 6px;
}
.day-edit-card .plan-edit-grid {
  grid-template-columns: 1fr;
  gap: 6px;
}
.day-edit-card .plan-edit-actions {
  margin-top: 6px;
}
.recurrence-weekdays-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  margin: 4px 0 2px;
  padding: 4px 0;
  background: transparent;
  border: none;
  font-size: 0.72rem;
  color: #334155;
}
/* Выровнять с текстом в .input-select: padding колонки 10px + внутренний отступ поля 8px */
.recurrence-weekdays-row--new {
  margin: 0 0 6px;
  padding-left: 18px;
  padding-right: 10px;
}
/* В карточке редактирования: padding карточки 8px + padding селекта 8px */
.recurrence-weekdays-row--edit {
  margin: 4px 0 0;
  padding-left: 16px;
  padding-right: 8px;
}
.recurrence-weekdays-hint {
  font-weight: 700;
  color: #475569;
  margin-right: 4px;
}
.recurrence-day-label {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  user-select: none;
  font-weight: 600;
}
.recurrence-day-label input {
  margin: 0;
}
.plan-list {
  max-height: 180px;
  overflow: auto;
  border-bottom: 1px solid #eef2f7;
  padding: 8px 12px;
}
.workspace-save-error {
  margin: 0;
  padding: 8px 12px;
  font-size: 0.78rem;
  color: #b91c1c;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
}
.todo-book {
  border-bottom: 1px solid #eef2f7;
}
.todo-book-header {
  padding: 8px 12px 4px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
}
.todo-book-header h4 {
  margin: 0;
  font-size: 0.78rem;
  color: #334155;
}
.todo-expand-btn {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: #2563eb;
  user-select: none;
  flex-shrink: 0;
  margin-top: 1px;
  padding: 0;
  cursor: pointer;
}
.todo-expand-btn:hover {
  background: rgba(37, 99, 235, 0.08);
}
.todo-expand-icon {
  font-size: 1.45rem;
  font-weight: 600;
  line-height: 1;
  transform: rotate(0deg);
  transition: transform 0.16s ease;
}
.todo-expand-icon--expanded {
  transform: rotate(90deg);
}
.todo-create-grid {
  display: grid;
  gap: 6px;
  padding: 0 12px 8px;
}
.todo-points-editor {
  display: grid;
  gap: 6px;
}
.todo-point-edit-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.75fr) auto;
  align-items: center;
  gap: 6px;
}
.todo-point-input {
  min-width: 0;
}
.todo-point-link-input {
  min-width: 0;
}
.todo-point-add-btn {
  justify-self: start;
  padding: 4px 8px;
}
.todo-add-btn {
  justify-self: start;
  padding: 6px 10px;
}
.todo-list {
  max-height: 170px;
  overflow: auto;
  padding: 0 12px 8px;
}
.todo-list.expanded {
  max-height: none;
  overflow: visible;
}
.todo-item {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 7px 8px;
  margin-top: 6px;
  background: #ffffff;
}
.todo-title {
  font-size: 0.76rem;
  font-weight: 700;
  color: #0f172a;
  cursor: default;
}
.todo-points {
  margin: 6px 0 0;
  padding-left: 0;
  color: #334155;
  font-size: 0.75rem;
  line-height: 1.4;
  list-style: none;
}
.todo-points li + li {
  margin-top: 2px;
}
.todo-point-line {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: flex-start;
  gap: 6px;
  padding: 2px 4px;
  margin: 0 -4px;
  border-radius: 6px;
  transition: background 0.12s ease, box-shadow 0.12s ease;
}
.todo-point-line:has(.todo-point-remove-btn:hover) {
  background: #fff1f2;
  box-shadow: inset 0 0 0 1px rgba(251, 113, 133, 0.45);
}
.todo-point-check {
  margin: 2px 0 0;
  flex-shrink: 0;
}
.todo-point-text {
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.35;
  cursor: text;
}
.todo-point-inline-input {
  box-sizing: border-box;
  justify-self: stretch;
  min-width: 0;
  width: calc(100% - 10px);
  max-width: 100%;
  margin-right: 4px;
  font-size: inherit;
  line-height: 1.35;
  color: #0f172a;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 3px 8px;
  caret-color: #2563eb;
  outline: none;
  box-shadow: none;
}
.todo-point-inline-input:focus {
  border-color: #93c5fd;
  background: #fff;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.18);
}
.todo-point-inline-input:focus-visible {
  outline: none;
}
.todo-point-link-placeholder {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}
.todo-point-link-btn {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  border-radius: 4px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex: 0 0 auto;
}
.todo-point-link-btn:hover {
  background: #eff6ff;
}
.todo-point-link-icon {
  width: 18px;
  height: 18px;
  display: block;
}
.todo-point-remove-btn {
  flex: 0 0 auto;
}
.todo-points li.done .todo-point-text {
  text-decoration: line-through;
  color: #94a3b8;
}
.todo-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}
.todo-item-foot {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  margin-top: 6px;
}
.todo-item-foot .todo-actions--after-quick-add {
  margin-top: 0;
}
.todo-action-add-btn {
  font-size: 0.68rem;
  line-height: 1;
  padding: 3px 7px;
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}
.todo-action-add-btn:hover {
  background: #dbeafe;
}
.todo-edit-grid {
  display: grid;
  gap: 6px;
}
.plan-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 0;
  font-size: 0.78rem;
}
.plan-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.btn-edit {
  border: none;
  background: transparent;
  border-radius: 0;
  width: auto;
  height: auto;
  padding: 0;
  cursor: pointer;
}
.btn-edit-icon {
  width: 14px;
  height: 14px;
  display: block;
  transition: transform 0.14s ease;
}
.btn-edit:hover .btn-edit-icon {
  transform: scale(1.08);
}
.plan-item.done {
  opacity: 0.65;
  text-decoration: line-through;
}
.plan-item.overdue {
  color: #991b1b;
}
.plan-item.overdue .plan-item-time,
.plan-item.overdue .plan-item-text {
  color: #991b1b;
}
.plan-item label {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.plan-item-time {
  font-weight: 700;
  color: #0f172a;
}
.plan-item-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.plan-repeat {
  font-size: 0.66rem;
  font-weight: 700;
  color: #1d4ed8;
  background: #dbeafe;
  border-radius: 999px;
  padding: 1px 6px;
}
.plan-edit-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 92px 140px 150px 1fr;
  gap: 6px;
  min-width: 0;
}
.plan-edit-actions {
  display: inline-flex;
  gap: 6px;
}
.btn-mini {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #475569;
  border-radius: 6px;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 4px 8px;
  cursor: pointer;
}
.btn-mini.btn-save {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}
.btn-del {
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #64748b;
  border-radius: 6px;
  width: 22px;
  height: 22px;
  cursor: pointer;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0;
  font-size: 0.75rem;
  line-height: 1;
}
.btn-del.btn-del--text {
  width: auto;
  min-width: auto;
  height: auto;
  min-height: 30px;
  padding: 5px 12px;
  font-size: 0.72rem;
  font-weight: 600;
  color: #b91c1c;
  border-color: #fecaca;
  background: #fff1f2;
  white-space: nowrap;
}
.notes-area {
  flex: 1;
  min-height: 120px;
  border: none;
  resize: none;
  outline: none;
  padding: 12px;
  font-size: 0.86rem;
  line-height: 1.5;
  cursor: default;
  caret-color: #000000;
  color: #0f172a;
  overflow-y: auto;
}
.notes-area:focus {
  cursor: text;
  caret-color: #000000;
}
.col-widgets {
  padding-bottom: 8px;
}
.widget {
  margin: 10px 10px 0;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 9px;
  background: #f8fafc;
}
.widget-title {
  font-size: 0.76rem;
  color: #475569;
  margin-bottom: 6px;
  font-weight: 700;
}
.clock {
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
}
.weather-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.weather-refresh {
  width: 24px;
  height: 24px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  color: #475569;
  font-size: 0.8rem;
  line-height: 1;
  cursor: pointer;
}
.weather-refresh:disabled {
  opacity: 0.55;
  cursor: default;
}
.weather-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.weather-main {
  display: flex;
  align-items: center;
  gap: 8px;
}
.weather-icon {
  font-size: 1.1rem;
}
.weather-temp {
  font-size: 1.15rem;
  font-weight: 700;
  color: #0f172a;
}
.weather-desc {
  font-size: 0.74rem;
  color: #475569;
}
.weather-meta {
  display: grid;
  gap: 2px;
  font-size: 0.7rem;
  color: #64748b;
}
.fx-body {
  display: grid;
  gap: 4px;
}
.widget-fx-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  align-items: stretch;
}
.fx-panel,
.fx-reserved-panel {
  min-height: 92px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
  padding: 8px;
}
.fx-panel-empty {
  background: #f8fafc;
}
.fx-reserved-panel {
  border-style: dashed;
}
.fx-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.78rem;
}
.fx-code {
  font-weight: 700;
  color: #334155;
}
.fx-value {
  font-weight: 700;
  color: #0f172a;
}
.radio-controls {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
}
.radio-select {
  min-width: 0;
}
.radio-volume-row {
  margin-top: 8px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
}
.radio-volume {
  width: 100%;
}
.calendar-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: #334155;
  text-transform: capitalize;
}
.calendar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.calendar-nav-btn {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  font-size: 0.9rem;
  line-height: 1;
  cursor: pointer;
}
.calendar-nav-btn:hover {
  background: #f8fafc;
}
.calendar-today-btn {
  width: 100%;
  margin-bottom: 7px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #475569;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 4px 6px;
  cursor: pointer;
}
.calendar-today-btn:hover {
  background: #f8fafc;
}
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}
.calendar-weekdays span {
  font-size: 0.66rem;
  text-align: center;
  color: #64748b;
  font-weight: 700;
}
.calendar-day {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  border-radius: 4px;
  font-size: 0.72rem;
  color: #334155;
  background: #ffffff;
  border: 1px solid #e2e8f0;
}
.calendar-day.empty {
  border-color: transparent;
  background: transparent;
}
.calendar-day.weekend {
  color: #b91c1c;
  background: #fff1f2;
  border-color: #fecdd3;
}
.calendar-day.holiday:not(.today) {
  color: #9f1239;
  background: #ffe4e6;
  border-color: #fda4af;
  font-weight: 700;
}
.calendar-day.holiday:not(.empty)::after {
  content: '';
  position: absolute;
  top: 2px;
  right: 2px;
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: #e11d48;
}
.calendar-day.today {
  color: #ffffff;
  background: #2563eb;
  border-color: #1d4ed8;
  font-weight: 700;
}
.calendar-day.has-task:not(.today):not(.empty) {
  border-color: #93c5fd;
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.2);
}
.calendar-day.calendar-day--clickable {
  cursor: pointer;
}
.calendar-day.calendar-day--clickable:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 1px;
}
.calendar-day.calendar-day--clickable:hover:not(.today):not(.empty) {
  background: #f1f5f9;
  border-color: #94a3b8;
}
.calendar-day.selected:not(.empty) {
  box-shadow: 0 0 0 2px #0ea5e9;
  z-index: 1;
}
.calendar-day.today.selected:not(.empty) {
  box-shadow: 0 0 0 2px #fbbf24, inset 0 0 0 1px rgba(255, 255, 255, 0.35);
}
.calendar-tooltip {
  position: fixed;
  z-index: 80;
  width: min(300px, calc(100vw - 24px));
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
  padding: 8px;
  pointer-events: none;
}
.calendar-tooltip-title {
  font-size: 0.74rem;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 6px;
  text-transform: capitalize;
}
.calendar-tooltip-item {
  display: grid;
  grid-template-columns: 44px 1fr;
  gap: 6px;
  align-items: start;
  font-size: 0.72rem;
  color: #334155;
  padding: 2px 0;
}
.calendar-tooltip-time {
  color: #475569;
  font-weight: 700;
}
.calendar-tooltip-text {
  overflow-wrap: anywhere;
}
.pomodoro-time {
  font-size: 1.4rem;
  font-weight: 700;
  color: #1d4ed8;
}
.pomodoro-controls {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.btn-small {
  border: 1px solid #3b82f6;
  background: #3b82f6;
  color: #fff;
  border-radius: 7px;
  padding: 5px 9px;
  font-size: 0.75rem;
  cursor: pointer;
}
.btn-small.btn-ghost {
  border-color: #cbd5e1;
  background: #fff;
  color: #475569;
}
.muted {
  color: #94a3b8;
  font-size: 0.74rem;
}
</style>
