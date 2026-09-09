/** Макс. символов контекста проекта в промпт (оставляем место под историю и ответ). */
const MAX_CONTEXT_CHARS = 28_000

const statusRu = (s) => {
  const v = String(s || '').trim()
  if (v === 'done') return 'выполнено'
  if (v === 'progress') return 'в работе'
  if (v === 'todo') return 'не начато'
  return v || '—'
}

/**
 * Текстовый снимок проекта для системного промпта ассистента.
 * @param {object|null} project — Sequelize Project
 * @param {object[]} blocks — этапы с полем tasks (массив)
 */
export function formatProjectContextForAssistant(project, blocks) {
  const name = project?.name ? String(project.name) : 'Без названия'
  const pid = project?.id != null ? String(project.id) : ''
  const lines = []
  lines.push(`Название проекта: «${name}»`)
  if (pid) lines.push(`ID проекта: ${pid}`)
  lines.push(`Число этапов: ${Array.isArray(blocks) ? blocks.length : 0}`)
  lines.push('')

  const list = Array.isArray(blocks) ? blocks : []
  list.forEach((b, idx) => {
    const title = String(b?.title || 'Без названия').trim()
    const bid = b?.id != null ? String(b.id) : `этап-${idx + 1}`
    lines.push(`## Этап ${idx + 1}: ${title} (id: ${bid})`)
    if (b?.startDate) lines.push(`- старт: ${b.startDate}`)
    if (b?.releaseDate) lines.push(`- релиз: ${b.releaseDate}`)
    if (b?.effort != null && b.effort !== '') lines.push(`- трудозатраты (усл. ед.): ${b.effort}`)
    if (typeof b?.completed === 'boolean') lines.push(`- этап отмечен выполненным: ${b.completed ? 'да' : 'нет'}`)
    const desc = String(b?.description || '').trim()
    if (desc) lines.push(`- описание: ${desc.slice(0, 500)}${desc.length > 500 ? '…' : ''}`)

    const tasks = Array.isArray(b?.tasks) ? b.tasks : []
    if (!tasks.length) {
      lines.push('- задачи: нет')
    } else {
      lines.push('- задачи:')
      tasks.forEach((t, ti) => {
        const tid = t?.id != null ? String(t.id) : `t${ti + 1}`
        const ttitle = String(t?.title || 'Без названия').trim()
        const st = statusRu(t?.status)
        const preds = Array.isArray(t?.predecessorIds) ? t.predecessorIds.filter(Boolean).join(', ') : ''
        const link = t?.linkUrl ? String(t.linkUrl).trim() : ''
        let row = `  • [${tid}] ${ttitle} — ${st}`
        if (preds) row += `; после задач id: ${preds}`
        if (link) row += `; ссылка: ${link}`
        lines.push(row)
      })
    }
    lines.push('')
  })

  let text = lines.join('\n').trim()
  if (text.length > MAX_CONTEXT_CHARS) {
    text = `${text.slice(0, MAX_CONTEXT_CHARS)}\n\n[…данные обрезаны из‑за лимита размера…]`
  }
  return text
}

const taskStats = (tasksLike) => {
  const tasks = Array.isArray(tasksLike) ? tasksLike : []
  let todo = 0
  let progress = 0
  let done = 0
  for (const task of tasks) {
    if (task?.status === 'done') done += 1
    else if (task?.status === 'progress') progress += 1
    else todo += 1
  }
  return { total: tasks.length, todo, progress, done }
}

/**
 * Краткая числовая сводка по проекту (только из переданных этапов).
 */
export function formatExecutiveStatsAppendix(project, blocks) {
  const name = project?.name ? String(project.name) : 'Без названия'
  const list = Array.isArray(blocks) ? blocks : []
  let totalTasks = 0
  let sumTodo = 0
  let sumProg = 0
  let sumDone = 0
  let emptyStages = 0
  const starts = []
  const ends = []
  let completedStages = 0
  for (const b of list) {
    const ts = taskStats(b?.tasks)
    totalTasks += ts.total
    sumTodo += ts.todo
    sumProg += ts.progress
    sumDone += ts.done
    if (!ts.total) emptyStages += 1
    if (b?.completed === true) completedStages += 1
    if (b?.startDate) starts.push(String(b.startDate))
    if (b?.releaseDate) ends.push(String(b.releaseDate))
  }
  const minStart = starts.length ? starts.sort()[0] : '—'
  const maxEnd = ends.length ? ends.sort().slice(-1)[0] : '—'
  const lines = [
    `### Сводные показатели (факты) для «${name}»`,
    `- Этапов: ${list.length} (отмечено выполненными: ${completedStages})`,
    `- Задач всего: ${totalTasks} (не начато: ${sumTodo}, в работе: ${sumProg}, выполнено: ${sumDone})`,
    `- Этапов без задач: ${emptyStages}`,
    `- Диапазон дат этапов (по полям start/release): с ${minStart} по ${maxEnd}`
  ]
  return lines.join('\n')
}

