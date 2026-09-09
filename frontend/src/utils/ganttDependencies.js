import { normalizePredecessorIds, normalizePredecessorLinks, getTaskDependencyLinks, normalizeDependencyType, normalizeLagDays } from './taskModel'

// Helpers сравнения id в едином строковом формате.
const idKey = (value) => String(value)
const idsEqual = (a, b) => idKey(a) === idKey(b)

/**
 * Есть ли путь по рёбрам «X зависит от Y» от fromTaskId к toTaskId в направлении «кто ждёт кого»:
 * из T идём к задачам, у которых T указан как предшественник (они идут после T).
 */
export function hasSuccessorPath(tasks, fromTaskId, toTaskId) {
  if (idsEqual(fromTaskId, toTaskId)) return true
  const visited = new Set()
  const stack = [fromTaskId]
  while (stack.length) {
    const id = stack.pop()
    const key = idKey(id)
    if (key === idKey(toTaskId)) return true
    if (visited.has(key)) continue
    visited.add(key)
    for (const t of tasks) {
      if (getTaskDependencyLinks(t).some((dep) => idsEqual(dep.predId, id))) {
        stack.push(t.id)
      }
    }
  }
  return false
}

function cloneBlockTasks(block) {
  return (block.tasks || []).map((t) => ({
    ...t,
    predecessorIds: normalizePredecessorIds(t.predecessorIds),
    predecessorLinks: normalizePredecessorLinks(t.predecessorLinks),
  }))
}

// Извлекает predecessorIds из набора predecessorLinks.
const depIdsFromLinks = (links) => normalizePredecessorIds((links || []).map((l) => l.predId))

/** Заменить одного предшественника у задачи-преемника (та же связь FS). */
export function applyReplacePredecessor(block, succId, oldPredId, newPredId) {
  const tasks = cloneBlockTasks(block)
  const succ = tasks.find((t) => idsEqual(t.id, succId))
  if (!succ || !getTaskDependencyLinks(succ).some((dep) => idsEqual(dep.predId, oldPredId))) return null
  if (idsEqual(succId, newPredId) || idsEqual(oldPredId, newPredId)) return null
  const links = getTaskDependencyLinks(succ).map((dep) =>
    idsEqual(dep.predId, oldPredId)
      ? { ...dep, predId: String(newPredId), type: normalizeDependencyType(dep.type), lagDays: normalizeLagDays(dep.lagDays) }
      : { ...dep, predId: String(dep.predId), type: normalizeDependencyType(dep.type), lagDays: normalizeLagDays(dep.lagDays) }
  )
  const uniqLinks = []
  for (const dep of links) {
    if (!uniqLinks.some((u) => idsEqual(u.predId, dep.predId) && normalizeDependencyType(u.type) === normalizeDependencyType(dep.type) && normalizeLagDays(u.lagDays) === normalizeLagDays(dep.lagDays))) {
      uniqLinks.push(dep)
    }
  }
  succ.predecessorLinks = uniqLinks
  succ.predecessorIds = depIdsFromLinks(uniqLinks)
  if (hasSuccessorPath(tasks, succId, newPredId)) return null
  return { ...block, tasks }
}

/** Добавить предшественника (ребро pred → succ в смысле FS). */
export function applyAddPredecessor(block, succId, predId) {
  const tasks = cloneBlockTasks(block)
  const succ = tasks.find((t) => idsEqual(t.id, succId))
  if (!succ || idsEqual(succId, predId)) return null
  const links = getTaskDependencyLinks(succ)
  if (links.some((dep) => idsEqual(dep.predId, predId))) return null
  const nextLinks = [...links, { predId: String(predId), type: 'FS', lagDays: 0 }]
  succ.predecessorLinks = nextLinks
  succ.predecessorIds = depIdsFromLinks(nextLinks)
  if (hasSuccessorPath(tasks, succId, predId)) return null
  return { ...block, tasks }
}

/** Перенести зависимость pred → oldSucc на pred → newSucc. */
export function applyMoveSuccessor(block, predId, oldSuccId, newSuccId) {
  const tasks = cloneBlockTasks(block)
  const oldS = tasks.find((t) => idsEqual(t.id, oldSuccId))
  const newS = tasks.find((t) => idsEqual(t.id, newSuccId))
  if (!oldS || !newS) return null
  const oldLinks = getTaskDependencyLinks(oldS)
  const linkToMove = oldLinks.find((dep) => idsEqual(dep.predId, predId))
  if (!linkToMove) return null
  if (idsEqual(newSuccId, predId) || idsEqual(oldSuccId, newSuccId)) return null
  const newLinks = getTaskDependencyLinks(newS)
  if (newLinks.some((dep) => idsEqual(dep.predId, predId))) return null
  const oldNextLinks = oldLinks.filter((dep) => !idsEqual(dep.predId, predId))
  const newNextLinks = [...newLinks, { ...linkToMove, predId: String(predId) }]
  oldS.predecessorLinks = oldNextLinks
  oldS.predecessorIds = depIdsFromLinks(oldNextLinks)
  newS.predecessorLinks = newNextLinks
  newS.predecessorIds = depIdsFromLinks(newNextLinks)
  if (hasSuccessorPath(tasks, newSuccId, predId)) return null
  return { ...block, tasks }
}
