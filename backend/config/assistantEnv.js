/**
 * Переменные окружения ИИ-ассистента (staging / прод — только сервер, ключи не в браузер).
 * См. backend/.env.example
 */

const parseBool = (raw, defaultValue = false) => {
  if (raw === undefined || raw === null || String(raw).trim() === '') return defaultValue
  const v = String(raw).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(v)) return true
  if (['0', 'false', 'no', 'off'].includes(v)) return false
  return defaultValue
}

const parsePositiveInt = (raw, fallback) => {
  const n = parseInt(String(raw || '').trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function getAssistantEnv() {
  const maxPromptRaw = process.env.LLM_MAX_PROMPT_TOKENS
  let maxPromptTokens = null
  if (maxPromptRaw !== undefined && maxPromptRaw !== null && String(maxPromptRaw).trim() !== '') {
    const n = parseInt(String(maxPromptRaw).trim(), 10)
    if (Number.isFinite(n) && n > 0) maxPromptTokens = n
  }
  const provider = (process.env.LLM_PROVIDER || 'openai').trim().toLowerCase()
  const gigachatAuthorizationKey = (process.env.GIGACHAT_AUTHORIZATION_KEY || '').trim()
  const defaultModel =
    provider === 'gigachat' ? 'GigaChat' : 'gpt-4o-mini'
  return {
    enabled: parseBool(process.env.ASSISTANT_ENABLED, false),
    provider,
    apiKey: (process.env.LLM_API_KEY || '').trim(),
    baseUrl: (process.env.LLM_BASE_URL || '').trim(),
    model: (process.env.LLM_MODEL || defaultModel).trim(),
    maxCompletionTokens: parsePositiveInt(process.env.LLM_MAX_COMPLETION_TOKENS, 2048),
    maxPromptTokens,
    timeoutMs: parsePositiveInt(process.env.LLM_TIMEOUT_MS, 120_000),
    gigachat: {
      authorizationKey: gigachatAuthorizationKey,
      scope: (process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS').trim(),
      oauthUrl: (process.env.GIGACHAT_OAUTH_URL || 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth').trim(),
      apiBaseUrl: (process.env.GIGACHAT_API_BASE_URL || 'https://gigachat.devices.sberbank.ru/api/v1').trim(),
      /** false — отключить проверку TLS (только если нет корневых сертификатов НУЦ / ошибка UNABLE_TO_VERIFY_LEAF_SIGNATURE). */
      verifySsl: parseBool(process.env.GIGACHAT_VERIFY_SSL, true),
      timeoutMs: parsePositiveInt(process.env.LLM_TIMEOUT_MS, 120_000)
    }
  }
}

export function isAssistantConfigured() {
  const e = getAssistantEnv()
  if (!e.enabled) return false
  if (e.provider === 'gigachat') return Boolean(e.gigachat.authorizationKey)
  return Boolean(e.apiKey)
}
