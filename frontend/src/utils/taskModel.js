/**
 * Модель задачи этапа: зависимости как список id предшественников в том же этапе (FS).
 * Хранится в JSON поля block.tasks на бэкенде — отдельная миграция БД не нужна.
 *
 * @typedef {Object} RoadmapTask
 * @property {string} id
 * @property {string} [title]
 * @property {string} [linkUrl]
 * @property {string} [linkNote]
 * @property {string} [status]
 * @property {number} [order]
 * @property {string[]} [predecessorIds] — id задач этого же этапа, от которых зависит данная
 */

/** Нормализует массив predecessorIds: только непустые строки, без дублей. */
export function normalizePredecessorIds(raw) {
  if (!raw) return []
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((id) => typeof id === 'string' && id.length > 0))]
}

/** Приводит тип связи к допустимому значению (FS по умолчанию). */
export function normalizeDependencyType(rawType) {
  const normalized = String(rawType || '').toUpperCase()
  if (normalized === 'SS' || normalized === 'FF' || normalized === 'SF') return normalized
  return 'FS'
}

/** Нормализует лаг в днях: целое число, 0 при невалидном вводе. */
export function normalizeLagDays(rawLag) {
  const n = Number(rawLag)
  if (!Number.isFinite(n)) return 0
  return Math.trunc(n)
}

/** Нормализует массив типовых связей задачи, удаляя дубликаты и мусорные значения. */
export function normalizePredecessorLinks(rawLinks) {
  if (!Array.isArray(rawLinks)) return []
  const out = []
  const seen = new Set()
  for (const item of rawLinks) {
    if (!item || typeof item !== 'object') continue
    const rawPredId = item.predId
    if (typeof rawPredId !== 'string' || !rawPredId) continue
    const predId = rawPredId
    const type = normalizeDependencyType(item.type)
    const lagDays = normalizeLagDays(item.lagDays)
    const key = `${predId}::${type}::${lagDays}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ predId, type, lagDays })
  }
  return out
}

/**
 * Возвращает нормализованный список зависимостей задачи:
 * - приоритет у `predecessorLinks` (типовые связи),
 * - fallback на legacy `predecessorIds` (FS, lag=0).
 */
export function getTaskDependencyLinks(task) {
  const links = normalizePredecessorLinks(task?.predecessorLinks)
  if (links.length) return links
  return normalizePredecessorIds(task?.predecessorIds).map((predId) => ({
    predId,
    type: 'FS',
    lagDays: 0
  }))
}

export function normalizeTask(task) {
  if (!task || typeof task !== 'object') return task
  const rawLink =
    (typeof task.linkUrl === 'string' && task.linkUrl) ||
    (typeof task.link === 'string' && task.link) ||
    (typeof task.url === 'string' && task.url) ||
    ''
  const linkUrl = typeof rawLink === 'string' ? rawLink.trim() : ''
  const linkNote = typeof task.linkNote === 'string' ? task.linkNote.trim() : ''
  const predecessorLinks = normalizePredecessorLinks(task.predecessorLinks)
  const predecessorIds = predecessorLinks.length
    ? normalizePredecessorIds(predecessorLinks.map((l) => l.predId))
    : normalizePredecessorIds(task.predecessorIds)
  return {
    ...task,
    linkUrl,
    linkNote,
    predecessorIds,
    predecessorLinks
  }
}

/** Нормализует весь массив задач этапа. */
export function normalizeTasksArray(tasks) {
  if (!Array.isArray(tasks)) return []
  const seenTaskIds = new Set()
  return tasks.map((rawTask, index) => {
    const task = normalizeTask(rawTask)
    const rawId = String(task?.id || '').trim()
    let nextId = rawId || `task-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`
    if (seenTaskIds.has(nextId)) {
      // Защита от коллизий key в Vue/DynamicScroller: дубликаты id должны стать уникальными.
      nextId = `${nextId}-dup-${index}-${Math.random().toString(36).slice(2, 6)}`
    }
    seenTaskIds.add(nextId)
    return { ...task, id: nextId }
  })
}

/** Удалить removedTaskId из predecessorIds у всех задач (после удаления задачи). */
export function removePredecessorIdFromAllTasks(tasks, removedTaskId) {
  if (!tasks?.length || !removedTaskId) return tasks || []
  return tasks.map((t) => ({
    ...t,
    predecessorIds: normalizePredecessorIds(t.predecessorIds).filter((id) => id !== removedTaskId),
    predecessorLinks: normalizePredecessorLinks(t.predecessorLinks).filter((link) => link.predId !== removedTaskId)
  }))
}

/** Оставить только предшественников, чьи id есть в allowedIds. */
export function filterPredecessorsToExistingTasks(task, allowedIds) {
  const set = allowedIds instanceof Set ? allowedIds : new Set(allowedIds || [])
  const predecessorLinks = normalizePredecessorLinks(task.predecessorLinks).filter((link) => set.has(link.predId))
  return {
    ...task,
    predecessorIds: normalizePredecessorIds(task.predecessorIds).filter((id) => set.has(id)),
    predecessorLinks
  }
}