/**
 * Снимок двух этапов по порядковым номерам в списке (1-based), после той же сортировки, что у ассистента.
 * @param {object[]} blocksSorted — уже отсортированный массив этапов
 * @param {number} index1
 * @param {number} index2
 */
export function formatTwoStagesCompareAppendix(blocksSorted, index1, index2) {
  const list = Array.isArray(blocksSorted) ? blocksSorted : []
  const i1 = Math.floor(Number(index1))
  const i2 = Math.floor(Number(index2))
  const pick = (n) => {
    if (!Number.isFinite(n) || n < 1 || n > list.length) return null
    return { idx: n, block: list[n - 1] }
  }
  const a = pick(i1)
  const b = pick(i2)
  if (!a || !b) {
    return `### Сравнение этапов\nЗапрошены этапы №${i1} и №${i2}, но в проекте только ${list.length} этап(ов). Уточните номера.`
  }
  const fmtStage = (label, idx, b) => {
    const title = String(b?.title || 'Без названия').trim()
    const lines = [
      `#### ${label} (этап ${idx} в дорожной карте): «${title}»`,
      b?.startDate ? `- старт: ${b.startDate}` : null,
      b?.releaseDate ? `- релиз: ${b.releaseDate}` : null,
      typeof b?.completed === 'boolean' ? `- этап выполнен: ${b.completed ? 'да' : 'нет'}` : null,
      b?.effort != null && b.effort !== '' ? `- трудозатраты: ${b.effort}` : null
    ].filter(Boolean)
    const tasks = Array.isArray(b?.tasks) ? b.tasks : []
    if (!tasks.length) lines.push('- задачи: нет')
    else {
      lines.push('- задачи:')
      tasks.forEach((t, ti) => {
        const tid = t?.id != null ? String(t.id) : `t${ti + 1}`
        const ttitle = String(t?.title || 'Без названия').trim()
        const st = statusRu(t?.status)
        lines.push(`  • [${tid}] ${ttitle} — ${st}`)
      })
    }
    return lines.join('\n')
  }
  return [
    '### Два этапа для сравнения (только факты из данных выше; общий список этапов см. в блоке проекта)',
    fmtStage('Этап A', i1, a.block),
    '',
    fmtStage('Этап B', i2, b.block),
    '',
    'Сравни по: объёму задач, статусам, срокам, рискам просрочки, пересечению тем. Не придумывай задач вне списков.'
  ].join('\n')
}

const formatAuditRow = (row) => {
  const when = row?.createdAt ? new Date(row.createdAt).toISOString().slice(0, 19).replace('T', ' ') : '—'
  const who = row?.actorUsername ? String(row.actorUsername) : '—'
  const act = row?.actionLabel || row?.action || '—'
  const block = row?.blockTitle ? String(row.blockTitle) : ''
  const det = row?.details ? String(row.details).trim().slice(0, 400) : ''
  const tail = [block && `этап: «${block}»`, det && `детали: ${det}`].filter(Boolean).join('; ')
  return `- ${when} | ${who} | ${act}${tail ? ` | ${tail}` : ''}`
}

/**
 * @param {object[]} rows — записи аудита (уже отфильтрованы по проекту и дате)
 */
export function formatProjectAuditDigestAppendix(rows, { maxLines = 60 } = {}) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) {
    return '### Журнал изменений по этапам этого проекта (аудит)\nЗа выбранный период записей по этапам проекта нет.'
  }
  const slice = list.slice(0, maxLines)
  const lines = slice.map(formatAuditRow)
  const more = list.length > maxLines ? `\n… и ещё ${list.length - maxLines} записей (не показаны из‑за лимита).` : ''
  return ['### Журнал изменений по этапам этого проекта (аудит, только чтение)', ...lines].join('\n') + more
}

/**
 * Добавляет к основному контексту проекта фрагмент (с отдельным лимитом на сегмент).
 * @param {string} projectContext
 * @param {string} segment
 */
export function appendAssistantContextSegment(projectContext, segment, { maxSegmentChars = 14_000 } = {}) {
  const base = String(projectContext || '').trim()
  let seg = String(segment || '').trim()
  if (!seg) return base
  if (seg.length > maxSegmentChars) {
    seg = `${seg.slice(0, maxSegmentChars)}\n[…сегмент обрезан…]`
  }
  const merged = `${base}\n\n${seg}`.trim()
  if (merged.length > MAX_CONTEXT_CHARS) {
    return `${merged.slice(0, MAX_CONTEXT_CHARS)}\n\n[…данные обрезаны из‑за лимита размера…]`
  }
  return merged
}

