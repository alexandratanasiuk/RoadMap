# Путь — роадмап релизов

Приложение для планирования и отслеживания релизов: задачи, статусы, тепловая карта трудозатрат, экспорт.

## Демо в сети

| | |
|--|--|
| URL | http://put-roadmap.duckdns.org:3000/ |
| Логин | `Гость` |
| Пароль | `1` |

Гость — только просмотр этапов (без создания/изменения блоков). Для полного доступа нужны учётки админа / архитектора / делегата (см. `backend/.env.example`).

## Возможности

- Просмотр по месяцам и кварталам
- Задачи со статусами: не начато / в работе / выполнено
- Тепловая карта трудозатрат и статистика
- Drag & Drop задач между релизами
- Экспорт в PNG и PDF
- Роли: админ, архитектор проекта, делегат, гость
- Опционально: ИИ-ассистент (GigaChat / совместимый LLM)

## Стек

| Часть | Технологии |
|--------|------------|
| Frontend | Vue 3, Vite (порт **3000**) |
| Backend | Node.js, Express, Sequelize (порт **3011**) |
| БД | **PostgreSQL** (рекомендуется) или SQLite (локальный прототип) |

## Порты по умолчанию

| Сервис | Порт |
|--------|------|
| Frontend (Vite) | **3000** |
| Backend API | **3011** |
| PostgreSQL | **5432** |

Фронт проксирует `/api` на backend (`DEV_PROXY_TARGET`, по умолчанию `http://127.0.0.1:3011`).

---

## Развёртывание с нуля на новой машине (Windows)

### 0. Скопировать проект

Скопируйте папку или `git clone`. Не переносите как «источник правды»:

- `node_modules/`
- `backend/.env`, `frontend/.env*`
- `*.sqlite`, `backend/backups/` (могут содержать данные и секреты)

### 1. Требования

- **Node.js** 18+ (LTS)
- **PostgreSQL** 14+ — для нормальной работы (как на демо-сервере)

SQLite поднимется сам, если в `.env` **нет** `DB_DIALECT=postgres` / `DATABASE_URL` — удобно быстро посмотреть UI, но для «как в проде» используйте Postgres.

### 2. Создать базу PostgreSQL

В **SQL Shell (psql)** или другом клиенте (подставьте свой пароль):

```sql
CREATE USER roadmap_user WITH PASSWORD 'CHANGE_ME';
CREATE DATABASE put_roadmap OWNER roadmap_user;
GRANT ALL PRIVILEGES ON DATABASE put_roadmap TO roadmap_user;
```

PostgreSQL 15+ (подключившись к `put_roadmap`):

```sql
\c put_roadmap
GRANT ALL ON SCHEMA public TO roadmap_user;
```

Проверка: служба Postgres запущена, порт **5432** слушается:

```bat
netstat -an | findstr ":5432"
```

### 3. Настроить backend `.env`

```bat
cd D:\Work\put-roadmap\backend
copy .env.example .env
```

Минимум в `backend\.env`:

```env
PORT=3011
HOST=127.0.0.1

JWT_SECRET=сгенерируйте-длинную-случайную-строку

DB_DIALECT=postgres
DATABASE_URL=postgres://roadmap_user:CHANGE_ME@127.0.0.1:5432/put_roadmap

# Первый админ (создаётся при старте, если ещё нет)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=задайте_надёжный_пароль

# Гость (создаётся автоматически; как на демо)
GUEST_USERNAME=Гость
GUEST_PASSWORD=1
GUEST_VIEW_OWNER=ProjectArchitect

PROJECT_ARCHITECT_USERNAME=ProjectArchitect
PROJECT_USER_USERNAME=ProjectUser
PROJECT_USER_PASSWORD=user01
```

Пароль в `DATABASE_URL` должен совпадать с паролем пользователя БД. Спецсимволы в пароле URL-кодируйте (например `!` → `%21`).

Подробный список переменных (CORS, ассистент, SSL): `backend/.env.example`.

