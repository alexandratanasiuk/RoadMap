<template>
  <div class="users-test">
    <h2>Пользователи</h2>

    <div v-if="loading" class="muted">Загрузка…</div>
    <div v-else-if="error" class="err">{{ error }}</div>
    <div v-else class="user-editor-layout">
      <aside class="user-col user-col--left">
        <h3 class="user-col-title">Права</h3>
        <template v-if="activeUser">
          <div class="perm-grid perm-grid--single">
            <label v-for="perm in permissionOptions" :key="`${activeUser.username}-${perm.key}`" class="perm-item">
              <input
                type="checkbox"
                :checked="Boolean(permissionsDraft[activeUser.username]?.[perm.key])"
                @change="togglePermission(activeUser.username, perm.key, $event?.target?.checked)"
              />
              <span>{{ perm.label }}</span>
            </label>
          </div>
          <button class="action-btn save-perms-btn" type="button" :disabled="isSaving" @click="saveRole(activeUser)">
            Сохранить роль, права и примечание
          </button>
        </template>
        <p v-else class="muted user-col-hint">Выберите пользователя в списке по центру.</p>
      </aside>

      <nav class="user-col user-col--center" aria-label="Список пользователей">
        <h3 class="user-col-title">Пользователи</h3>
        <ul :key="directoryListEpoch" class="user-list-select">
          <li
            v-for="row in displayUserRows"
            :id="userListRowDomId(row.username)"
            :key="row.username"
            class="user-list-item"
            :class="{ 'user-list-item--active': row.username === selectedUsername }"
            role="button"
            tabindex="0"
            @click="selectUser(row.username)"
            @keydown.enter.prevent="selectUser(row.username)"
          >
            <span class="user-list-name">{{ row.username }}</span>
            <span class="user-list-role">{{ roleOptionLabel(row.role) }}</span>
          </li>
        </ul>
      </nav>

      <aside class="user-col user-col--right">
        <h3 class="user-col-title">Учётная запись</h3>
        <template v-if="activeUser">
          <div class="account-field">
            <span class="field-label">Логин</span>
            <code class="account-login">{{ activeUser.username }}</code>
          </div>
          <div class="account-field">
            <label class="field-label" :for="`role-${activeUser.username}`">Роль</label>
            <select
              :id="`role-${activeUser.username}`"
              v-model="roleDraft[activeUser.username]"
              class="role-select role-select--wide"
              @change="onRoleDraftChange(activeUser.username)"
            >
              <option v-for="item in roleOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </div>
          <div class="account-field">
            <span class="field-label">Пароль</span>
            <div class="pwd">
              <template v-if="activeUser.passwordPlain != null && activeUser.passwordPlain !== ''">
                <code>{{ activeUser.passwordPlain }}</code>
              </template>
              <span v-else class="muted">неизвестен</span>
              <div class="hint">{{ activeUser.passwordNote }}</div>
              <div class="password-update-row">
                <input
                  v-model.trim="passwordDraft[activeUser.username]"
                  type="password"
                  class="password-update-input"
                  placeholder="Новый пароль"
                  autocomplete="new-password"
                />
                <button class="action-btn" type="button" :disabled="isSaving" @click="setUserPassword(activeUser.username)">
                  Сменить пароль
                </button>
              </div>
            </div>
          </div>
          <div class="account-field">
            <label class="field-label" :for="`note-${activeUser.username}`">Примечание</label>
            <textarea
              :id="`note-${activeUser.username}`"
              v-model="noteDraft[activeUser.username]"
              class="note-textarea"
              rows="5"
              maxlength="4000"
              placeholder="Внутреннее примечание по пользователю"
            />
          </div>
          <div v-if="canManageProjectsAdmin" class="account-field account-field--delete">
            <button
              type="button"
              class="danger-btn"
              :disabled="isSaving || !canDeleteActiveUser"
              :title="deleteUserDisabledReason || undefined"
              @click="openDeleteModal"
            >
              Удалить пользователя…
            </button>
            <p v-if="!canDeleteActiveUser && deleteUserDisabledReason" class="delete-hint muted">{{ deleteUserDisabledReason }}</p>
          </div>
        </template>
        <p v-else class="muted user-col-hint">Выберите пользователя.</p>
      </aside>
    </div>

    <div class="create-panel">
      <button class="create-panel-toggle" type="button" @click="createPanelOpen = !createPanelOpen">
        <span>Добавить пользователя</span>
        <span>{{ createPanelOpen ? '▾' : '▸' }}</span>
      </button>
      <div v-if="createPanelOpen" class="create-panel-body">
        <div class="create-grid create-grid--with-note">
          <input v-model.trim="createForm.username" type="text" placeholder="Логин" />
          <input v-model.trim="createForm.password" type="password" placeholder="Пароль" />
          <select v-model="createForm.role" @change="onCreateRoleChange">
            <option v-for="item in roleOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
          <button class="action-btn" type="button" :disabled="isSaving" @click="createUser">Добавить</button>
          <textarea v-model.trim="createForm.note" class="create-note" rows="2" maxlength="4000" placeholder="Примечание (необязательно)" />
        </div>
        <div class="perm-grid perm-grid--create">
          <label v-for="perm in permissionOptions" :key="`create-${perm.key}`" class="perm-item">
            <input type="checkbox" :checked="Boolean(createForm.permissions[perm.key])" @change="toggleCreatePermission(perm.key, $event?.target?.checked)" />
            <span>{{ perm.label }}</span>
          </label>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="deleteModalOpen" class="delete-modal-overlay" role="presentation">
        <div class="delete-modal" role="dialog" aria-labelledby="delete-modal-title" aria-modal="true" @click.stop>
          <div id="delete-modal-title" class="delete-modal-title" role="heading" aria-level="2">Удаление пользователя</div>
          <p class="delete-modal-text">
            Безвозвратно удалить учётную запись
            <code class="delete-modal-code">{{ deleteTargetUsername }}</code>
            ? Будет удалён и рабочий стол пользователя.
          </p>
          <p class="delete-modal-label">Введите логин полностью для подтверждения:</p>
          <input
            ref="deleteConfirmInputRef"
            v-model.trim="deleteConfirmInput"
            type="text"
            class="delete-modal-input"
            autocomplete="off"
            spellcheck="false"
            :placeholder="deleteTargetUsername"
            @keydown.enter.prevent="deleteConfirmMatches && confirmDeleteUser()"
          />
          <div class="delete-modal-actions">
            <button type="button" class="modal-btn modal-btn--secondary" :disabled="isSaving" @click="closeDeleteModal">
              Отмена
            </button>
            <button
              type="button"
              class="modal-btn modal-btn--danger"
              :disabled="isSaving || !deleteConfirmMatches"
              @click="confirmDeleteUser"
            >
              {{ isSaving ? 'Удаление…' : 'Удалить навсегда' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <div v-if="manageMessage" class="manage-msg">{{ manageMessage }}</div>

    <div class="projects-panel">
      <div class="projects-head">
        <h3>Проекты</h3>
        <div class="projects-head-actions">
          <span class="projects-count">Всего: {{ projectsOverview.length }}</span>
          <button class="refresh-btn" type="button" @click="loadProjectsOverview" :disabled="loadingProjects">
            {{ loadingProjects ? 'Обновление…' : 'Обновить' }}
          </button>
        </div>
      </div>
      <div v-if="loadingProjects" class="muted">Загрузка списка проектов…</div>
      <div v-else-if="projectsError" class="err">{{ projectsError }}</div>
      <div v-else-if="projectsOverview.length === 0" class="muted">Нет проектов в базе.</div>
      <div v-else class="projects-table-wrap">
        <table class="tbl tbl--projects">
          <thead>
            <tr>
              <th>Название</th>
              <th>Владелец</th>
              <th>Участники</th>
              <th>По умолчанию</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="p in projectsOverview" :key="p.id">
              <tr>
                <td class="name-cell">
                  <button
                    type="button"
                    class="project-tree-caret"
                    :disabled="projectTreeState(p.id).loading"
                    :aria-expanded="Boolean(expandedProjectTrees[p.id])"
                    :aria-label="expandedProjectTrees[p.id] ? 'Свернуть этапы и задачи' : 'Показать этапы и задачи'"
                    @click="toggleProjectTree(p.id)"
                  >
                    <span
                      class="project-tree-caret-icon"
                      :class="{ 'project-tree-caret-icon--expanded': expandedProjectTrees[p.id] }"
                      aria-hidden="true"
                    >›</span>
                  </button>
                  <span class="project-name-text">{{ p.name }}</span>
                </td>
                <td class="mono owner-cell-wrap">
                  <template v-if="canManageProjectsAdmin">
                    <div class="owner-admin-row">
                      <select v-model="projectOwnerDraft[p.id]" class="project-admin-select">
                        <option v-for="u in usernamesForProjectPicker" :key="`own-${p.id}-${u}`" :value="u">{{ u }}</option>
                      </select>
                      <button
                        v-if="projectOwnerDraft[p.id] !== p.ownerUsername"
                        type="button"
                        class="action-btn"
                        :disabled="isSaving"
                        @click="saveProjectOwner(p)"
                      >
                        Сменить
                      </button>
                    </div>
                  </template>
                  <template v-else>{{ p.ownerUsername }}</template>
                </td>
                <td class="members-cell-wrap">
                  <template v-if="canManageProjectsAdmin">
                    <div class="members-admin-combined">
                      <div class="member-chips-admin">
                        <template v-if="(p.sharedUsernames || []).length">
                          <span v-for="m in p.sharedUsernames" :key="`${p.id}-m-${m}`" class="member-chip">
                            <span class="member-chip-name">{{ m }}</span>
                            <button
                              type="button"
                              class="member-chip-remove"
                              :disabled="isSaving"
                              :title="`Удалить ${m}`"
                              @click="removeProjectMember(p, m)"
                            >
                              ×
                            </button>
                          </span>
                        </template>
                        <span v-else class="muted members-empty-dash">—</span>
                      </div>
                      <div class="add-member-row">
                        <select v-model="addMemberDraft[p.id]" class="project-admin-select">
                          <option value="">Добавить…</option>
                          <option v-for="u in addableUsernamesForProject(p)" :key="`add-${p.id}-${u}`" :value="u">{{ u }}</option>
                        </select>
                        <button
                          type="button"
                          class="action-btn"
                          :disabled="isSaving || !String(addMemberDraft[p.id] || '').trim()"
                          @click="addProjectMember(p)"
                        >
                          Добавить
                        </button>
                      </div>
                    </div>
                  </template>
                  <template v-else>
                    <span v-if="!p.sharedUsernames?.length" class="muted">—</span>
                    <span v-else class="members-cell">{{ p.sharedUsernames.join(', ') }}</span>
                  </template>
                </td>
                <td>{{ p.isDefault ? 'Да' : 'Нет' }}</td>
              </tr>
              <tr v-if="expandedProjectTrees[p.id]" class="tree-row">
                <td colspan="4">
                  <div v-if="projectTreeState(p.id).loading" class="muted tree-inner">Загрузка этапов…</div>
                  <div v-else-if="projectTreeState(p.id).error" class="err tree-inner tree-err">{{ projectTreeState(p.id).error }}</div>
                  <div v-else class="tree-inner project-tree">
                    <template v-if="!(projectTreeState(p.id).stages || []).length">
                      <span class="muted">Нет этапов в этом проекте.</span>
                    </template>
                    <ul v-else class="stage-tree-root">
                      <li v-for="st in projectTreeState(p.id).stages" :key="st.id" class="stage-tree-node">
                        <div class="stage-tree-line">
                          <button
                            v-if="(st.tasks || []).length"
                            type="button"
                            class="project-tree-caret project-tree-caret--stage"
                            :aria-expanded="isStageTasksExpanded(p.id, st.id)"
                            :aria-label="isStageTasksExpanded(p.id, st.id) ? 'Свернуть задачи этапа' : 'Показать задачи этапа'"
                            @click.stop="toggleStageTasksExpanded(p.id, st.id)"
                          >
                            <span
                              class="project-tree-caret-icon"
                              :class="{ 'project-tree-caret-icon--expanded': isStageTasksExpanded(p.id, st.id) }"
                              aria-hidden="true"
                            >›</span>
                          </button>
                          <span v-else class="stage-tree-caret-spacer" aria-hidden="true" />
                          <span class="stage-tree-title">{{ st.title }}</span>
                        </div>
                        <ul
                          v-if="(st.tasks || []).length && isStageTasksExpanded(p.id, st.id)"
                          class="task-tree-root"
                        >
                          <li v-for="(t, ti) in st.tasks" :key="`${st.id}-${t.id || ti}`" class="task-tree-node">
                            <span class="task-tree-marker" aria-hidden="true">└</span>
                            <span v-if="t.statusLabel" class="task-tree-status">{{ t.statusLabel }}</span>
                            <span class="task-tree-title">{{ t.title }}</span>
                          </li>
                        </ul>
                        <div v-else-if="!(st.tasks || []).length" class="muted task-tree-empty">Нет задач</div>
                      </li>
                    </ul>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <div class="history-panel">
      <div class="history-head">
        <h3>История изменений</h3>
        <div class="history-head-actions">
          <span class="history-count">Записей: {{ filteredHistoryRows.length }}</span>
          <button class="refresh-btn" type="button" @click="loadHistory" :disabled="loadingHistory">
            {{ loadingHistory ? 'Обновление…' : 'Обновить' }}
          </button>
        </div>
      </div>
      <div class="history-filters">
        <label class="history-filter">
          <span>Пользователь</span>
          <select v-model="filters.user">
            <option value="">Все</option>
            <option v-for="name in userOptions" :key="name" :value="name">{{ name }}</option>
          </select>
        </label>
        <label class="history-filter">
          <span>Этап</span>
          <select v-model="filters.stage">
            <option value="">Все</option>
            <option v-for="stage in stageOptions" :key="stage" :value="stage">{{ stage }}</option>
          </select>
        </label>
        <label class="history-filter">
          <span>Задача</span>
          <input v-model.trim="filters.task" type="text" placeholder="Название задачи" />
        </label>
        <label class="history-filter">
          <span>Дата с</span>
          <input v-model="filters.dateFrom" type="date" />
        </label>
        <label class="history-filter">
          <span>Дата по</span>
          <input v-model="filters.dateTo" type="date" />
        </label>
        <button class="clear-filters-btn" type="button" @click="clearFilters">Сбросить</button>
      </div>
      <div v-if="loadingHistory" class="muted">Загрузка истории…</div>
      <div v-else-if="historyError" class="err">{{ historyError }}</div>
      <div v-else-if="filteredHistoryRows.length === 0" class="muted">Нет записей по выбранным фильтрам.</div>
      <div v-else class="history-list">
        <div v-for="item in filteredHistoryRows" :key="item.id" class="history-item">
          <div class="history-item-top">
            <span class="history-time">{{ formatDateTime(item.createdAt) }}</span>
            <span class="history-actor">{{ item.actorUsername }}</span>
            <span class="history-action">{{ item.actionLabel }}</span>
          </div>
          <div class="history-block">
            <template v-if="item.blockTitle || item.blockId">
              Этап: <span class="mono">{{ item.blockTitle || item.blockId }}</span>
            </template>
            <template v-else>
              Объект: <span class="mono">Система / авторизация</span>
            </template>
          </div>
          <div class="history-details">{{ item.details || '—' }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import axios from 'axios'
import { useAuth } from '@/composables/useAuth'
import { STAGING_ARCHITECT_USERNAME } from '@/config/stagingFlags'

const { API_URL, userRole, loginUsername } = useAuth()
const rows = ref([])
const loading = ref(true)
const error = ref('')
const selectedUsername = ref('')
const isSaving = ref(false)
const manageMessage = ref('')
const roleDraft = ref({})
const permissionsDraft = ref({})
const passwordDraft = ref({})
const noteDraft = ref({})
const createPanelOpen = ref(false)
const loadingHistory = ref(false)
const historyError = ref('')
const historyRows = ref([])
const filters = ref({ user: '', stage: '', task: '', dateFrom: '', dateTo: '' })
const projectsOverview = ref([])
const loadingProjects = ref(false)
const projectsError = ref('')
const expandedProjectTrees = ref({})
const treeByProjectId = ref({})
/** projectId -> stageId -> развёрнуты ли задачи этапа (true только после клика; по умолчанию свернуто) */
const expandedStagesByProject = ref({})
const projectOwnerDraft = ref({})
const addMemberDraft = ref({})
const deleteModalOpen = ref(false)
const deleteTargetUsername = ref('')
const deleteConfirmInput = ref('')
const deleteConfirmInputRef = ref(null)

const canManageProjectsAdmin = computed(() => {
  const role = String(userRole.value || '').trim().toLowerCase()
  if (role === 'admin') return true
  const u = String(loginUsername.value || '').trim().toLowerCase()
  return u === String(STAGING_ARCHITECT_USERNAME || '').trim().toLowerCase()
})

const usernamesForProjectPicker = computed(() => {
  const set = new Set()
  rows.value.forEach((r) => {
    const n = String(r?.username || '').trim()
    if (n) set.add(n)
  })
  projectsOverview.value.forEach((p) => {
    const o = String(p?.ownerUsername || '').trim()
    if (o) set.add(o)
    ;(p?.sharedUsernames || []).forEach((x) => {
      const t = String(x || '').trim()
      if (t) set.add(t)
    })
  })
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'))
})

const addableUsernamesForProject = (p) => {
  const ownerL = String(p?.ownerUsername || '').trim().toLowerCase()
  const taken = new Set(
    (p?.sharedUsernames || []).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
  )
  return usernamesForProjectPicker.value.filter((u) => {
    const l = String(u || '').trim().toLowerCase()
    return l && l !== ownerL && !taken.has(l)
  })
}

const roleOptions = [
  { value: 'admin', label: 'Администратор' },
  { value: 'project_user', label: 'Участник проекта' },
  { value: 'user', label: 'Пользователь' },
  { value: 'guest', label: 'Гость' }
]

const permissionOptions = [
  { key: 'view', label: 'Просмотр' },
  { key: 'editTasks', label: 'Редактирование задач' },
  { key: 'editStages', label: 'Редактирование этапов' },
  { key: 'createTasks', label: 'Создание задач' },
  { key: 'deleteTasks', label: 'Удаление задач' },
  { key: 'createStages', label: 'Создание этапов' },
  { key: 'deleteStages', label: 'Удаление этапов' },
  { key: 'dragTasks', label: 'Перетаскивание задач' },
  { key: 'dragStages', label: 'Перетаскивание этапов' },
  { key: 'tabHorizontal', label: 'Вкладка: По месяцам' },
  { key: 'tabQuarters', label: 'Вкладка: По кварталам' },
  { key: 'tabHeatmap', label: 'Вкладка: Тепловая карта' },
  { key: 'tabGantt', label: 'Вкладка: Гант' },
  { key: 'tabPert', label: 'Вкладка: PERT' },
  { key: 'tabRoadmap', label: 'Вкладка: Roadmap Canvas' },
  { key: 'tabWorkspace', label: 'Вкладка: Рабочий стол' },
  { key: 'tabTable', label: 'Вкладка: Таблица' },
  { key: 'tabUsers', label: 'Вкладка: Пользователи' }
]

const defaultPermissionsByRole = (roleRaw) => {
  const role = String(roleRaw || '').trim().toLowerCase()
  if (role === 'guest') {
    return {
      view: true, editTasks: false, editStages: false, createTasks: false, deleteTasks: false,
      createStages: false, deleteStages: false, dragTasks: false, dragStages: false,
      tabHorizontal: true, tabQuarters: true, tabHeatmap: true, tabGantt: true, tabPert: true,
      tabRoadmap: true, tabWorkspace: false, tabTable: true, tabUsers: false
    }
  }
  if (role === 'admin') {
    return {
      view: true, editTasks: true, editStages: true, createTasks: true, deleteTasks: true,
      createStages: true, deleteStages: true, dragTasks: true, dragStages: true,
      tabHorizontal: true, tabQuarters: true, tabHeatmap: true, tabGantt: true, tabPert: true,
      tabRoadmap: true, tabWorkspace: true, tabTable: true, tabUsers: true
    }
  }
  return {
    view: true, editTasks: true, editStages: true, createTasks: true, deleteTasks: true,
    createStages: true, deleteStages: true, dragTasks: true, dragStages: true,
    tabHorizontal: true, tabQuarters: true, tabHeatmap: true, tabGantt: true, tabPert: true,
    tabRoadmap: true, tabWorkspace: true, tabTable: true, tabUsers: false
  }
}

const normalizePermissions = (roleRaw, source = {}) => {
  const base = defaultPermissionsByRole(roleRaw)
  const out = { ...base }
  permissionOptions.forEach(({ key }) => {
    if (Object.prototype.hasOwnProperty.call(source || {}, key)) out[key] = Boolean(source[key])
  })
  return out
}

const createForm = ref({
  username: '',
  password: '',
  role: 'user',
  note: '',
  permissions: normalizePermissions('user', {})
})

const initDrafts = () => {
  const nextRoles = {}
  const nextPerms = {}
  const nextNotes = {}
  rows.value.forEach((row) => {
    const role = String(row?.role || 'user')
    nextRoles[row.username] = role
    nextPerms[row.username] = normalizePermissions(role, row.permissions || {})
    nextNotes[row.username] = String(row?.note ?? '')
  })
  roleDraft.value = nextRoles
  permissionsDraft.value = nextPerms
  noteDraft.value = nextNotes
}

const directoryUsernameKey = (name) => String(name || '').trim().toLowerCase()

/** Счётчик для :key у списка — гарантирует перерисовку DOM после мутаций. */
const directoryListEpoch = ref(0)
const bumpDirectoryListEpoch = () => {
  directoryListEpoch.value += 1
}

/** Ответ GET /users/test-directory: массив или обёртка { rows | users | data }. */
const normalizeDirectoryListPayload = (raw) => {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    for (const key of ['rows', 'users', 'items', 'data']) {
      if (Array.isArray(raw[key])) return raw[key]
    }
  }
  return []
}

const cloneDirectoryRows = (list) =>
  normalizeDirectoryListPayload(list).map((r) => (r && typeof r === 'object' ? { ...r } : { username: String(r) }))

/** Логины недавно созданных пользователей — в списке показываются в конце (после сортировки остальных). */
const directoryKeysPinnedBottom = ref([])

const pushDirectoryPinBottom = (username) => {
  const k = directoryUsernameKey(username)
  if (!k) return
  directoryKeysPinnedBottom.value = [...directoryKeysPinnedBottom.value.filter((x) => x !== k), k]
}

const removeDirectoryPinBottom = (username) => {
  const k = directoryUsernameKey(username)
  directoryKeysPinnedBottom.value = directoryKeysPinnedBottom.value.filter((x) => x !== k)
}

/** Убрать пользователя из локального списка и обновить выбор (после успешного удаления на сервере). */
const removeDirectoryUserLocally = (username) => {
  const k = directoryUsernameKey(username)
  if (!k) return
  removeDirectoryPinBottom(username)
  rows.value = rows.value.filter((r) => directoryUsernameKey(r?.username) !== k)
  if (directoryUsernameKey(selectedUsername.value) === k) {
    const sorted = [...rows.value].sort((a, b) =>
      String(a?.username || '').localeCompare(String(b?.username || ''), 'ru')
    )
    selectedUsername.value = sorted[0] ? String(sorted[0].username).trim() : ''
  }
  initDrafts()
  bumpDirectoryListEpoch()
}

const load = async (opts = {}) => {
  const silent = Boolean(opts.silent)
  if (!silent) {
    loading.value = true
    error.value = ''
  }
  try {
    const { data } = await axios.get(`${API_URL}/users/test-directory`, {
      timeout: 20000,
      params: { _: Date.now() },
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        Expires: '0'
      }
    })
    rows.value = cloneDirectoryRows(data)
    initDrafts()
    bumpDirectoryListEpoch()
    if (rows.value.length) {
      const prevKey = directoryUsernameKey(selectedUsername.value)
      const exists =
        Boolean(prevKey) && rows.value.some((r) => directoryUsernameKey(r?.username) === prevKey)
      if (!selectedUsername.value || !exists) {
        selectedUsername.value = String(rows.value[0]?.username || '').trim()
      }
    } else {
      selectedUsername.value = ''
    }
  } catch (e) {
    if (!silent) {
      if (e.response?.status === 404) error.value = 'Справочник отключён (production).'
      else if (e.response?.status === 403) error.value = 'Нет доступа к вкладке пользователей.'
      else error.value = 'Не удалось загрузить список.'
      rows.value = []
    } else {
      console.warn('[users/test-directory] тихое обновление не удалось', e?.response?.data || e?.message || e)
    }
  } finally {
    if (!silent) loading.value = false
  }
}

const loadHistory = async () => {
  loadingHistory.value = true
  historyError.value = ''
  try {
    const { data } = await axios.get(`${API_URL}/users/change-history?limit=120`, { timeout: 20000 })
    historyRows.value = Array.isArray(data) ? data : []
  } catch (e) {
    historyRows.value = []
    historyError.value = e.response?.status === 403 ? 'Нет доступа к истории изменений.' : 'Не удалось загрузить историю.'
  } finally {
    loadingHistory.value = false
  }
}

const projectTreeState = (projectId) => {
  const id = String(projectId || '')
  return treeByProjectId.value[id] || { loading: false, error: '', stages: null }
}

const isStageTasksExpanded = (projectId, stageId) => {
  const pid = String(projectId || '').trim()
  const sid = String(stageId || '').trim()
  if (!pid || !sid) return false
  return expandedStagesByProject.value[pid]?.[sid] === true
}

const toggleStageTasksExpanded = (projectId, stageId) => {
  const pid = String(projectId || '').trim()
  const sid = String(stageId || '').trim()
  if (!pid || !sid) return
  const prevMap = expandedStagesByProject.value[pid] || {}
  const currentlyExpanded = prevMap[sid] === true
  expandedStagesByProject.value = {
    ...expandedStagesByProject.value,
    [pid]: { ...prevMap, [sid]: !currentlyExpanded }
  }
}

const toggleProjectTree = async (projectId) => {
  const id = String(projectId || '').trim()
  if (!id) return
  if (expandedProjectTrees.value[id]) {
    expandedProjectTrees.value = { ...expandedProjectTrees.value, [id]: false }
    return
  }
  expandedProjectTrees.value = { ...expandedProjectTrees.value, [id]: true }
  const cached = treeByProjectId.value[id]
  if (cached && Array.isArray(cached.stages) && !cached.error) return

  treeByProjectId.value = { ...treeByProjectId.value, [id]: { loading: true, error: '', stages: null } }
  try {
    const { data } = await axios.get(`${API_URL}/users/projects-overview/${encodeURIComponent(id)}/tree`, {
      timeout: 20000
    })
    const stages = Array.isArray(data?.stages) ? data.stages : []
    expandedStagesByProject.value = { ...expandedStagesByProject.value, [id]: {} }
    treeByProjectId.value = { ...treeByProjectId.value, [id]: { loading: false, error: '', stages } }
  } catch (e) {
    treeByProjectId.value = {
      ...treeByProjectId.value,
      [id]: {
        loading: false,
        error: e.response?.status === 403 ? 'Нет доступа.' : 'Не удалось загрузить этапы и задачи.',
        stages: []
      }
    }
  }
}

const syncProjectAdminDrafts = () => {
  const nextOwner = {}
  const nextAdd = { ...addMemberDraft.value }
  projectsOverview.value.forEach((p) => {
    nextOwner[p.id] = p.ownerUsername
    if (nextAdd[p.id] === undefined) nextAdd[p.id] = ''
  })
  projectOwnerDraft.value = nextOwner
  addMemberDraft.value = nextAdd
}

const saveProjectOwner = async (p) => {
  const id = String(p?.id || '').trim()
  const draft = String(projectOwnerDraft.value[id] ?? '').trim()
  if (!id || !draft || draft === p.ownerUsername) return
  isSaving.value = true
  manageMessage.value = ''
  try {
    await axios.put(
      `${API_URL}/projects/${encodeURIComponent(id)}`,
      { name: p.name, ownerUsername: draft },
      { timeout: 20000 }
    )
    manageMessage.value = `Владелец проекта «${p.name}» обновлён.`
    await loadProjectsOverview()
    await loadHistory()
  } catch (e) {
    manageMessage.value = e.response?.data?.error || 'Не удалось сменить владельца.'
  } finally {
    isSaving.value = false
  }
}

const addProjectMember = async (p) => {
  const u = String(addMemberDraft.value[p.id] || '').trim()
  if (!u) {
    manageMessage.value = 'Выберите пользователя для добавления в проект.'
    return
  }
  isSaving.value = true
  manageMessage.value = ''
  try {
    await axios.post(
      `${API_URL}/projects/${encodeURIComponent(p.id)}/members`,
      { username: u },
      { timeout: 20000 }
    )
    addMemberDraft.value = { ...addMemberDraft.value, [p.id]: '' }
    manageMessage.value = `Участник «${u}» добавлен в проект «${p.name}».`
    await loadProjectsOverview()
    await loadHistory()
  } catch (e) {
    manageMessage.value = e.response?.data?.error || 'Не удалось добавить участника.'
  } finally {
    isSaving.value = false
  }
}

const removeProjectMember = async (p, username) => {
  isSaving.value = true
  manageMessage.value = ''
  try {
    await axios.delete(`${API_URL}/projects/${encodeURIComponent(p.id)}/members`, {
      data: { username },
      timeout: 20000
    })
    manageMessage.value = `Участник «${username}» удалён из проекта «${p.name}».`
    await loadProjectsOverview()
    await loadHistory()
  } catch (e) {
    manageMessage.value = e.response?.data?.error || 'Не удалось удалить участника.'
  } finally {
    isSaving.value = false
  }
}

const loadProjectsOverview = async () => {
  loadingProjects.value = true
  projectsError.value = ''
  try {
    const { data } = await axios.get(`${API_URL}/users/projects-overview`, { timeout: 20000 })
    projectsOverview.value = Array.isArray(data) ? data : []
    syncProjectAdminDrafts()
    expandedProjectTrees.value = {}
    treeByProjectId.value = {}
    expandedStagesByProject.value = {}
  } catch (e) {
    projectsOverview.value = []
    projectsError.value =
      e.response?.status === 403 ? 'Нет доступа к списку проектов.' : 'Не удалось загрузить список проектов.'
  } finally {
    loadingProjects.value = false
  }
}

const onRoleDraftChange = (username) => {
  const nextRole = String(roleDraft.value[username] || 'user')
  permissionsDraft.value = {
    ...permissionsDraft.value,
    [username]: normalizePermissions(nextRole, permissionsDraft.value[username] || {})
  }
}

const togglePermission = (username, key, checked) => {
  permissionsDraft.value = {
    ...permissionsDraft.value,
    [username]: { ...(permissionsDraft.value[username] || {}), [key]: Boolean(checked) }
  }
}

const saveRole = async (row) => {
  const nextRole = String(roleDraft.value[row.username] || '').trim()
  if (!nextRole) return
  const nextPermissions = normalizePermissions(nextRole, permissionsDraft.value[row.username] || {})
  isSaving.value = true
  manageMessage.value = ''
  try {
    const note = String(noteDraft.value[row.username] ?? '')
    await axios.put(
      `${API_URL}/users/manage/${encodeURIComponent(row.username)}`,
      { role: nextRole, permissions: nextPermissions, note },
      { timeout: 20000 }
    )
    manageMessage.value = `Данные пользователя "${row.username}" сохранены.`
    await load({ silent: true })
    await loadProjectsOverview()
    await loadHistory()
  } catch (e) {
    manageMessage.value = e.response?.data?.error || 'Не удалось обновить роль и права.'
  } finally {
    isSaving.value = false
  }
}

const setUserPassword = async (usernameRaw) => {
  const username = String(usernameRaw || '').trim()
  const password = String(passwordDraft.value[username] || '').trim()
  if (!username || !password) {
    manageMessage.value = 'Введите новый пароль перед сохранением.'
    return
  }
  isSaving.value = true
  manageMessage.value = ''
  try {
    await axios.put(
      `${API_URL}/users/manage/${encodeURIComponent(username)}`,
      { password },
      { timeout: 20000 }
    )
    manageMessage.value = `Пароль пользователя "${username}" обновлён.`
    passwordDraft.value = { ...passwordDraft.value, [username]: '' }
    await load({ silent: true })
    await loadProjectsOverview()
    await loadHistory()
  } catch (e) {
    manageMessage.value = e.response?.data?.error || 'Не удалось обновить пароль.'
  } finally {
    isSaving.value = false
  }
}

const deleteConfirmMatches = computed(
  () =>
    Boolean(deleteTargetUsername.value) &&
    deleteConfirmInput.value.trim() === deleteTargetUsername.value.trim()
)

const openDeleteModal = () => {
  const row = activeUser.value
  if (!row || !canDeleteActiveUser.value) return
  deleteTargetUsername.value = String(row.username || '').trim()
  deleteConfirmInput.value = ''
  deleteModalOpen.value = true
}

const closeDeleteModal = () => {
  deleteModalOpen.value = false
  deleteTargetUsername.value = ''
  deleteConfirmInput.value = ''
}

watch(deleteModalOpen, async (open) => {
  if (!open) return
  await nextTick()
  deleteConfirmInputRef.value?.focus?.()
})

const confirmDeleteUser = async () => {
  const u = deleteTargetUsername.value.trim()
  if (!u || deleteConfirmInput.value.trim() !== u) return
  closeDeleteModal()
  isSaving.value = true
  manageMessage.value = ''
  try {
    await axios.delete(`${API_URL}/users/manage/${encodeURIComponent(u)}`, {
      data: { confirmUsername: u },
      timeout: 20000
    })
    manageMessage.value = `Пользователь «${u}» удалён.`
    removeDirectoryUserLocally(u)
    await load({ silent: true })
    removeDirectoryUserLocally(u)
    await loadProjectsOverview()
    await loadHistory()
  } catch (e) {
    manageMessage.value = e.response?.data?.error || 'Не удалось удалить пользователя.'
  } finally {
    isSaving.value = false
  }
}

const onCreateRoleChange = () => {
  createForm.value = {
    ...createForm.value,
    permissions: normalizePermissions(createForm.value.role, createForm.value.permissions || {})
  }
}

const toggleCreatePermission = (key, checked) => {
  createForm.value = {
    ...createForm.value,
    permissions: { ...(createForm.value.permissions || {}), [key]: Boolean(checked) }
  }
}

const upsertDirectoryRowAfterCreate = (row) => {
  const key = directoryUsernameKey(row?.username)
  if (!key) return
  const next = rows.value.filter((r) => directoryUsernameKey(r?.username) !== key)
  rows.value = [...next, { ...row }]
  initDrafts()
  bumpDirectoryListEpoch()
}

const createUser = async () => {
  const username = String(createForm.value.username || '').trim()
  const password = String(createForm.value.password || '').trim()
  const role = String(createForm.value.role || 'user').trim()
  const permissions = normalizePermissions(role, createForm.value.permissions || {})
  if (!username || !password) {
    manageMessage.value = 'Укажите логин и пароль нового пользователя.'
    return
  }
  isSaving.value = true
  manageMessage.value = ''
  try {
    const note = String(createForm.value.note || '').trim()
    const { data: created } = await axios.post(
      `${API_URL}/users/manage`,
      { username, password, role, permissions, note },
      { timeout: 20000 }
    )
    manageMessage.value = `Пользователь "${username}" добавлен.`
    createForm.value = { username: '', password: '', role: 'user', note: '', permissions: normalizePermissions('user', {}) }
    createPanelOpen.value = false
    const createdName = String(created?.username || username).trim()
    const createdRole = String(created?.role || role).trim()
    const createdPerms =
      created?.permissions && typeof created.permissions === 'object' && !Array.isArray(created.permissions)
        ? created.permissions
        : permissions
    const optimisticRow = {
      username: createdName,
      role: createdRole,
      permissions: normalizePermissions(createdRole, createdPerms || {}),
      note,
      passwordPlain: password,
      passwordHash: '',
      passwordNote: 'Исходный пароль пользователя.'
    }
    upsertDirectoryRowAfterCreate(optimisticRow)
    pushDirectoryPinBottom(createdName)
    selectedUsername.value = createdName
    await nextTick()
    document.getElementById(userListRowDomId(createdName))?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    await load({ silent: true })
    let serverRow = rows.value.find((r) => directoryUsernameKey(r?.username) === directoryUsernameKey(createdName))
    if (!serverRow) {
      upsertDirectoryRowAfterCreate(optimisticRow)
      pushDirectoryPinBottom(createdName)
      serverRow = rows.value.find((r) => directoryUsernameKey(r?.username) === directoryUsernameKey(createdName))
    }
    if (serverRow) {
      selectedUsername.value = String(serverRow.username || '').trim()
    } else {
      selectedUsername.value = optimisticRow.username
    }
    await nextTick()
    await loadProjectsOverview()
    await loadHistory()
    await nextTick()
    document.getElementById(userListRowDomId(selectedUsername.value))?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  } catch (e) {
    manageMessage.value = e.response?.data?.error || 'Не удалось добавить пользователя.'
  } finally {
    isSaving.value = false
  }
}

const userSelectOptions = computed(() => rows.value.map((row) => String(row?.username || '').trim()).filter(Boolean))

const displayUserRows = computed(() => {
  const byKey = new Map()
  rows.value.forEach((r) => {
    const k = directoryUsernameKey(r?.username)
    if (k) byKey.set(k, r)
  })
  const pinned = directoryKeysPinnedBottom.value.filter((k) => byKey.has(k))
  const pinnedSet = new Set(pinned)
  const rest = rows.value
    .filter((r) => !pinnedSet.has(directoryUsernameKey(r?.username)))
    .sort((a, b) => String(a?.username || '').localeCompare(String(b?.username || ''), 'ru'))
  const tail = pinned.map((k) => byKey.get(k)).filter(Boolean)
  return [...rest, ...tail]
})

const activeUser = computed(() => {
  const name = String(selectedUsername.value || '').trim()
  if (!name) return null
  const key = directoryUsernameKey(name)
  return rows.value.find((r) => directoryUsernameKey(r?.username) === key) || null
})

const canDeleteActiveUser = computed(() => {
  if (!activeUser.value) return false
  const uname = String(activeUser.value.username || '').trim().toLowerCase()
  const self = String(loginUsername.value || '').trim().toLowerCase()
  const architect = String(STAGING_ARCHITECT_USERNAME || '').trim().toLowerCase()
  if (!uname) return false
  if (uname === self) return false
  if (uname === architect) return false
  return true
})

const deleteUserDisabledReason = computed(() => {
  if (!activeUser.value) return ''
  const uname = String(activeUser.value.username || '').trim().toLowerCase()
  const self = String(loginUsername.value || '').trim().toLowerCase()
  const architect = String(STAGING_ARCHITECT_USERNAME || '').trim().toLowerCase()
  if (uname === self) return 'Нельзя удалить свою текущую учётную запись.'
  if (uname === architect) return 'Нельзя удалить основного владельца дорожной карты.'
  return ''
})

const roleOptionLabel = (roleRaw) => {
  const role = String(roleRaw || '').trim().toLowerCase()
  const item = roleOptions.find((x) => x.value === role)
  return item ? item.label : roleRaw || '—'
}

const selectUser = (username) => {
  selectedUsername.value = String(username || '').trim()
}

const userListRowDomId = (username) => `user-list-row-${encodeURIComponent(String(username || ''))}`

const userOptions = computed(() => [...new Set(historyRows.value.map((x) => String(x?.actorUsername || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')))
const stageOptions = computed(() => [...new Set(historyRows.value.map((x) => String(x?.blockTitle || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')))

const toDateOnlyTime = (dateLike) => {
  const d = new Date(dateLike)
  if (Number.isNaN(d.getTime())) return NaN
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

const filteredHistoryRows = computed(() => {
  const f = filters.value
  const userNeedle = String(f.user || '').trim().toLowerCase()
  const stageNeedle = String(f.stage || '').trim().toLowerCase()
  const taskNeedle = String(f.task || '').trim().toLowerCase()
  const fromMs = f.dateFrom ? new Date(`${f.dateFrom}T00:00:00`).getTime() : null
  const toMs = f.dateTo ? new Date(`${f.dateTo}T00:00:00`).getTime() : null
  return historyRows.value.filter((item) => {
    const actor = String(item?.actorUsername || '').toLowerCase()
    const stage = String(item?.blockTitle || item?.blockId || '').toLowerCase()
    const details = String(item?.details || '').toLowerCase()
    const itemDate = toDateOnlyTime(item?.createdAt)
    if (userNeedle && actor !== userNeedle) return false
    if (stageNeedle && stage !== stageNeedle) return false
    if (taskNeedle && !details.includes(taskNeedle)) return false
    if (fromMs !== null && Number.isFinite(itemDate) && itemDate < fromMs) return false
    if (toMs !== null && Number.isFinite(itemDate) && itemDate > toMs) return false
    return true
  })
})

const clearFilters = () => {
  filters.value = { user: '', stage: '', task: '', dateFrom: '', dateTo: '' }
}

const formatDateTime = (dateLike) => {
  if (!dateLike) return '—'
  const d = new Date(dateLike)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ru-RU')
}

onMounted(async () => {
  await load()
  await loadProjectsOverview()
  await loadHistory()
})
</script>

<style scoped>
.users-test {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px 24px;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
h2 { font-size: 1.2rem; margin-bottom: 12px; color: #0f172a; }
.muted { color: #64748b; font-size: 0.88rem; }
.err { color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 8px; }
.user-editor-layout {
  display: grid;
  /* Права | сетка пользователей | учётная запись (шире, ближе к центру) */
  grid-template-columns: minmax(200px, 0.72fr) minmax(160px, 0.92fr) minmax(280px, 1.18fr);
  gap: 12px;
  align-items: start;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  padding: 14px 16px 16px;
  min-height: 280px;
}
.user-col-title {
  margin: 0 0 10px 0;
  font-size: 0.82rem;
  font-weight: 700;
  color: #0f172a;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.user-col--center {
  border-left: 1px solid #e2e8f0;
  border-right: 1px solid #e2e8f0;
  padding: 0 10px;
  min-height: 200px;
  min-width: 0;
}
.user-col--right {
  min-width: 0;
}
.user-col--right .password-update-input {
  max-width: 100%;
}
.user-col-hint { margin: 0; font-size: 0.85rem; }
.user-list-select {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: min(420px, 62vh);
  overflow: auto;
}
.user-list-item {
  padding: 8px 10px 10px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  border: 1px solid #e8ecf0;
  background: #fff;
  box-shadow: none;
  transition: background 0.12s ease, border-color 0.12s ease;
  flex-shrink: 0;
  overflow: visible;
  line-height: 1.35;
}
.user-list-item:hover {
  background: #f8fafc;
  border-color: #dce3ea;
}
.user-list-item:focus {
  outline: none;
}
.user-list-item:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 1px;
}
.user-list-item--active {
  background: #eff6ff;
  border-color: #bfdbfe;
  box-shadow: none;
}
.user-list-name {
  font-family: inherit;
  font-weight: 600;
  font-size: 0.78rem;
  line-height: 1.35;
  color: #334155;
  word-break: break-word;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  flex-shrink: 0;
  transition: font-weight 0.1s ease, color 0.1s ease;
}
.user-list-item--active .user-list-name {
  font-weight: 800;
  color: #0f172a;
}
.user-list-role {
  font-size: 0.64rem;
  color: #64748b;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
  min-height: 1.4em;
}
.user-list-item--active .user-list-role {
  color: #475569;
}
.account-field {
  margin-bottom: 22px;
}
.account-field:last-child {
  margin-bottom: 0;
}
.field-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  color: #475569;
  margin-bottom: 8px;
}
.account-login {
  display: inline-block;
  font-size: 0.88rem;
  padding: 6px 10px;
  background: #f8fafc;
  border-radius: 6px;
  margin-top: 2px;
}
.role-select--wide {
  width: 100%;
  max-width: 100%;
}
.note-textarea {
  width: 100%;
  max-width: 100%;
  min-height: 110px;
  margin-top: 4px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 0.8rem;
  line-height: 1.45;
  resize: vertical;
  box-sizing: border-box;
  font-family: inherit;
}
.save-perms-btn {
  margin-top: 12px;
}
.tbl { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
.tbl th, .tbl td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
.tbl th { background: #f8fafc; color: #475569; font-weight: 600; }
.mono { font-family: ui-monospace, monospace; font-weight: 600; }
.pwd code { font-size: 0.82rem; word-break: break-all; }
.password-update-row { margin-top: 12px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.password-update-input {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 0.76rem;
  min-width: 140px;
  flex: 1;
  max-width: 220px;
}
.hint { font-size: 0.75rem; color: #64748b; margin-top: 8px; max-width: 100%; line-height: 1.45; }
.perm-grid { display: grid; grid-template-columns: repeat(2, minmax(140px, 1fr)); gap: 6px 10px; }
.perm-grid--single { max-width: 420px; }
.perm-grid--create { margin-top: 8px; }
.perm-item { display: inline-flex; align-items: center; gap: 6px; font-size: 0.74rem; color: #334155; }
.role-select, .create-grid input, .create-grid select { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; font-size: 0.78rem; background: #fff; }
.action-btn { border: 1px solid #93c5fd; border-radius: 6px; background: #eff6ff; color: #1d4ed8; font-size: 0.76rem; font-weight: 600; padding: 6px 8px; cursor: pointer; width: fit-content; }
.action-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.account-field--delete {
  margin-top: 8px;
  padding-top: 18px;
  border-top: 1px solid #e8ecf0;
}
.danger-btn {
  border: 1px solid #fecaca;
  border-radius: 6px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 8px 12px;
  cursor: pointer;
  width: fit-content;
}
.danger-btn:hover:not(:disabled) {
  background: #fee2e2;
  border-color: #f87171;
}
.danger-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.delete-hint {
  margin: 8px 0 0;
  font-size: 0.76rem;
  line-height: 1.35;
  max-width: 280px;
}
.delete-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.35);
  box-sizing: border-box;
  backdrop-filter: blur(2px);
}
.delete-modal {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 10px 40px rgba(15, 23, 42, 0.12), 0 2px 8px rgba(15, 23, 42, 0.06);
  padding: 22px 24px 20px;
  box-sizing: border-box;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 0.875rem;
  line-height: 1.5;
  color: #334155;
  -webkit-font-smoothing: antialiased;
}
.delete-modal-title {
  margin: 0 0 14px;
  font-size: 1.02rem;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.01em;
  font-family: inherit;
  line-height: 1.35;
}
.delete-modal-text {
  margin: 0 0 16px;
  font-size: 0.875rem;
  line-height: 1.5;
  color: #334155;
}
.delete-modal-code {
  font-family: ui-monospace, monospace;
  font-size: 0.9em;
  font-weight: 600;
  background: #f1f5f9;
  padding: 2px 7px;
  border-radius: 5px;
  color: #0f172a;
  border: 1px solid #e2e8f0;
}
.delete-modal-label {
  margin: 0 0 8px;
  font-size: 0.78rem;
  font-weight: 600;
  color: #475569;
}
.delete-modal-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.875rem;
  font-family: ui-monospace, monospace;
  margin-bottom: 18px;
  color: #0f172a;
  background: #fff;
}
.delete-modal-input:focus {
  outline: none;
  border-color: #93c5fd;
  box-shadow: 0 0 0 3px rgba(147, 197, 253, 0.28);
}
.delete-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}
.modal-btn {
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 8px 16px;
  cursor: pointer;
  border: 1px solid transparent;
  font-family: inherit;
}
.modal-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.modal-btn--secondary {
  background: #fff;
  border-color: #cbd5e1;
  color: #334155;
}
.modal-btn--secondary:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #94a3b8;
}
.modal-btn--danger {
  background: #fff;
  border-color: #fca5a5;
  color: #b91c1c;
}
.modal-btn--danger:hover:not(:disabled) {
  background: #fff1f2;
  border-color: #f87171;
  color: #991b1b;
}
.create-panel { margin-top: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; padding: 10px 12px; }
.create-panel-toggle { width: 100%; display: flex; justify-content: space-between; align-items: center; border: none; background: transparent; color: #0f172a; font-size: 0.9rem; font-weight: 700; padding: 0; cursor: pointer; }
.create-panel-body { margin-top: 8px; }
.create-grid { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 8px; }
.create-grid--with-note .create-note {
  grid-column: 1 / -1;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 0.78rem;
  resize: vertical;
  min-height: 52px;
  font-family: inherit;
}
@media (max-width: 960px) {
  .user-editor-layout {
    grid-template-columns: 1fr;
  }
  .user-col--center {
    border-left: none;
    border-right: none;
    border-top: 1px solid #e2e8f0;
    border-bottom: 1px solid #e2e8f0;
    padding: 12px 0;
  }
  .user-list-select {
    max-height: 200px;
  }
}
.manage-msg { margin-top: 10px; font-size: 0.78rem; color: #334155; }
.projects-panel { margin-top: 14px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; padding: 12px; }
.projects-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.projects-head h3 { margin: 0; font-size: 0.96rem; color: #0f172a; }
.projects-head-actions { display: flex; align-items: center; gap: 10px; }
.projects-count { font-size: 0.78rem; color: #64748b; }
.projects-table-wrap { border: 1px solid #f1f5f9; border-radius: 8px; overflow: auto; max-height: 360px; }
/* separate + border-spacing:0 — ровная одна линия под шапкой без «ступеньки» между колонками */
.tbl--projects {
  font-size: 0.84rem;
  border-collapse: separate;
  border-spacing: 0;
}
.tbl--projects thead th {
  vertical-align: middle;
  padding: 12px;
  box-sizing: border-box;
  line-height: 1.25;
  border-top: none;
  border-left: none;
  border-right: none;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #475569;
  font-weight: 600;
}
.tbl--projects th:nth-child(2),
.tbl--projects td:nth-child(2) { min-width: 140px; }
.tbl--projects th:nth-child(3),
.tbl--projects td:nth-child(3) { min-width: 200px; }
.tbl--projects tbody > tr:not(.tree-row) > td {
  vertical-align: middle;
  padding: 12px;
  box-sizing: border-box;
  border-top: none;
}
/* Одна min-height для всех ячеек строки — как у владельца/участников (~56.88px с контролами) */
.tbl--projects tbody > tr:not(.tree-row) > td.name-cell,
.tbl--projects tbody > tr:not(.tree-row) > td.owner-cell-wrap,
.tbl--projects tbody > tr:not(.tree-row) > td.members-cell-wrap,
.tbl--projects tbody > tr:not(.tree-row) > td:nth-child(4) {
  min-height: 56.88px;
}
/* Строка проекта сразу над раскрытым деревом — без лишнего зазора снизу */
.tbl--projects tbody > tr:not(.tree-row):has(+ tr.tree-row) > td {
  padding-bottom: 0;
}
.tbl--projects tbody > tr.tree-row > td {
  padding: 0 12px 12px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  border-top: none;
  vertical-align: top;
}
.owner-cell-wrap,
.members-cell-wrap {
  vertical-align: middle;
}
.owner-admin-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.members-admin-combined {
  display: flex;
  flex-flow: row wrap;
  align-items: center;
  gap: 8px 10px;
}
.project-admin-select {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 0.76rem;
  max-width: 200px;
  min-height: 32px;
  box-sizing: border-box;
  line-height: 1.25;
  background: #fff;
}
.member-chips-admin {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  flex: 1 1 auto;
  min-width: 0;
}
.members-empty-dash {
  line-height: 1;
  flex-shrink: 0;
}
.member-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 0.74rem;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 2px 4px 2px 8px;
}
.member-chip-name { font-family: ui-monospace, monospace; color: #0f172a; }
.member-chip-remove {
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0 4px;
  border-radius: 4px;
}
.member-chip-remove:hover:not(:disabled) {
  color: #b91c1c;
  background: #fef2f2;
}
.add-member-row {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}
/* Фиксированная ширина: иначе select растягивается под самый длинный option и строки «плывут» */
.add-member-row .project-admin-select {
  width: 200px;
  min-width: 200px;
  max-width: 200px;
  flex-shrink: 0;
}
.members-cell { font-size: 0.8rem; color: #334155; line-height: 1.35; word-break: break-word; }
.tbl--projects .name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.project-name-text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
  line-height: 1.35;
  display: flex;
  align-items: center;
  font-family: inherit;
}
.project-tree-caret {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  padding: 0;
  margin-top: 0;
  color: #2563eb;
}
.project-tree-caret:hover:not(:disabled) {
  background: rgba(37, 99, 235, 0.08);
}
.project-tree-caret:disabled {
  opacity: 0.55;
  cursor: wait;
}
.project-tree-caret-icon {
  font-size: 1.45rem;
  font-weight: 600;
  line-height: 1;
  transform: rotate(0deg);
  transition: transform 0.16s ease;
}
.project-tree-caret-icon--expanded {
  transform: rotate(90deg);
}
.tbl--projects .tree-inner {
  padding: 0 10px 10px 12px;
}
.tree-err { margin: 0; padding: 8px 10px; font-size: 0.8rem; }
.project-tree {
  font-size: 0.82rem;
  color: #1e293b;
  font-family: inherit;
}
.stage-tree-root { margin: 0; padding: 0 0 0 4px; list-style: none; }
.stage-tree-node { margin: 0 0 10px 0; padding: 0; }
.stage-tree-node:last-child { margin-bottom: 0; }
.stage-tree-line {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-weight: 600;
  font-family: inherit;
}
.stage-tree-caret-spacer {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  margin-top: 1px;
}
.stage-tree-title {
  color: #0f172a;
  flex: 1;
  min-width: 0;
  font-family: inherit;
}
.task-tree-root { margin: 4px 0 0 0; padding: 0 0 0 18px; list-style: none; }
.task-tree-node { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 3px 0; color: #334155; font-weight: 400; }
.task-tree-marker { color: #94a3b8; font-size: 0.75rem; font-family: ui-monospace, monospace; flex-shrink: 0; }
.task-tree-title {
  flex: 1;
  min-width: 0;
  font-family: inherit;
}
.task-tree-status {
  font-size: 0.72rem;
  color: #475569;
  background: #e2e8f0;
  border-radius: 999px;
  padding: 1px 8px;
  white-space: nowrap;
  flex-shrink: 0;
}
.task-tree-empty { margin: 4px 0 0 18px; font-size: 0.78rem; }
.history-panel { margin-top: 14px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; padding: 12px; }
.history-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.history-head h3 { margin: 0; font-size: 0.96rem; color: #0f172a; }
.history-head-actions { display: flex; align-items: center; gap: 10px; }
.history-count { font-size: 0.78rem; color: #64748b; }
.history-filters { display: grid; grid-template-columns: 1.1fr 1.2fr 1.4fr 0.9fr 0.9fr auto; gap: 8px; margin-bottom: 10px; }
.history-filter { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.history-filter span { font-size: 0.72rem; color: #475569; font-weight: 600; }
.history-filter input, .history-filter select { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; font-size: 0.78rem; background: #fff; }
.clear-filters-btn { align-self: end; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; color: #475569; font-size: 0.78rem; font-weight: 600; padding: 6px 10px; cursor: pointer; }
.refresh-btn { border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; color: #334155; font-size: 0.78rem; font-weight: 600; padding: 5px 9px; cursor: pointer; }
.history-list { display: flex; flex-direction: column; gap: 8px; max-height: 600px; overflow: auto; padding-right: 2px; }
.history-item { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; background: #f8fafc; }
.history-item-top { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 4px; }
.history-time { color: #475569; font-size: 0.75rem; }
.history-actor { font-weight: 700; color: #0f172a; font-size: 0.8rem; }
.history-action { font-size: 0.75rem; color: #1d4ed8; background: #dbeafe; border-radius: 999px; padding: 2px 8px; }
.history-block { font-size: 0.76rem; color: #334155; margin-bottom: 3px; }
.history-details { font-size: 0.75rem; color: #475569; line-height: 1.35; white-space: pre-wrap; word-break: break-word; }
</style>
