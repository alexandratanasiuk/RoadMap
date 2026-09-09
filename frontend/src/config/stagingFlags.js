/** Совпадает с PROJECT_ARCHITECT_USERNAME на бэкенде (вкладка «Пользователи» только у этого логина). */
export const STAGING_ARCHITECT_USERNAME =
  import.meta.env.VITE_PROJECT_ARCHITECT_USERNAME || 'ProjectArchitect'
