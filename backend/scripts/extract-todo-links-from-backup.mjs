/**
 * Извлекает из бэкапа только ссылки (linkUrl / url / link) из пунктов To-Do
 * в персональном рабочем столе (таблица WorkspaceStates, поле todoNotebook).
 *
 * Поддерживаемые источники:
 * 1) JSON-файл из Postgres-бэкапа (как в npm run backup): WorkspaceStates.json
 *    — массив строк таблицы с полями username, todoNotebook (объект или JSON-строка).
 * 2) Копия SQLite БД (*.sqlite), сделанная backup-data.mjs или вручную.
 *
 * Запуск из каталога backend:
 *   node scripts/extract-todo-links-from-backup.mjs "C:\path\to\WorkspaceStates.json"
 *   node scripts/extract-todo-links-from-backup.mjs "C:\path\to\database.sqlite"
 *
 * Результат: JSON в stdout (username, entryTitle, pointText, linkUrl).
 */
import fs from 'fs'
import path from 'path'
import sqlite3 from 'sqlite3'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const parseMaybeJson = (val) => {
  if (val == null) return null
  if (typeof val === 'object' && !Array.isArray(val)) return val
  if (typeof val === 'string') {
    const t = val.trim()
    if (!t) return null
    try {
      return JSON.parse(t)
    } catch {
      return null
    }
  }
  return null
}

const pointLink = (p) => {
  if (!p || typeof p !== 'object') return ''
  return String(p.linkUrl || p.url || p.link || '').trim()
}

/** @returns {{ username: string, entryTitle: string, pointText: string, linkUrl: string }[]} */
function linksFromTodoNotebook(username, nbRaw) {
  const nb = Array.isArray(nbRaw) ? nbRaw : parseMaybeJson(nbRaw)
  if (!Array.isArray(nb)) return []
  const out = []
  for (const entry of nb) {
    const entryTitle = String(entry?.title || '').trim()
    const points = Array.isArray(entry?.points) ? entry.points : []
    for (const p of points) {
      const linkUrl = pointLink(p)
      if (!linkUrl) continue
      out.push({
        username: String(username || '').trim() || '?',
        entryTitle,
        pointText: String(p?.text || '').trim(),
        linkUrl
      })
    }
  }
  return out
}

async function extractFromSqlite(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(err)
    })
    db.all(
      `SELECT username, todoNotebook FROM WorkspaceStates WHERE todoNotebook IS NOT NULL AND TRIM(todoNotebook) != '' AND todoNotebook != '[]'`,
      (err, rows) => {
        db.close(() => {})
        if (err) return reject(err)
        const all = []
        for (const row of rows || []) {
          const nb = parseMaybeJson(row.todoNotebook)
          all.push(...linksFromTodoNotebook(row.username, nb))
        }
        resolve(all)
      }
    )
  })
}

function extractFromWorkspaceStatesJson(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const rows = Array.isArray(raw) ? raw : [raw]
  const all = []
  for (const row of rows) {
    const username = row.username || row.user || ''
    const nb = row.todoNotebook
    all.push(...linksFromTodoNotebook(username, nb))
  }
  return all
}

const main = async () => {
  const input = process.argv[2]
  if (!input) {
    console.error(
      'Укажите путь к WorkspaceStates.json или к файлу SQLite из бэкапа.\n' +
        'Пример: node scripts/extract-todo-links-from-backup.mjs ..\\backups\\backup-2026\\WorkspaceStates.json'
    )
    process.exit(1)
  }
  const abs = path.isAbsolute(input) ? input : path.join(process.cwd(), input)
  if (!fs.existsSync(abs)) {
    console.error('Файл не найден:', abs)
    process.exit(1)
  }
  const ext = path.extname(abs).toLowerCase()
  let links
  if (ext === '.json') {
    links = extractFromWorkspaceStatesJson(abs)
  } else if (ext === '.sqlite' || ext === '.db') {
    links = await extractFromSqlite(abs)
  } else {
    console.error('Ожидается .json (WorkspaceStates) или .sqlite / .db')
    process.exit(1)
  }
  console.log(JSON.stringify(links, null, 2))
  console.error(`\nВсего ссылок в пунктах To-Do: ${links.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
