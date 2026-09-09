/** Режимы только чтения: без мутаций этапов/задач из чата. */

const EXPLICIT_MODES = new Set(['default', 'executive_summary', 'weekly_digest', 'stage_compare'])

/**
 * @param {unknown} v
 * @returns {'default'|'executive_summary'|'weekly_digest'|'stage_compare'|null}
 */
export function normalizeExplicitAssistantMode(v) {
  const s = String(v || '').trim()
  return EXPLICIT_MODES.has(s) ? /** @type {any} */ (s) : null
}

/**
 * Извлекает два номера этапа (1-based) из текста.
 * @param {string} text
 * @returns {{ a: number, b: number } | null}
 */
export function parseStageCompareIndicesFromText(text) {
  const t = String(text || '').trim()
  if (!t) return null

  const m1 = t.match(/этап(?:ы|ов)?\s*[№#]?\s*(\d+)\s*(?:и|vs|\/|—|-|–)\s*[№#]?\s*(\d+)/i)
  if (m1) {
    const a = Number(m1[1])
    const b = Number(m1[2])
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0 && a !== b) return { a, b }
  }

  const m2 = t.match(/(\d+)\s*[-‑]\s*(?:го|й|м|х)?\s*этап(?:а)?\s+(?:и|с|vs)\s+(\d+)\s*[-‑]?\s*(?:го|й|м|х)?\s*этап/i)
  if (m2) {
    const a = Number(m2[1])
    const b = Number(m2[2])
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0 && a !== b) return { a, b }
  }

  const m3 = t.match(/сравни(?:ть)?\s+(?:этапы\s+)?(\d+)\s+и\s+(\d+)/i)
  if (m3) {
    const a = Number(m3[1])
    const b = Number(m3[2])
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0 && a !== b) return { a, b }
  }

  return null
}

/**
 * @param {string} text
 * @returns {'executive_summary'|'weekly_digest'|'stage_compare'|null}
 */
export function inferReadOnlyModeFromUserText(text) {
  const t = String(text || '').trim()
  if (!t) return null
  const low = t.toLowerCase()

  if (/executive\s*summary/i.test(t)) return 'executive_summary'
  if (/(резюме|обзор).{0,80}(для|для\s+)(руководства|руководству|топ-менеджмент)/i.test(t)) return 'executive_summary'
  if (/кратк(ое|ий)\s+(резюме|обзор)\s+проекта/i.test(low)) return 'executive_summary'
  if (/руководств/i.test(low) && /(страниц|слайд|deck|one-?pager)/i.test(low)) return 'executive_summary'

  if (
    (/что\s+изменил(ось|ись)/i.test(low) || /какие\s+изменен/i.test(low)) &&
    /(неделю|7\s*дн|семь\s*дн|последн(ие|их)\s+7)/i.test(low)
  ) {
    return 'weekly_digest'
  }
  if (/изменен(ия|ий)\s+за\s+(неделю|7)/i.test(low)) return 'weekly_digest'

  if (/(сравни|сравнение|сопостав)/i.test(low) && /этап/i.test(low)) return 'stage_compare'

  return null
}

/**
 * @param {{
 *   explicitMode: string | null | undefined
 *   lastUserText: string
 *   compareStageIndexA?: unknown
 *   compareStageIndexB?: unknown
 * }} p
 * @returns {{
 *   mode: 'default'|'executive_summary'|'weekly_digest'|'stage_compare'
 *   compareA: number | null
 *   compareB: number | null
 * }}
 */
export function resolveAssistantReadOnlyPlan(p) {
  const explicit = normalizeExplicitAssistantMode(p.explicitMode)
  const last = String(p.lastUserText || '').trim()

  if (explicit && explicit !== 'default') {
    if (explicit === 'stage_compare') {
      const a = Number(p.compareStageIndexA)
      const b = Number(p.compareStageIndexB)
      if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0 && a !== b) {
        return { mode: 'stage_compare', compareA: Math.floor(a), compareB: Math.floor(b) }
      }
      const parsed = parseStageCompareIndicesFromText(last)
      if (parsed) return { mode: 'stage_compare', compareA: parsed.a, compareB: parsed.b }
      return { mode: 'stage_compare', compareA: null, compareB: null }
    }
    return { mode: explicit, compareA: null, compareB: null }
  }

  const inferred = inferReadOnlyModeFromUserText(last)
  if (!inferred) return { mode: 'default', compareA: null, compareB: null }
  if (inferred === 'stage_compare') {
    const parsed = parseStageCompareIndicesFromText(last)
    if (parsed) return { mode: 'stage_compare', compareA: parsed.a, compareB: parsed.b }
    return { mode: 'stage_compare', compareA: null, compareB: null }
  }
  return { mode: inferred, compareA: null, compareB: null }
}