### 4. Настроить frontend (опционально)

```bat
cd D:\Work\put-roadmap\frontend
copy .env.example .env
```

Если backend не на 3011:

```env
DEV_PROXY_TARGET=http://127.0.0.1:3011
```

### 5. Установить зависимости

```bat
cd D:\Work\put-roadmap\backend
npm install

cd ..\frontend
npm install
```

### 6. Первый запуск

При старте backend:

1. подключается к БД (Postgres или SQLite);
2. `sequelize.sync()` создаёт/догоняет таблицы;
3. создаёт админа (если задан `ADMIN_PASSWORD`) и гостя (`Гость` / `1` по умолчанию).

```bat
cd D:\Work\put-roadmap\backend
npm run dev
```

Проверка: в консоли должно быть что-то вроде `Сервер запущен на порту 3011` и `БД: postgres`.

В другом окне:

```bat
cd D:\Work\put-roadmap\frontend
npm run dev
```

Откройте http://localhost:3000 — войдите как `Гость` / `1` или под админом из `.env`.

### 7. Скрипты запуска (Windows)

| Файл | Назначение |
|------|------------|
| `start-roadmap.bat` | Установка зависимостей (если нужно) + запуск backend и frontend |
| `start-main-project.bat` | Запуск пары процессов (пути внутри bat могут быть под конкретный ПК — проверьте `ROOT`) |
| `stop-main-project.bat` | Остановка |
| `status-main-project.bat` | Статус портов |

Для новой машины надёжнее сначала ручной запуск (п. 6), затем при необходимости поправить `ROOT` в bat-файлах под свой путь (например `D:\Work\put-roadmap`).

### 8. Только SQLite (быстрый прототип без Postgres)

В `backend\.env` **не** задавайте postgres, либо явно:

```env
# DB_DIALECT не postgres / без DATABASE_URL
# файл БД по умолчанию: backend/database.sqlite
```

Затем `npm install` и `npm run dev` в backend + frontend. Для переноса данных в Postgres позже:

```bat
cd backend
npm run migrate:sqlite-to-postgres
```

(нужен заполненный `DATABASE_URL` на Postgres).

### 9. Бэкап данных

```bat
cd backend
npm run backup
```

Снимки попадают в `backend/backups/` (в Git не коммитятся).

---

## Ежедневный запуск

1. PostgreSQL запущен (если используете Postgres).
2. Backend: `cd backend && npm run dev` → http://127.0.0.1:3011  
3. Frontend: `cd frontend && npm run dev` → http://localhost:3000  

Или свой bat после правки путей.

---

## Типичные ошибки

| Симптом | Что сделать |
|---------|-------------|
| Backend падает на подключении к БД | Проверить службу Postgres, `DATABASE_URL`, пароль (URL-encoding) |
| Поднялся SQLite вместо Postgres | В `.env` нет `DB_DIALECT=postgres` или `DATABASE_URL`; `.env` должен лежать в **`backend/`** (сервер читает его из папки backend, не из cwd) |
| `ADMIN_PASSWORD не задан` | Задать в `.env` — иначе админ не создаётся |
| Фронт: прокси / API недоступен | Запустить backend на 3011; проверить `DEV_PROXY_TARGET` |
| Порт 3000 занят | Освободить порт или сменить `server.port` в `frontend/vite.config.js` |
| Гость не видит этапы | У этапов в БД `ownerUsername` должен совпадать с `GUEST_VIEW_OWNER` (по умолчанию `ProjectArchitect`) |

---

## Документация

- [docs/roadmap-views-overview.md](docs/roadmap-views-overview.md) — обзор видов
- [docs/roadmap-views-horizontal-quarters.md](docs/roadmap-views-horizontal-quarters.md) — квартальный вид
- `backend/.env.example`, `frontend/.env.example` — переменные окружения

## Репозиторий

Рабочая копия (пример): `D:\Work\put-roadmap`  
Не коммитьте `.env`, базы `*.sqlite` и `backend/backups/`.
