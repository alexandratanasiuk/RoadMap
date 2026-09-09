import { randomUUID } from 'node:crypto'
import https from 'node:https'
import { URL as NodeURL } from 'node:url'

/** Кэш access token (память процесса). */
let accessTokenCache = null
/** @type {Promise<{ access_token: string, expires_at: number }> | null} */
let oauthInflight = null

/**
 * HTTPS без проверки цепочки (только если GIGACHAT_VERIFY_SSL=false).
 * @returns {Promise<{ ok: boolean, status: number, text: () => Promise<string> }>}
 */
const insecureHttpsRequest = (urlString, { method = 'GET', headers = {}, body = null }, timeoutMs) =>
  new Promise((resolve, reject) => {
    const u = new NodeURL(urlString)
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method,
        headers,
        rejectUnauthorized: false
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode || 0,
            text: async () => text
          })
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      reject(new Error('GigaChat: таймаут запроса'))
    })
    if (body != null) req.write(typeof body === 'string' ? body : String(body))
    req.end()
  })

const gigachatFetch = async (url, init, verifySsl, timeoutMs = 120_000) => {
  if (!verifySsl) {
    return insecureHttpsRequest(url, init, timeoutMs)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

const normalizeOAuthResponse = (data) => {
  const access_token = data?.access_token || data?.accessToken
  if (!access_token) return null
  let expires_at = data?.expires_at ?? data?.expiresAt
  if (typeof expires_at !== 'number' || !Number.isFinite(expires_at)) {
    const sec = Number(data?.expires_in)
    if (Number.isFinite(sec) && sec > 0) {
      expires_at = Date.now() + sec * 1000
    } else {
      expires_at = Date.now() + 25 * 60 * 1000
    }
  }
  if (expires_at < 1e12) {
    expires_at *= 1000
  }
  return { access_token, expires_at }
}

/**
 * Получает (или обновляет) access token по ключу авторизации (Basic, base64).
 * @param {object} g — gigachat из getAssistantEnv()
 */
export async function obtainGigachatAccessToken(g) {
  const now = Date.now()
  if (accessTokenCache?.access_token && accessTokenCache.expires_at > now + 30_000) {
    return accessTokenCache.access_token
  }
  if (!oauthInflight) {
    oauthInflight = (async () => {
      const body = new URLSearchParams({ scope: g.scope || 'GIGACHAT_API_PERS' }).toString()
      const timeoutMs = g.timeoutMs ?? 120_000
      const res = await gigachatFetch(
        g.oauthUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            RqUID: randomUUID(),
            Authorization: `Basic ${g.authorizationKey}`
          },
          body
        },
        g.verifySsl,
        timeoutMs
      )
      const text = await res.text()
      let data
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        throw new Error(`GigaChat OAuth: не JSON (HTTP ${res.status})`)
      }
      if (!res.ok) {
        const hint = data?.message || data?.error_description || text?.slice(0, 200)
        throw new Error(`GigaChat OAuth HTTP ${res.status}: ${hint || 'ошибка'}`)
      }
      const norm = normalizeOAuthResponse(data)
      if (!norm) throw new Error('GigaChat OAuth: нет access_token в ответе')
      accessTokenCache = norm
      return norm
    })().finally(() => {
      oauthInflight = null
    })
  }
  const tok = await oauthInflight
  return tok.access_token
}

/**
 * @param {object} g — gigachat из getAssistantEnv()
 * @param {{ role: string, content: string }[]} messages
 */
export async function gigachatChatCompletion(g, messages, opts = {}) {
  const accessToken = await obtainGigachatAccessToken(g)
  const model = opts.model || 'GigaChat'
  const max_tokens = opts.maxTokens ?? 2048
  const systemPrompt = opts.systemPrompt
  const timeoutMs = opts.timeoutMs ?? g.timeoutMs ?? 120_000
  const payloadMessages = []
  if (systemPrompt) {
    payloadMessages.push({ role: 'system', content: systemPrompt })
  }
  for (const m of messages) {
    if (!m?.content) continue
    const role = m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user'
    payloadMessages.push({ role, content: String(m.content) })
  }
  const url = `${g.apiBaseUrl.replace(/\/$/, '')}/chat/completions`
  const res = await gigachatFetch(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        model,
        messages: payloadMessages,
        max_tokens,
        temperature: 0.4
      })
    },
    g.verifySsl,
    timeoutMs
  )
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`GigaChat chat: не JSON (HTTP ${res.status})`)
  }
  if (res.status === 401) {
    accessTokenCache = null
    throw new Error('GigaChat: 401 — сессия доступа, повторите запрос')
  }
  if (!res.ok) {
    const hint = data?.error?.message || data?.message || text?.slice(0, 300)
    throw new Error(`GigaChat chat HTTP ${res.status}: ${hint || 'ошибка'}`)
  }
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('GigaChat: пустой ответ модели')
  }
  return content.trim()
}
