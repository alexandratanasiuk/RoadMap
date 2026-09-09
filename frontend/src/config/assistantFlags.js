/**
 * Вкладка «Ассистент» и каркас чата на staging.
 * Vite: только префикс VITE_. В dev по умолчанию включаем UI, если явно не выключено.
 */
const raw = String(import.meta.env.VITE_ASSISTANT_UI_ENABLED ?? '').trim().toLowerCase()

export const ASSISTANT_UI_ENABLED =
  raw === 'true' || (import.meta.env.DEV && raw !== 'false')
