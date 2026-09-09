export const SHARED_RADIO_PLAYER_KEY = '__putRoadmapWorkspaceRadioPlayer'

export const RADIO_STATIONS = [
  { name: 'Весёлый рок', url: 'https://radiorecord.hostingradio.ru/rock96.aacp' },
  { name: 'Вечеринка', url: 'https://radiorecord.hostingradio.ru/party96.aacp' },
  { name: 'Русские хиты', url: 'https://radiorecord.hostingradio.ru/russianhits96.aacp' },
  { name: 'Чил для работы', url: 'https://radiorecord.hostingradio.ru/chil96.aacp' },
  { name: 'Radio Record Chill-Out', url: 'https://radiorecord.hostingradio.ru/chil96.aacp' },
  { name: 'Radio Paradise Main Mix', url: 'https://stream-uk1.radioparadise.com/aac-320' },
  { name: 'Rock Radio', url: 'https://stream-uk1.radioparadise.com/rock-128' },
  { name: 'Record Dance Radio', url: 'https://radiorecord.hostingradio.ru/rr_main96.aacp' }
]

const knownUrls = new Set(RADIO_STATIONS.map((station) => station.url))

/** Старые URL → актуальные (потоки Record иногда меняют имя файла). */
const LEGACY_RADIO_URL_MAP = {
  'https://radiorecord.hostingradio.ru/russian96.aacp':
    'https://radiorecord.hostingradio.ru/russianhits96.aacp'
}

export const DEFAULT_RADIO_URL = RADIO_STATIONS[0]?.url || ''

export function isKnownRadioUrl(url) {
  return knownUrls.has(String(url || '').trim())
}

export function normalizeRadioUrl(url) {
  const trimmed = String(url || '').trim()
  const migrated = LEGACY_RADIO_URL_MAP[trimmed] || trimmed
  return isKnownRadioUrl(migrated) ? migrated : DEFAULT_RADIO_URL
}

/** Сбрасывает устаревший URL (например SomaFM) в общем плеере. */
export function normalizeSharedRadioPlayer(shared) {
  if (!shared) return DEFAULT_RADIO_URL
  const normalized = normalizeRadioUrl(shared.currentUrl)
  if (normalized !== String(shared.currentUrl || '').trim()) {
    shared.currentUrl = normalized
    const src = String(shared.audio?.src || '')
    if (src && !src.includes(normalized)) {
      shared.audio.pause()
      shared.audio.removeAttribute('src')
      shared.audio.load?.()
    }
  }
  return normalized
}
