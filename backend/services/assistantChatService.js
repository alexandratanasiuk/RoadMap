import { gigachatChatCompletion } from './gigachatClient.js'

const DEFAULT_SYSTEM = `Ты помощник в приложении дорожной карты релизов (этапы и задачи).
Отвечай по-русски, кратко и по делу: планирование, формулировки задач, подсказки по срокам и зависимостям.
Если ниже передан блок «Данные выбранного проекта», используй только его для вопросов об этапах и задачах этого проекта — не выдумывай этапов, которых нет в списке.`

/**
 * @param {object} env — результат getAssistantEnv()
 * @param {{ role: string, content: string }[]} messages
 * @param {{ projectContext?: string, readOnlyInstruction?: string }} [options]
 */
export async function runAssistantChat(env, messages, options = {}) {
  const projectContext = typeof options.projectContext === 'string' ? options.projectContext.trim() : ''
  const readOnlyInstruction =
    typeof options.readOnlyInstruction === 'string' ? options.readOnlyInstruction.trim() : ''
  let systemPrompt = projectContext
    ? `${DEFAULT_SYSTEM}\n\n### Данные выбранного проекта\n${projectContext}`
    : `${DEFAULT_SYSTEM}\n\n(Проект в запросе не выбран — контекст этапов не загружен. Для разбора конкретного проекта пользователь должен выбрать его в шапке приложения и снова написать вопрос.)`
  if (readOnlyInstruction) {
    systemPrompt += `\n\n### Режим ответа\n${readOnlyInstruction}`
  }

  const provider = env.provider
  if (provider === 'gigachat') {
    const g = env.gigachat
    return gigachatChatCompletion(g, messages, {
      model: env.model || 'GigaChat',
      maxTokens: env.maxCompletionTokens,
      timeoutMs: env.timeoutMs,
      systemPrompt
    })
  }
  throw new Error(`Провайдер «${provider}» пока не подключён к ассистенту`)
}
