import express from 'express';
import cors from 'cors';
import { Sequelize, DataTypes, fn, col, where as sqlWhere, Op } from 'sequelize';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getAssistantEnv, isAssistantConfigured } from './config/assistantEnv.js';
import { runAssistantChat } from './services/assistantChatService.js';
import {
  appendAssistantContextSegment,
  formatExecutiveStatsAppendix,
  formatProjectAuditDigestAppendix,
  formatProjectContextForAssistant,
  formatTwoStagesCompareAppendix
} from './services/assistantContextFormat.js';
import { resolveAssistantReadOnlyPlan } from './services/assistantReadOnlyModes.js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Всегда .env рядом с server.js (иначе при запуске не из папки backend cwd другой — Postgres не подхватится, включится sqlite).
dotenv.config({ path: join(__dirname, '.env') });

const createSequelizeInstance = () => {
  const dialect = process.env.DB_DIALECT || (process.env.DATABASE_URL ? 'postgres' : 'sqlite');
  const logging = process.env.DB_LOGGING === 'true' ? console.log : false;

  if (dialect === 'postgres') {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Для DB_DIALECT=postgres требуется DATABASE_URL в .env');
    }
    return new Sequelize(databaseUrl, {
      dialect: 'postgres',
      logging,
      dialectOptions: process.env.DB_SSL === 'true'
        ? { ssl: { require: true, rejectUnauthorized: false } }
        : undefined
    });
  }

  // Fallback для локального режима/обратной совместимости.
  return new Sequelize({
    dialect: 'sqlite',
    storage: process.env.SQLITE_STORAGE || join(__dirname, 'database.sqlite'),
    logging
  });
};

const sequelize = createSequelizeInstance();

// Модель пользователя
const User = sequelize.define('User', {
  username: { type: DataTypes.STRING, unique: true },
  password: { type: DataTypes.STRING },
  initialPassword: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
  role: { type: DataTypes.STRING, defaultValue: 'user' },
  permissions: { type: DataTypes.TEXT, defaultValue: '{}' }
});

// Модель блока
// Модель блока - С ИСПРАВЛЕННЫМ tasks
const Block = sequelize.define('Block', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    defaultValue: () => Date.now() + '-' + Math.random().toString(36).substr(2, 9)
  },
  title: DataTypes.STRING,
  description: DataTypes.TEXT,
  ownerUsername: DataTypes.STRING,
  projectId: DataTypes.STRING,
  startDate: DataTypes.STRING,
  releaseDate: DataTypes.STRING,
  effort: DataTypes.INTEGER,
  completed: DataTypes.BOOLEAN,
  tasks: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get() {
      try {
        const val = this.getDataValue('tasks');
        return val ? JSON.parse(val) : [];
      } catch (e) {
        return [];
      }
    },
    set(val) {
      try {
        this.setDataValue('tasks', JSON.stringify(val || []));
      } catch (e) {
        this.setDataValue('tasks', '[]');
      }
    }
  }
}, { 
  timestamps: true 
});

const Project = sequelize.define('Project', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    defaultValue: () => Date.now() + '-' + Math.random().toString(36).substr(2, 9)
  },
  ownerUsername: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  sharedUsernames: { type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' },
  isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, {
  timestamps: true,
  indexes: [
    { unique: true, fields: ['ownerUsername', 'name'] }
  ]
});

// Модель аудита изменений этапов/задач
const AuditLog = sequelize.define('AuditLog', {
  actorUsername: { type: DataTypes.STRING, allowNull: false },
  actorRole: { type: DataTypes.STRING, allowNull: true },
  action: { type: DataTypes.STRING, allowNull: false }, // block_create | block_update | block_delete
  blockId: { type: DataTypes.STRING, allowNull: true },
  blockTitle: { type: DataTypes.STRING, allowNull: true },
  details: { type: DataTypes.TEXT, allowNull: true }
}, {
  timestamps: true
});

// Персональный рабочий стол пользователя (заметки + задачи)
const WorkspaceState = sequelize.define('WorkspaceState', {
  username: { type: DataTypes.STRING, unique: true, allowNull: false },
  notes: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  tasks: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: '[]',
    get() {
      try {
        const val = this.getDataValue('tasks');
        return val ? JSON.parse(val) : [];
      } catch {
        return [];
      }
    },
    set(val) {
      try {
        this.setDataValue('tasks', JSON.stringify(Array.isArray(val) ? val : []));
      } catch {
        this.setDataValue('tasks', '[]');
      }
    }
  },
  todoNotebook: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: '[]',
    get() {
      try {
        const val = this.getDataValue('todoNotebook');
        return val ? JSON.parse(val) : [];
      } catch {
        return [];
      }
    },
    set(val) {
      try {
        this.setDataValue('todoNotebook', JSON.stringify(Array.isArray(val) ? val : []));
      } catch {
        this.setDataValue('todoNotebook', '[]');
      }
    }
  }
}, {
  timestamps: true
});

await sequelize.sync();

// Lightweight migration for existing DB: add ownerUsername if it does not exist yet.
const ensureBlockOwnerColumn = async () => {
  const qi = sequelize.getQueryInterface();
  const table = await qi.describeTable('Blocks');
  if (!table.ownerUsername) {
    await qi.addColumn('Blocks', 'ownerUsername', {
      type: DataTypes.STRING,
      allowNull: true
    });
    console.log('✅ Добавлена колонка Blocks.ownerUsername');
  }
};
await ensureBlockOwnerColumn();

const ensureBlockProjectColumn = async () => {
  const qi = sequelize.getQueryInterface();
  const table = await qi.describeTable('Blocks');
  if (!table.projectId) {
    await qi.addColumn('Blocks', 'projectId', {
      type: DataTypes.STRING,
      allowNull: true
    });
    console.log('✅ Добавлена колонка Blocks.projectId');
  }
};
await ensureBlockProjectColumn();

const ensureProjectSharedUsernamesColumn = async () => {
  const qi = sequelize.getQueryInterface();
  const table = await qi.describeTable('Projects');
  if (!table.sharedUsernames) {
    await qi.addColumn('Projects', 'sharedUsernames', {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]'
    });
    console.log('✅ Добавлена колонка Projects.sharedUsernames');
  }
};
await ensureProjectSharedUsernamesColumn();

const ensureWorkspaceTodoNotebookColumn = async () => {
  const qi = sequelize.getQueryInterface();
  const table = await qi.describeTable('WorkspaceStates');
  if (!table.todoNotebook) {
    await qi.addColumn('WorkspaceStates', 'todoNotebook', {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]'
    });
    console.log('✅ Добавлена колонка WorkspaceStates.todoNotebook');
  }
};
await ensureWorkspaceTodoNotebookColumn();

const ensureUserPermissionsColumn = async () => {
  const qi = sequelize.getQueryInterface();
  const table = await qi.describeTable('Users');
  if (!table.permissions) {
    await qi.addColumn('Users', 'permissions', {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '{}'
    });
    console.log('✅ Добавлена колонка Users.permissions');
  }
};
await ensureUserPermissionsColumn();

const ensureUserInitialPasswordColumn = async () => {
  const qi = sequelize.getQueryInterface();
  const table = await qi.describeTable('Users');
  if (!table.initialPassword) {
    await qi.addColumn('Users', 'initialPassword', {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    });
    console.log('✅ Добавлена колонка Users.initialPassword');
  }
};
await ensureUserInitialPasswordColumn();

const ensureDefaultProjectForOwner = async (ownerUsername) => {
  const owner = String(ownerUsername || '').trim();
  if (!owner) return null;
  let project = await Project.findOne({
    where: { ownerUsername: owner, isDefault: true },
    order: [['createdAt', 'ASC']]
  });
  if (!project) {
    project = await Project.findOne({
      where: { ownerUsername: owner },
      order: [['createdAt', 'ASC']]
    });
    if (project) {
      await project.update({ isDefault: true });
      return project;
    }
    project = await Project.create({
      ownerUsername: owner,
      name: 'Проект 1',
      isDefault: true
    });
  }
  return project;
};

const ensureProjectsBootstrapForExistingBlocks = async () => {
  const rows = await Block.findAll({
    attributes: ['ownerUsername'],
    group: ['ownerUsername'],
    raw: true
  });
  for (const row of rows) {
    const owner = String(row?.ownerUsername || '').trim();
    if (!owner) continue;
    const defaultProject = await ensureDefaultProjectForOwner(owner);
    if (!defaultProject) continue;
    await Block.update(
      { projectId: defaultProject.id },
      {
        where: {
          ownerUsername: owner,
          [Op.or]: [
            { projectId: null },
            { projectId: '' }
          ]
        }
      }
    );
  }
};
await ensureProjectsBootstrapForExistingBlocks();

// Создаем админа при первом запуске (пароль только из .env, без дефолта в коде)
const createAdmin = async () => {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;

  const adminExists = await User.findOne({ where: { username: adminUsername } });
  if (adminExists) {
    console.log(`✅ Админ уже существует: ${adminUsername}`);
    return adminUsername;
  }
  if (!adminPassword) {
    console.warn('⚠️ ADMIN_PASSWORD не задан в .env — админ не создан. Скопируйте .env.example в .env и задайте ADMIN_PASSWORD.');
    return adminUsername;
  }
  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  await User.create({
    username: adminUsername,
    password: hashedPassword,
    initialPassword: String(adminPassword),
    role: 'admin'
  });
  console.log(`✅ Админ создан: ${adminUsername}`);
  return adminUsername;
};
await createAdmin();
// Не выставляем ownerUsername этапам при старте — не меняем данные блоков/задач в БД.

/** Имя владельца этапов, которые видит гость (роль guest). По умолчанию — ProjectArchitect. */
const GUEST_VIEW_OWNER = process.env.GUEST_VIEW_OWNER || 'ProjectArchitect';

const isGuestUser = (user) => Boolean(user && user.role === 'guest');

const createGuestUser = async () => {
  const guestUsername = process.env.GUEST_USERNAME || 'Гость';
  const existing = await User.findOne({ where: { username: guestUsername } });
  if (existing) {
    console.log(`✅ Гостевой пользователь уже есть: ${guestUsername} (запись в БД не менялась)`);
    return;
  }
  const guestPassword = process.env.GUEST_PASSWORD ?? '1';
  const hashedPassword = await bcrypt.hash(String(guestPassword), 10);
  await User.create({
    username: guestUsername,
    password: hashedPassword,
    initialPassword: String(guestPassword),
    role: 'guest'
  });
  console.log(`✅ Гостевой пользователь создан: ${guestUsername} (просмотр этапов: ${GUEST_VIEW_OWNER})`);
};
await createGuestUser();

/** Владелец этапов руководителя (Project Architect). Делегат редактирует этапы с этим ownerUsername. */
const ARCHITECT_USERNAME = process.env.PROJECT_ARCHITECT_USERNAME || 'ProjectArchitect';
const PROJECT_USER_USERNAME = process.env.PROJECT_USER_USERNAME || 'ProjectUser';
const PROJECT_USER_PASSWORD = process.env.PROJECT_USER_PASSWORD ?? 'user01';

const PERMISSION_KEYS = [
  'view',
  'editTasks',
  'editStages',
  'createTasks',
  'deleteTasks',
  'createStages',
  'deleteStages',
  'dragTasks',
  'dragStages',
  'tabHorizontal',
  'tabQuarters',
  'tabHeatmap',
  'tabGantt',
  'tabPert',
  'tabRoadmap',
  'tabWorkspace',
  'tabTable',
  'tabUsers'
];

const defaultPermissionsByRole = (roleRaw) => {
  const role = String(roleRaw || '').trim().toLowerCase();
  if (role === 'guest') {
    return {
      view: true,
      editTasks: false,
      editStages: false,
      createTasks: false,
      deleteTasks: false,
      createStages: false,
      deleteStages: false,
      dragTasks: false,
      dragStages: false,
      tabHorizontal: true,
      tabQuarters: true,
      tabHeatmap: true,
      tabGantt: true,
      tabPert: true,
      tabRoadmap: true,
      tabWorkspace: false,
      tabTable: true,
      tabUsers: false
    };
  }
  if (role === 'admin') {
    return {
      view: true,
      editTasks: true,
      editStages: true,
      createTasks: true,
      deleteTasks: true,
      createStages: true,
      deleteStages: true,
      dragTasks: true,
      dragStages: true,
      tabHorizontal: true,
      tabQuarters: true,
      tabHeatmap: true,
      tabGantt: true,
      tabPert: true,
      tabRoadmap: true,
      tabWorkspace: true,
      tabTable: true,
      tabUsers: true
    };
  }
  return {
    view: true,
    editTasks: true,
    editStages: true,
    createTasks: true,
    deleteTasks: true,
    createStages: true,
    deleteStages: true,
    dragTasks: true,
    dragStages: true,
    tabHorizontal: true,
    tabQuarters: true,
    tabHeatmap: true,
    tabGantt: true,
    tabPert: true,
    tabRoadmap: true,
    tabWorkspace: true,
    tabTable: true,
    tabUsers: false
  };
};

const parsePermissionsObject = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

const normalizePermissionsPatch = (rawPatch) => {
  const source = parsePermissionsObject(rawPatch);
  const out = {};
  for (const key of PERMISSION_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    out[key] = Boolean(source[key]);
  }
  return out;
};

const resolveUserPermissions = (userLike) => {
  const base = defaultPermissionsByRole(userLike?.role);
  const custom = normalizePermissionsPatch(userLike?.permissions);
  return { ...base, ...custom };
};

const hasPermission = (userLike, key) => Boolean(resolveUserPermissions(userLike)?.[key]);

const isProjectDelegateUser = (user) => Boolean(user && user.role === 'project_user');
const isArchitectUser = (user) =>
  Boolean(
    user &&
    String(user.username || '').trim().toLowerCase() ===
      String(ARCHITECT_USERNAME || '').trim().toLowerCase()
  );

const normalizeUsernameLower = (value) => String(value || '').trim().toLowerCase();

const parseSharedUsernames = (raw) => {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
    if (!Array.isArray(parsed)) return [];
    const uniq = new Set();
    const out = [];
    for (const item of parsed) {
      const name = String(item || '').trim();
      const key = name.toLowerCase();
      if (!name || uniq.has(key)) continue;
      uniq.add(key);
      out.push(name);
    }
    return out;
  } catch {
    return [];
  }
};

const formatProjectForResponse = (projectLike) => {
  if (!projectLike) return null;
  const plain = typeof projectLike.get === 'function' ? projectLike.get({ plain: true }) : { ...projectLike };
  return {
    ...plain,
    sharedUsernames: parseSharedUsernames(projectLike?.sharedUsernames ?? plain?.sharedUsernames)
  };
};

const projectIncludesUser = (projectLike, username) => {
  const uname = normalizeUsernameLower(username);
  if (!uname) return false;
  const owner = normalizeUsernameLower(projectLike?.ownerUsername);
  if (owner && owner === uname) return true;
  return parseSharedUsernames(projectLike?.sharedUsernames).some((item) => normalizeUsernameLower(item) === uname);
};

const canAccessProject = (user, projectLike) => {
  if (!user || !projectLike) return false;
  if (isArchitectUser(user)) return true;
  if (isGuestUser(user)) return false;
  if (isProjectDelegateUser(user)) {
    return canAccessOwnerScope(user, projectLike.ownerUsername);
  }
  return projectIncludesUser(projectLike, user.username);
};

const canManageProjectMembers = (user, projectLike) => {
  if (!user || !projectLike) return false;
  if (isArchitectUser(user)) return true;
  return normalizeUsernameLower(projectLike.ownerUsername) === normalizeUsernameLower(user.username);
};

/** Логины владельца дорожной карты в БД: гость смотрит GUEST_VIEW_OWNER, делегат — те же этапы + по PROJECT_ARCHITECT_USERNAME (на случай расхождения env). */
const delegateBlockOwnerTargets = () => {
  const a = String(ARCHITECT_USERNAME || '').trim();
  const g = String(GUEST_VIEW_OWNER || '').trim();
  return [...new Set([a, g].filter(Boolean))];
};

const blockOwnerMatchesDelegateTargets = (block) => {
  const raw = block?.ownerUsername;
  if (raw === undefined || raw === null || String(raw).trim() === '') return false;
  const o = String(raw).trim().toLowerCase();
  return delegateBlockOwnerTargets().some((t) => t.toLowerCase() === o);
};

const scopeOwnersForUser = (user) => {
  if (isProjectDelegateUser(user)) return delegateBlockOwnerTargets();
  if (isGuestUser(user)) return [GUEST_VIEW_OWNER];
  return [String(user?.username || '').trim()].filter(Boolean);
};

const canAccessOwnerScope = (user, ownerUsername) => {
  if (isArchitectUser(user)) return true;
  const owner = String(ownerUsername || '').trim().toLowerCase();
  return scopeOwnersForUser(user).some((item) => String(item || '').trim().toLowerCase() === owner);
};

const ownerScopeForBlocks = (user) => {
  if (isGuestUser(user)) return GUEST_VIEW_OWNER;
  return user.username;
};

const canMutateBlock = (user, block) => {
  if (isGuestUser(user)) return false;
  if (!block) return false;
  if (block.ownerUsername === user.username) return true;
  if (isProjectDelegateUser(user) && blockOwnerMatchesDelegateTargets(block)) return true;
  return false;
};

const canMutateBlockViaProject = async (user, block) => {
  if (canMutateBlock(user, block)) return true;
  const blockProjectId = String(block?.projectId || '').trim();
  if (!blockProjectId) return false;
  const project = await Project.findByPk(blockProjectId);
  if (!project) return false;
  return canAccessProject(user, project);
};

const effectiveOwnerForNewBlock = (user) => {
  if (isProjectDelegateUser(user)) return GUEST_VIEW_OWNER;
  return user.username;
};

const effectiveOwnerForNewProject = (user) => effectiveOwnerForNewBlock(user);

const normalizeBlockOwnerOnWrite = (user, requestedOwner) => {
  if (isProjectDelegateUser(user)) return GUEST_VIEW_OWNER;
  return requestedOwner && String(requestedOwner).trim()
    ? String(requestedOwner).trim()
    : user.username;
};

const resolveProjectForWrite = async ({ user, requestedProjectId, ownerUsername }) => {
  const owner = String(ownerUsername || '').trim();
  const requestedId = String(requestedProjectId || '').trim();
  if (requestedId) {
    const requestedProject = await Project.findByPk(requestedId);
    if (requestedProject && canAccessProject(user, requestedProject)) {
      return requestedProject;
    }
  }
  return await ensureDefaultProjectForOwner(owner);
};

const describeUserRights = (role) => {
  switch (role) {
    case 'admin':
      return 'Полный доступ';
    case 'guest':
      return `Только просмотр этапов (${GUEST_VIEW_OWNER})`;
    case 'project_user':
      return `Редактирование этапов и задач (${ARCHITECT_USERNAME})`;
    default:
      return 'Свои этапы и задачи';
  }
};

const describePermissions = (userLike) => {
  const p = resolveUserPermissions(userLike);
  const labels = [];
  if (p.view) labels.push('просмотр');
  if (p.editStages) labels.push('редактирование этапов');
  if (p.editTasks) labels.push('редактирование задач');
  if (p.createStages) labels.push('создание этапов');
  if (p.deleteStages) labels.push('удаление этапов');
  if (p.createTasks) labels.push('создание задач');
  if (p.deleteTasks) labels.push('удаление задач');
  if (p.dragStages) labels.push('перетаскивание этапов');
  if (p.dragTasks) labels.push('перетаскивание задач');
  const visibleTabs = [];
  if (p.tabHorizontal) visibleTabs.push('по месяцам');
  if (p.tabQuarters) visibleTabs.push('по кварталам');
  if (p.tabHeatmap) visibleTabs.push('теплокарта');
  if (p.tabGantt) visibleTabs.push('гант');
  if (p.tabPert) visibleTabs.push('pert');
  if (p.tabRoadmap) visibleTabs.push('roadmap');
  if (p.tabWorkspace) visibleTabs.push('рабочий стол');
  if (p.tabTable) visibleTabs.push('таблица');
  if (p.tabUsers) visibleTabs.push('пользователи');
  if (visibleTabs.length) labels.push(`вкладки: ${visibleTabs.join('/')}`);
  return labels.length ? labels.join(', ') : 'нет прав';
};

/** Справочник учёток: не в production, если не включён флаг. Доступ по tabUsers (+ admin/архитектор). */
const testUserDirectoryEnabled = () =>
  process.env.NODE_ENV !== 'production' ||
  String(process.env.ENABLE_TEST_USER_DIRECTORY || '').toLowerCase() === 'true';

const canViewTestUserDirectory = (user) =>
  Boolean(
    user &&
      (
        hasPermission(user, 'tabUsers') ||
        String(user.username || '').trim().toLowerCase() === String(ARCHITECT_USERNAME || '').trim().toLowerCase() ||
        String(user.role || '').trim().toLowerCase() === 'admin'
      )
  );

const canManageUsersFromPanel = (user) =>
  Boolean(
    user &&
      (
        String(user.username || '').trim().toLowerCase() === String(ARCHITECT_USERNAME || '').trim().toLowerCase() ||
        String(user.role || '').trim().toLowerCase() === 'admin'
      )
  );

const getTaskStats = (tasksLike) => {
  const tasks = Array.isArray(tasksLike) ? tasksLike : [];
  let todo = 0;
  let progress = 0;
  let done = 0;
  for (const task of tasks) {
    if (task?.status === 'done') done += 1;
    else if (task?.status === 'progress') progress += 1;
    else todo += 1;
  }
  return { total: tasks.length, todo, progress, done };
};

const summarizeBlockChanges = (beforeBlock, afterBlock) => {
  const changes = [];
  const addChange = (label, before, after) => {
    if (before === after) return;
    changes.push(`${label}: "${before ?? '—'}" → "${after ?? '—'}"`);
  };

  addChange('Название', beforeBlock?.title, afterBlock?.title);
  addChange('Владелец', beforeBlock?.ownerUsername, afterBlock?.ownerUsername);
  addChange('Проект', beforeBlock?.projectId, afterBlock?.projectId);
  addChange('Дата начала', beforeBlock?.startDate, afterBlock?.startDate);
  addChange('Дата окончания', beforeBlock?.releaseDate, afterBlock?.releaseDate);
  addChange('Трудозатраты', beforeBlock?.effort, afterBlock?.effort);
  addChange('Статус завершения', String(Boolean(beforeBlock?.completed)), String(Boolean(afterBlock?.completed)));

  const beforeDesc = String(beforeBlock?.description || '').trim();
  const afterDesc = String(afterBlock?.description || '').trim();
  if (beforeDesc !== afterDesc) {
    changes.push('Описание: изменено');
  }

  const beforeTasks = Array.isArray(beforeBlock?.tasks) ? beforeBlock.tasks : [];
  const afterTasks = Array.isArray(afterBlock?.tasks) ? afterBlock.tasks : [];
  const beforeTasksJson = JSON.stringify(beforeTasks);
  const afterTasksJson = JSON.stringify(afterTasks);
  if (beforeTasksJson !== afterTasksJson) {
    const b = getTaskStats(beforeTasks);
    const a = getTaskStats(afterTasks);
    changes.push(
      `Задачи: всего ${b.total}→${a.total}, todo ${b.todo}→${a.todo}, progress ${b.progress}→${a.progress}, done ${b.done}→${a.done}`
    );

    const beforeById = new Map(beforeTasks.map((t) => [String(t?.id || ''), t]));
    const afterById = new Map(afterTasks.map((t) => [String(t?.id || ''), t]));
    const addedTitles = [];
    const removedTitles = [];
    const renamedTitles = [];
    const statusChangedTitles = [];

    for (const [id, task] of afterById) {
      if (!id) continue;
      if (!beforeById.has(id)) {
        addedTitles.push(String(task?.title || id));
        continue;
      }
      const beforeTask = beforeById.get(id);
      const beforeTitle = String(beforeTask?.title || '');
      const afterTitle = String(task?.title || '');
      if (beforeTitle !== afterTitle) {
        renamedTitles.push(`${beforeTitle || id} → ${afterTitle || id}`);
      }
      if (String(beforeTask?.status || '') !== String(task?.status || '')) {
        statusChangedTitles.push(afterTitle || id);
      }
    }
    for (const [id, task] of beforeById) {
      if (!id) continue;
      if (!afterById.has(id)) {
        removedTitles.push(String(task?.title || id));
      }
    }

    const preview = (arr) => arr.slice(0, 5).join(', ');
    if (addedTitles.length) changes.push(`Добавлены задачи: ${preview(addedTitles)}`);
    if (removedTitles.length) changes.push(`Удалены задачи: ${preview(removedTitles)}`);
    if (renamedTitles.length) changes.push(`Переименованы задачи: ${preview(renamedTitles)}`);
    if (statusChangedTitles.length) changes.push(`Изменён статус задач: ${preview(statusChangedTitles)}`);
  }

  return changes;
};

const writeAuditLog = async ({ reqUser, action, blockId, blockTitle, details }) => {
  try {
    await AuditLog.create({
      actorUsername: String(reqUser?.username || 'unknown'),
      actorRole: String(reqUser?.role || ''),
      action,
      blockId: blockId ? String(blockId) : null,
      blockTitle: blockTitle ? String(blockTitle) : null,
      details: details ? String(details) : null
    });
  } catch (error) {
    console.error('⚠️ Не удалось записать аудит-лог:', error.message);
  }
};

const getRequestIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
};

const MANUAL_TEST_DIRECTORY_PASSWORDS = Object.freeze({
  admin: 'admin',
  projectarchitect: 'admin',
  admin007: 'testadmin007',
  projectmanager: '48291',
  projectuser: 'user01',
  alexandra: 'alexandra',
  'гость': '1'
});

const passwordFromEnvForUsername = (username) => {
  const u = String(username || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(MANUAL_TEST_DIRECTORY_PASSWORDS, u)) {
    return MANUAL_TEST_DIRECTORY_PASSWORDS[u];
  }
  const adminName = String(process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const guestName = String(process.env.GUEST_USERNAME || 'Гость').trim().toLowerCase();
  const proj = String(PROJECT_USER_USERNAME || 'ProjectUser').trim().toLowerCase();
  if (u === adminName && process.env.ADMIN_PASSWORD) return String(process.env.ADMIN_PASSWORD);
  if (u === guestName) return String(process.env.GUEST_PASSWORD ?? '1');
  if (u === proj) return String(PROJECT_USER_PASSWORD ?? 'user01');
  return null;
};

const backfillUserInitialPasswords = async () => {
  const users = await User.findAll({ attributes: ['id', 'username', 'initialPassword'] });
  for (const user of users) {
    const currentInitial = String(user.initialPassword || '').trim();
    if (currentInitial) continue;
    const fallbackInitial = passwordFromEnvForUsername(user.username);
    if (!fallbackInitial) continue;
    await user.update({ initialPassword: String(fallbackInitial) });
  }
};
await backfillUserInitialPasswords();

const normalizeTaskForPermissionCompare = (taskLike) => {
  const task = taskLike && typeof taskLike === 'object' ? taskLike : {};
  return {
    id: task.id ?? null,
    title: task.title ?? '',
    description: task.description ?? '',
    status: task.status ?? '',
    effort: Number(task.effort ?? 0),
    owner: task.owner ?? '',
    linkUrl: task.linkUrl ?? '',
    deps: Array.isArray(task.dependencies) ? task.dependencies : [],
    startDate: task.startDate ?? '',
    releaseDate: task.releaseDate ?? ''
  };
};

const inferBlockPermissionNeeds = (beforeBlock, nextPayload) => {
  const needs = new Set();
  const payload = nextPayload && typeof nextPayload === 'object' ? nextPayload : {};

  const beforeTasks = Array.isArray(beforeBlock?.tasks) ? beforeBlock.tasks.map(normalizeTaskForPermissionCompare) : [];
  const afterTasksRaw = Object.prototype.hasOwnProperty.call(payload, 'tasks') ? payload.tasks : beforeTasks;
  const afterTasks = Array.isArray(afterTasksRaw) ? afterTasksRaw.map(normalizeTaskForPermissionCompare) : beforeTasks;

  const stageContentFields = ['title', 'description', 'ownerUsername', 'projectId', 'effort', 'completed'];
  for (const field of stageContentFields) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
    if (String(beforeBlock?.[field] ?? '') !== String(payload?.[field] ?? '')) {
      needs.add('editStages');
      break;
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'startDate') && String(beforeBlock?.startDate || '') !== String(payload?.startDate || '')) {
    needs.add('dragStages');
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'releaseDate') && String(beforeBlock?.releaseDate || '') !== String(payload?.releaseDate || '')) {
    needs.add('dragStages');
  }

  if (JSON.stringify(beforeTasks) !== JSON.stringify(afterTasks)) {
    const beforeById = new Map(beforeTasks.map((t, idx) => [String(t.id ?? `idx:${idx}`), t]));
    const afterById = new Map(afterTasks.map((t, idx) => [String(t.id ?? `idx:${idx}`), t]));

    for (const [id] of afterById) {
      if (!beforeById.has(id)) needs.add('createTasks');
    }
    for (const [id] of beforeById) {
      if (!afterById.has(id)) needs.add('deleteTasks');
    }

    const beforeIds = beforeTasks.map((t, idx) => String(t.id ?? `idx:${idx}`));
    const afterIds = afterTasks.map((t, idx) => String(t.id ?? `idx:${idx}`));
    if (beforeIds.length === afterIds.length && JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) {
      needs.add('dragTasks');
    }
    const maxLen = Math.max(beforeTasks.length, afterTasks.length);
    for (let i = 0; i < maxLen; i += 1) {
      const b = beforeTasks[i] || null;
      const a = afterTasks[i] || null;
      if (!b || !a) continue;
      if (String(b.startDate || '') !== String(a.startDate || '') || String(b.releaseDate || '') !== String(a.releaseDate || '')) {
        needs.add('dragTasks');
      }
      const bCore = { ...b, startDate: '', releaseDate: '' };
      const aCore = { ...a, startDate: '', releaseDate: '' };
      if (JSON.stringify(bCore) !== JSON.stringify(aCore)) {
        needs.add('editTasks');
      }
    }
  }

  return needs;
};

const createProjectUser = async () => {
  const hashedPassword = await bcrypt.hash(String(PROJECT_USER_PASSWORD), 10);
  const existing = await User.findOne({ where: { username: PROJECT_USER_USERNAME } });
  if (existing) {
    console.log(`✅ Пользователь делегата уже есть: ${PROJECT_USER_USERNAME} (запись в БД не менялась)`);
    return;
  }
  await User.create({
    username: PROJECT_USER_USERNAME,
    password: hashedPassword,
    initialPassword: String(PROJECT_USER_PASSWORD),
    role: 'project_user'
  });
  console.log(`✅ Создан пользователь делегата: ${PROJECT_USER_USERNAME} (этапы ${ARCHITECT_USERNAME})`);
};
await createProjectUser();

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '127.0.0.1';

const defaultCorsOrigins = [
  'http://localhost:3010',
  'http://127.0.0.1:3010',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3002',
  'http://127.0.0.1:3002',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];
const extraCors = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const corsOrigins = [...new Set([...defaultCorsOrigins, ...extraCors])];

app.use(cors({
  origin: corsOrigins,
  credentials: true
}));

app.use(express.json());

// ==========================================
// API ENDPOINTS
// ==========================================

// Публичная проверка API и БД (для мониторинга / reverse proxy)
app.get('/api/health', async (req, res) => {
  const dialect = sequelize.getDialect();
  let connected = false;
  let dbError = null;
  try {
    await sequelize.authenticate();
    connected = true;
  } catch (e) {
    dbError = e.message;
  }
  const payload = {
    ok: connected,
    database: { dialect, connected },
    uptime: process.uptime()
  };
  if (dbError) payload.error = dbError;
  res.status(connected ? 200 : 503).json(payload);
});

// Инициализация
app.post('/api/init', async (req, res) => {
  try {
    await sequelize.authenticate();
    console.log('✅ База данных готова');
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Ошибка:', error);
    res.status(500).json({ error: error.message });
  }
});

// Логин
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const usernameTrim = String(username ?? '').trim();
    console.log('🔐 Попытка входа:', usernameTrim);

    let user = usernameTrim
      ? await User.findOne({ where: { username: usernameTrim } })
      : null;
    if (!user && usernameTrim) {
      user = await User.findOne({
        where: sqlWhere(fn('lower', col('username')), usernameTrim.toLowerCase())
      });
    }

    if (!user) {
      console.log('❌ Пользователь не найден');
      return res.status(401).json({ error: 'Неверные данные' });
    }

    if (!user.password || typeof user.password !== 'string') {
      console.log('❌ У пользователя некорректный пароль в БД');
      return res.status(401).json({ error: 'Неверные данные' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log('❌ Неверный пароль');
      return res.status(401).json({ error: 'Неверные данные' });
    }
    
    // Проверяем наличие секрета
    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET не задан в .env файле!');
      return res.status(500).json({ error: 'Ошибка конфигурации сервера' });
    }
    
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role,
        permissions: resolveUserPermissions(user)
      },
      process.env.JWT_SECRET, // Только из .env, без запасного!
      { expiresIn: '7d' }
    );

    await writeAuditLog({
      reqUser: { username: user.username, role: user.role },
      action: 'auth_login',
      details: `Успешный вход в систему; роль: ${user.role || '—'}; IP: ${getRequestIp(req)}`
    });
    
    console.log('✅ Успешный вход');
    res.json({
      token,
      username: user.username,
      role: user.role,
      permissions: resolveUserPermissions(user)
    });
    
  } catch (error) {
    console.error('❌ Ошибка входа:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});
// Middleware для проверки JWT
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    console.log('❌ Нет токена в запросе');
    return res.status(401).json({ error: 'Требуется токен' });
  }
  
  // Проверяем, что секретный ключ задан
  if (!process.env.JWT_SECRET) {
    console.error('❌ JWT_SECRET не задан в .env файле!');
    return res.status(500).json({ error: 'Ошибка конфигурации сервера' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
    if (err) {
      console.log('❌ Ошибка верификации токена:', err.message);
      
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Токен истек' });
      }
      
      return res.status(403).json({ error: 'Недействительный токен' });
    }
    
    try {
      const userFromDb = await User.findOne({
        where: sqlWhere(fn('lower', col('username')), String(user.username || '').toLowerCase()),
        attributes: ['id', 'username', 'role', 'permissions']
      });
      if (!userFromDb) {
        return res.status(401).json({ error: 'Пользователь не найден' });
      }
      const resolvedPermissions = resolveUserPermissions(userFromDb);
      console.log(`✅ Токен валиден для пользователя: ${userFromDb.username}`);
      req.user = {
        id: userFromDb.id,
        username: userFromDb.username,
        role: userFromDb.role,
        permissions: resolvedPermissions
      };
      next();
    } catch (dbError) {
      console.error('❌ Ошибка проверки пользователя по токену:', dbError);
      return res.status(500).json({ error: 'Ошибка проверки пользователя' });
    }
  });
};

app.get('/api/assistant/status', authenticateToken, async (req, res) => {
  try {
    if (isGuestUser(req.user)) {
      return res.json({ available: false, reason: 'guest', provider: getAssistantEnv().provider });
    }
    const env = getAssistantEnv();
    if (!env.enabled) {
      return res.json({ available: false, reason: 'disabled', provider: env.provider });
    }
    if (!isAssistantConfigured()) {
      return res.json({ available: false, reason: 'not_configured', provider: env.provider });
    }
    return res.json({ available: true, provider: env.provider });
  } catch (e) {
    console.error('assistant/status', e);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

const assistantStageSortTime = (blockLike) => {
  const p = Date.parse(String(blockLike?.releaseDate || blockLike?.startDate || ''));
  return Number.isFinite(p) ? p : Number.MAX_SAFE_INTEGER;
};

const auditActionLabelRuForAssistant = (action) => {
  switch (action) {
    case 'block_create':
      return 'Создание этапа';
    case 'block_update':
      return 'Изменение этапа/задач';
    case 'block_delete':
      return 'Удаление этапа';
    default:
      return action || 'Событие';
  }
};

/** Аудит только по id этапов проекта (без записи в БД). */
const fetchProjectBlockAuditSince = async (reqUser, blockIds, sinceDate) => {
  if (!canViewTestUserDirectory(reqUser)) {
    return { allowed: false, rows: [] };
  }
  const ids = [...new Set((blockIds || []).map((id) => String(id)).filter(Boolean))];
  if (!ids.length) {
    return { allowed: true, rows: [] };
  }
  const logs = await AuditLog.findAll({
    where: {
      blockId: { [Op.in]: ids },
      createdAt: { [Op.gte]: sinceDate },
      action: { [Op.in]: ['block_create', 'block_update', 'block_delete'] }
    },
    attributes: ['id', 'actorUsername', 'actorRole', 'action', 'blockId', 'blockTitle', 'details', 'createdAt'],
    order: [['createdAt', 'DESC']],
    limit: 150
  });
  const rows = logs.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    actorUsername: row.actorUsername,
    action: row.action,
    actionLabel: auditActionLabelRuForAssistant(row.action),
    blockTitle: row.blockTitle,
    details: row.details || ''
  }));
  return { allowed: true, rows };
};

const parseAssistantAddTaskIntent = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const normalizedRaw = raw
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/(добав|созда|создай|добавь).{0,24}(задач|таск)/i.test(normalizedRaw)) return null;

  const stageMatch = normalizedRaw.match(/(?:в\s*)?(\d+)\s*(?:[-]?\s*(?:й|я|м|ом|ый|ий))?\s*этап/i);
  const stageIndex = stageMatch ? Number(stageMatch[1]) : null;
  let stageName = '';
  const stageNameQuoted = normalizedRaw.match(/(?:в\s+этап(?:е)?\s*)[«"]([^"»\n]{2,120})[»"]/i);
  if (stageNameQuoted?.[1]) stageName = stageNameQuoted[1].trim();
  if (!stageName) {
    const stageNamePlain = normalizedRaw.match(/(?:в\s+этап(?:е)?\s+)([^,.!?\n]{2,120})/i);
    if (stageNamePlain?.[1]) stageName = stageNamePlain[1].trim();
  }

  let title = '';
  const byName = normalizedRaw.match(/(?:с\s+)?названи(?:ем|е)\s*[«"]([^"»\n]+)[»"]/i);
  if (byName?.[1]) title = byName[1].trim();
  if (!title) {
    const byNamePlain = normalizedRaw.match(/(?:с\s+)?названи(?:ем|е)\s+([^,.!?\n]{2,140})/i);
    if (byNamePlain?.[1]) title = byNamePlain[1].trim();
  }
  if (!title) {
    const afterTaskWord = normalizedRaw.match(
      /(?:задач[ауеи]?|таск)\s+(?:с\s+названи(?:ем|е)\s+)?(.+?)(?=\s+в\s+(?:\d+\s*[-]?\s*(?:й|я|м|ом|ый|ий)?\s*этап|этап(?:е)?\b)|[,.!?]|$)/i
    );
    if (afterTaskWord?.[1]) title = afterTaskWord[1].trim();
  }
  if (!title) {
    const quoted = normalizedRaw.match(/[«"]([^"»\n]{2,120})[»"]/);
    if (quoted?.[1]) title = quoted[1].trim();
  }
  if (!title) return { error: 'missing_title' };
  if ((!stageIndex || stageIndex < 1) && !stageName) return { error: 'missing_stage' };
  return { stageIndex, stageName, title: title.slice(0, 140) };
};

const buildAssistantTaskId = () => `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const buildAssistantStageTitle = () => `Этап от ассистента ${new Date().toLocaleString('ru-RU')}`;

const parseAssistantCreateStageIntent = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!/(созда(?:й|ть)?|добав(?:ь|ить)?).{0,24}(этап|стади|спринт|релиз)/i.test(normalized)) return null;
  if (/(задач|таск)/i.test(normalized) && !/(этап|стади|спринт|релиз)/i.test(normalized)) return null;
  const q = normalized.match(/[«"]([^"»\n]{2,120})[»"]/);
  const byName = normalized.match(/(?:с\s+)?названи(?:ем|е)\s+([^,.!?\n]{2,120})/i);
  const title = (q?.[1] || byName?.[1] || '').trim();
  return { title: title || buildAssistantStageTitle() };
};

const nextAssistantStageDates = (blocks) => {
  const list = Array.isArray(blocks) ? blocks : [];
  if (!list.length) {
    const today = new Date();
    const firstStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstEnd = new Date(firstStart);
    firstEnd.setMonth(firstStart.getMonth() + 1);
    firstEnd.setDate(firstEnd.getDate() - 1);
    return {
      startDate: firstStart.toISOString().split('T')[0],
      releaseDate: firstEnd.toISOString().split('T')[0]
    };
  }
  const sortedByEnd = [...list].sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));
  const lastBlock = sortedByEnd[0];
  const lastEndDate = new Date(lastBlock.releaseDate || lastBlock.startDate || Date.now());
  const startDate = lastEndDate.toISOString().split('T')[0];
  const newEndDate = new Date(lastEndDate);
  newEndDate.setMonth(lastEndDate.getMonth() + 1);
  return {
    startDate,
    releaseDate: newEndDate.toISOString().split('T')[0]
  };
};

const maybeApplyAssistantStageMutation = async ({ reqUser, loaded, messages }) => {
  const latestUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const intent = parseAssistantCreateStageIntent(latestUserMessage);
  if (!intent) return null;
  if (!hasPermission(reqUser, 'createStages')) {
    return { applied: false, reply: 'У вашей роли нет права на создание этапов.' };
  }
  const { startDate, releaseDate } = nextAssistantStageDates(loaded.blocks);
  const newBlock = await Block.create({
    title: intent.title,
    description: '',
    startDate,
    releaseDate,
    effort: 40,
    completed: false,
    tasks: [],
    projectId: loaded.project.id,
    ownerUsername: loaded.project.ownerUsername
  });
  await writeAuditLog({
    reqUser,
    action: 'block_create',
    blockId: newBlock.id,
    blockTitle: newBlock.title,
    projectId: newBlock.projectId,
    details: `Ассистент создал этап "${newBlock.title || 'Без названия'}"`
  });
  return {
    applied: true,
    reply: `Готово: создала этап «${newBlock.title}». Обновите доску, он появится в выбранном проекте.`
  };
};

const maybeApplyAssistantTaskMutation = async ({ reqUser, loaded, messages }) => {
  const latestUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const intent = parseAssistantAddTaskIntent(latestUserMessage);
  if (!intent) return null;
  if (intent.error === 'missing_title') {
    return { applied: false, reply: 'Не вижу название новой задачи. Напишите, например: «Добавь в 3-й этап задачу с названием Тепловая карта».' };
  }
  if (intent.error === 'missing_stage') {
    return { applied: false, reply: 'Не вижу номер этапа. Укажите в сообщении номер: «в 3-й этап…».' };
  }

  const sorted = [...(loaded.blocks || [])].sort((a, b) => assistantStageSortTime(a) - assistantStageSortTime(b));
  let target = null;
  if (intent.stageIndex && intent.stageIndex > 0) {
    target = sorted[intent.stageIndex - 1] || null;
  }
  if (!target && intent.stageName) {
    const wanted = intent.stageName.toLowerCase();
    target =
      sorted.find((b) => String(b?.title || '').trim().toLowerCase() === wanted) ||
      sorted.find((b) => String(b?.title || '').toLowerCase().includes(wanted)) ||
      null;
  }
  if (!target) {
    const place = intent.stageName ? `«${intent.stageName}»` : `№${intent.stageIndex}`;
    return { applied: false, reply: `Этап ${place} не найден в выбранном проекте.` };
  }
  if (!(await canMutateBlockViaProject(reqUser, target))) {
    return { applied: false, reply: 'Нет доступа на изменение этого этапа.' };
  }
  if (!hasPermission(reqUser, 'createTasks')) {
    return { applied: false, reply: 'У вашей роли нет права на создание задач.' };
  }

  const prevTasks = Array.isArray(target.tasks) ? target.tasks : [];
  const already = prevTasks.some(
    (t) => String(t?.title || '').trim().toLowerCase() === intent.title.trim().toLowerCase()
  );
  if (already) {
    return { applied: false, reply: `Задача «${intent.title}» уже есть в этапе «${target.title || 'Без названия'}».` };
  }

  const maxOrder = prevTasks.reduce((acc, t) => {
    const n = Number(t?.order);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  const nextTask = {
    id: buildAssistantTaskId(),
    title: intent.title,
    status: 'todo',
    order: maxOrder + 1
  };
  await target.update({ tasks: [...prevTasks, nextTask] });
  await writeAuditLog({
    reqUser,
    action: 'block_update',
    blockId: target.id,
    blockTitle: target.title,
    projectId: target.projectId,
    details: `Ассистент добавил задачу "${intent.title}" в этап "${target.title || 'Без названия'}"`
  });
  return {
    applied: true,
    reply: `Готово: добавила задачу «${intent.title}» в этап «${target.title || 'Без названия'}». Обновите вид этапа — она уже в списке задач.`
  };
};

app.post('/api/assistant/chat', authenticateToken, async (req, res) => {
  try {
    if (isGuestUser(req.user)) {
      return res.status(403).json({ error: 'Ассистент недоступен в режиме гостя' });
    }
    const env = getAssistantEnv();
    if (!env.enabled) {
      return res.status(503).json({ error: 'Ассистент выключен на сервере' });
    }
    if (!isAssistantConfigured()) {
      return res.status(503).json({ error: 'Ассистент не настроен (проверьте ключ в .env)' });
    }
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Ожидается непустой массив messages' });
    }
    const normalized = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: String(m.content).trim() }))
      .filter((m) => m.content)
      .slice(-24);
    if (!normalized.length) {
      return res.status(400).json({ error: 'Нет валидных сообщений (role: user|assistant, content: строка)' });
    }
    if (!normalized.some((m) => m.role === 'user')) {
      return res.status(400).json({ error: 'Нужно хотя бы одно сообщение пользователя (role: user)' });
    }

    const lastUserMessage = [...normalized].reverse().find((m) => m.role === 'user')?.content || '';
    const readOnlyPlan = resolveAssistantReadOnlyPlan({
      explicitMode: req.body?.assistantMode,
      lastUserText: lastUserMessage,
      compareStageIndexA: req.body?.compareStageIndexA,
      compareStageIndexB: req.body?.compareStageIndexB
    });
    const isReadOnlyChat =
      readOnlyPlan.mode === 'executive_summary' ||
      readOnlyPlan.mode === 'weekly_digest' ||
      readOnlyPlan.mode === 'stage_compare';

    const projectId = String(req.body?.projectId || '').trim();
    let projectContext = '';
    let readOnlyInstruction = '';
    if (projectId) {
      const loaded = await loadBlocksForAssistantContext(req.user, projectId);
      if (loaded.error) {
        const msg =
          loaded.error === 'empty_project'
            ? 'Не указан проект'
            : loaded.error === 'no_view'
              ? 'Нет права просмотра'
              : 'Нет доступа к этапам выбранного проекта';
        return res.status(403).json({ error: msg });
      }
      if (!isReadOnlyChat) {
        const stageMutation = await maybeApplyAssistantStageMutation({
          reqUser: req.user,
          loaded,
          messages: normalized
        });
        if (stageMutation?.applied || stageMutation?.reply) {
          return res.json({
            reply: stageMutation.reply,
            applied: Boolean(stageMutation.applied),
            assistantMode: 'default'
          });
        }
        const mutationResult = await maybeApplyAssistantTaskMutation({
          reqUser: req.user,
          loaded,
          messages: normalized
        });
        if (mutationResult?.applied || mutationResult?.reply) {
          return res.json({
            reply: mutationResult.reply,
            applied: Boolean(mutationResult.applied),
            assistantMode: 'default'
          });
        }
      }
      projectContext = formatProjectContextForAssistant(loaded.project, loaded.blocks);

      if (readOnlyPlan.mode === 'executive_summary') {
        projectContext = appendAssistantContextSegment(
          projectContext,
          formatExecutiveStatsAppendix(loaded.project, loaded.blocks)
        );
        readOnlyInstruction =
          'Пользователь просит краткое резюме для руководства на русском: цель релиза, текущее состояние, ключевые цифры из сводки, риски, ближайшие шаги. Используй только факты из данных проекта. Не придумывай этапы и задачи. Не предлагай изменить данные в системе.';
      } else if (readOnlyPlan.mode === 'weekly_digest') {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const blockIds = (loaded.blocks || []).map((b) => b?.id).filter(Boolean);
        const auditPack = await fetchProjectBlockAuditSince(req.user, blockIds, since);
        if (auditPack.allowed) {
          projectContext = appendAssistantContextSegment(
            projectContext,
            formatProjectAuditDigestAppendix(auditPack.rows)
          );
          readOnlyInstruction =
            'Пользователь спросил, что изменилось за неделю. Кратко перескажи по журналу аудита (кто/что/когда) и свяжи с текущим планом. Если записей мало или нет — так и скажи. Только чтение; никаких изменений в системе.';
        } else {
          readOnlyInstruction =
            'Пользователь спросил об изменениях за неделю. Журнал аудита этапов по этому проекту для этой роли недоступен (нет права как у вкладки «Пользователи»). Честно объясни это и опиши текущее состояние проекта по данным выше; для точной хронологии посоветуй пользователя с соответствующими правами.';
        }
      } else if (readOnlyPlan.mode === 'stage_compare') {
        const sorted = [...(loaded.blocks || [])].sort((a, b) => assistantStageSortTime(a) - assistantStageSortTime(b));
        if (readOnlyPlan.compareA != null && readOnlyPlan.compareB != null) {
          projectContext = appendAssistantContextSegment(
            projectContext,
            formatTwoStagesCompareAppendix(sorted, readOnlyPlan.compareA, readOnlyPlan.compareB)
          );
          readOnlyInstruction =
            'Пользователь просит сравнить два этапа. Используй блок «Два этапа для сравнения» и общий список проекта. Выдай сравнение структурированно; не выдумывай задач.';
        } else {
          readOnlyInstruction =
            'Пользователь хочет сравнить этапы, но в сообщении не указаны два номера. Вежливо попроси написать, например: «Сравни этап 2 и этап 5» или «Сравни этапы 1 и 3».';
        }
      }
    } else if (isReadOnlyChat) {
      readOnlyInstruction =
        'Пользователь включил сценарий анализа проекта, но проект в шапке не выбран — попроси выбрать проект и повторить вопрос.';
    }

    const reply = await runAssistantChat(env, normalized, { projectContext, readOnlyInstruction });
    return res.json({ reply, assistantMode: readOnlyPlan.mode, readOnly: isReadOnlyChat });
  } catch (e) {
    console.error('assistant/chat', e);
    return res.status(500).json({ error: e?.message || 'Ошибка ассистента' });
  }
});


const hasAnyFxRate = (rates) =>
  Number.isFinite(Number(rates?.USD)) ||
  Number.isFinite(Number(rates?.EUR)) ||
  Number.isFinite(Number(rates?.CNY));

const fetchJsonWithTimeout = async (url, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
};

const fetchTextWithTimeout = async (url, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
};

app.get('/api/fx-rates', authenticateToken, async (req, res) => {
  try {
    try {
      const data = await fetchJsonWithTimeout('https://open.er-api.com/v6/latest/RUB');
      const rates = data?.rates || {};
      const payload = {
        USD: Number.isFinite(Number(rates.USD)) && Number(rates.USD) > 0 ? 1 / Number(rates.USD) : null,
        EUR: Number.isFinite(Number(rates.EUR)) && Number(rates.EUR) > 0 ? 1 / Number(rates.EUR) : null,
        CNY: Number.isFinite(Number(rates.CNY)) && Number(rates.CNY) > 0 ? 1 / Number(rates.CNY) : null
      };
      if (hasAnyFxRate(payload)) {
        return res.json({
          source: 'open.er-api.com',
          rates: payload
        });
      }
    } catch (error) {
      console.warn('⚠️ Не удалось получить курсы с open.er-api.com:', error.message);
    }

    try {
      const text = await fetchTextWithTimeout('https://www.cbr-xml-daily.ru/daily_json.js');
      const data = JSON.parse(text || '{}');
      const valute = data?.Valute || {};
      const payload = {
        USD: Number.isFinite(Number(valute?.USD?.Value)) ? Number(valute.USD.Value) : null,
        EUR: Number.isFinite(Number(valute?.EUR?.Value)) ? Number(valute.EUR.Value) : null,
        CNY: Number.isFinite(Number(valute?.CNY?.Value)) ? Number(valute.CNY.Value) : null
      };
      if (hasAnyFxRate(payload)) {
        return res.json({
          source: 'ЦБ РФ',
          rates: payload
        });
      }
    } catch (error) {
      console.warn('⚠️ Не удалось получить курсы с cbr-xml-daily.ru:', error.message);
    }

    return res.status(502).json({ error: 'Не удалось получить курсы валют' });
  } catch (error) {
    console.error('❌ Ошибка /api/fx-rates:', error);
    res.status(500).json({ error: 'Ошибка сервера курсов валют' });
  }
});

app.get('/api/projects', authenticateToken, async (req, res) => {
  try {
    const owners = scopeOwnersForUser(req.user);
    for (const owner of owners) {
      await ensureDefaultProjectForOwner(owner);
    }
    const rows = await Project.findAll({
      order: [['isDefault', 'DESC'], ['createdAt', 'ASC']]
    });
    const visible = rows.filter((project) => canAccessProject(req.user, project)).map(formatProjectForResponse);
    res.json(visible);
  } catch (error) {
    console.error('❌ Ошибка получения проектов:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects', authenticateToken, async (req, res) => {
  try {
    if (isGuestUser(req.user)) {
      return res.status(403).json({ error: 'Режим только просмотра' });
    }
    const name = String(req.body?.name || '').trim().slice(0, 80);
    if (!name) {
      return res.status(400).json({ error: 'Название проекта не может быть пустым' });
    }
    const ownerUsername = effectiveOwnerForNewProject(req.user);
    const duplicate = await Project.findOne({
      where: {
        [Op.and]: [
          sqlWhere(fn('lower', col('ownerUsername')), ownerUsername.toLowerCase()),
          sqlWhere(fn('lower', col('name')), name.toLowerCase())
        ]
      }
    });
    if (duplicate) {
      return res.status(409).json({ error: 'Проект с таким названием уже существует' });
    }
    const ownerProjectsCount = await Project.count({ where: { ownerUsername } });
    const project = await Project.create({
      ownerUsername,
      name,
      isDefault: ownerProjectsCount === 0
    });
    res.status(201).json(formatProjectForResponse(project));
  } catch (error) {
    console.error('❌ Ошибка создания проекта:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    if (isGuestUser(req.user)) {
      return res.status(403).json({ error: 'Режим только просмотра' });
    }
    const project = await Project.findByPk(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Проект не найден' });
    }
    if (!canManageProjectMembers(req.user, project)) {
      return res.status(403).json({ error: 'Нет доступа к проекту' });
    }
    const name = String(req.body?.name || '').trim().slice(0, 80);
    if (!name) {
      return res.status(400).json({ error: 'Название проекта не может быть пустым' });
    }
    const duplicate = await Project.findOne({
      where: {
        id: { [Op.ne]: project.id },
        ownerUsername: project.ownerUsername,
        [Op.and]: [
          sqlWhere(fn('lower', col('name')), name.toLowerCase())
        ]
      }
    });
    if (duplicate) {
      return res.status(409).json({ error: 'Проект с таким названием уже существует' });
    }
    await project.update({ name });
    res.json(formatProjectForResponse(project));
  } catch (error) {
    console.error('❌ Ошибка переименования проекта:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    if (isGuestUser(req.user)) {
      return res.status(403).json({ error: 'Режим только просмотра' });
    }
    const project = await Project.findByPk(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Проект не найден' });
    }
    if (!canManageProjectMembers(req.user, project)) {
      return res.status(403).json({ error: 'Нет доступа к проекту' });
    }

    let fallbackProject = await Project.findOne({
      where: {
        ownerUsername: project.ownerUsername,
        id: { [Op.ne]: project.id }
      },
      order: [['isDefault', 'DESC'], ['createdAt', 'ASC']]
    });

    if (!fallbackProject) {
      fallbackProject = await Project.create({
        ownerUsername: project.ownerUsername,
        name: 'Проект 1',
        isDefault: true
      });
    } else if (project.isDefault) {
      await fallbackProject.update({ isDefault: true });
    }

    await Block.update(
      { projectId: fallbackProject.id },
      { where: { projectId: project.id } }
    );
    await project.destroy();

    res.json({
      success: true,
      deletedProjectId: project.id,
      fallbackProjectId: fallbackProject.id,
      fallbackProject: formatProjectForResponse(fallbackProject)
    });
  } catch (error) {
    console.error('❌ Ошибка удаления проекта:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:id/members', authenticateToken, async (req, res) => {
  try {
    if (isGuestUser(req.user)) {
      return res.status(403).json({ error: 'Режим только просмотра' });
    }
    const project = await Project.findByPk(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Проект не найден' });
    }
    if (!canManageProjectMembers(req.user, project)) {
      return res.status(403).json({ error: 'Нет доступа к управлению участниками проекта' });
    }
    const targetUsername = String(req.body?.username || '').trim();
    if (!targetUsername) {
      return res.status(400).json({ error: 'Укажите логин пользователя' });
    }
    const targetUser = await User.findOne({
      where: sqlWhere(fn('lower', col('username')), targetUsername.toLowerCase()),
      attributes: ['username']
    });
    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    if (normalizeUsernameLower(targetUser.username) === normalizeUsernameLower(project.ownerUsername)) {
      return res.status(400).json({ error: 'Владелец уже имеет доступ к проекту' });
    }

    const currentMembers = parseSharedUsernames(project.sharedUsernames);
    const hasAlready = currentMembers.some((item) => normalizeUsernameLower(item) === normalizeUsernameLower(targetUser.username));
    if (!hasAlready) {
      currentMembers.push(targetUser.username);
      await project.update({ sharedUsernames: JSON.stringify(currentMembers) });
    }
    return res.json({
      success: true,
      projectId: project.id,
      ownerUsername: project.ownerUsername,
      sharedUsernames: parseSharedUsernames(hasAlready ? project.sharedUsernames : JSON.stringify(currentMembers))
    });
  } catch (error) {
    console.error('❌ Ошибка добавления участника проекта:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/projects/:id/members', authenticateToken, async (req, res) => {
  try {
    if (isGuestUser(req.user)) {
      return res.status(403).json({ error: 'Режим только просмотра' });
    }
    const project = await Project.findByPk(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Проект не найден' });
    }
    if (!canManageProjectMembers(req.user, project)) {
      return res.status(403).json({ error: 'Нет доступа к управлению участниками проекта' });
    }
    const targetUsername = String(req.body?.username || '').trim();
    if (!targetUsername) {
      return res.status(400).json({ error: 'Укажите логин пользователя' });
    }
    const currentMembers = parseSharedUsernames(project.sharedUsernames);
    const nextMembers = currentMembers.filter((item) => normalizeUsernameLower(item) !== normalizeUsernameLower(targetUsername));
    await project.update({ sharedUsernames: JSON.stringify(nextMembers) });
    return res.json({
      success: true,
      projectId: project.id,
      ownerUsername: project.ownerUsername,
      sharedUsernames: nextMembers
    });
  } catch (error) {
    console.error('❌ Ошибка удаления участника проекта:', error);
    res.status(500).json({ error: error.message });
  }
});

// Те же правила доступа, что GET /api/blocks?projectId= — для контекста ассистента.
async function loadBlocksForAssistantContext(user, projectId) {
  const pid = String(projectId || '').trim();
  if (!pid) return { error: 'empty_project' };
  if (!hasPermission(user, 'view')) return { error: 'no_view' };
  const project = await Project.findByPk(pid);
  if (!project || !canAccessProject(user, project)) return { error: 'no_project_access' };
  if (isProjectDelegateUser(user)) {
    const targets = delegateBlockOwnerTargets();
    const whereClause = {
      [Op.or]: targets.map((t) => sqlWhere(fn('lower', col('ownerUsername')), t.toLowerCase())),
      projectId: pid
    };
    const blocks = await Block.findAll({
      where: whereClause,
      order: [['releaseDate', 'ASC']]
    });
    return { project, blocks };
  }
  const ownerFilter = ownerScopeForBlocks(user);
  const blocks = await Block.findAll({
    where: { ownerUsername: ownerFilter, projectId: pid },
    order: [['releaseDate', 'ASC']]
  });
  return { project, blocks };
}

// Получить все блоки (требуется токен)
app.get('/api/blocks', authenticateToken, async (req, res) => {
  try {
    const projectId = String(req.query?.projectId || '').trim();
    if (projectId) {
      const project = await Project.findByPk(projectId);
      if (!project || !canAccessProject(req.user, project)) {
        return res.status(403).json({ error: 'Нет доступа к выбранному проекту' });
      }
    }
    if (isProjectDelegateUser(req.user)) {
      const targets = delegateBlockOwnerTargets();
      const whereClause = {
        [Op.or]: targets.map((t) =>
          sqlWhere(fn('lower', col('ownerUsername')), t.toLowerCase())
        )
      };
      if (projectId) whereClause.projectId = projectId;
      const blocks = await Block.findAll({
        where: whereClause,
        order: [['releaseDate', 'ASC']]
      });
      return res.json(blocks);
    }
    const ownerFilter = ownerScopeForBlocks(req.user);
    const whereClause = { ownerUsername: ownerFilter };
    if (projectId) whereClause.projectId = projectId;
    const blocks = await Block.findAll({
      where: whereClause,
      order: [['releaseDate', 'ASC']]
    });
    res.json(blocks);
  } catch (error) {
    console.error('❌ Ошибка получения блоков:', error);
    res.status(500).json({ error: error.message });
  }
});

// Создать блок (требуется токен)
app.post('/api/blocks', authenticateToken, async (req, res) => {
  try {
    if (isGuestUser(req.user)) {
      return res.status(403).json({ error: 'Режим только просмотра' });
    }
    if (!hasPermission(req.user, 'createStages')) {
      return res.status(403).json({ error: 'Нет права на создание этапов' });
    }
    console.log('📝 Создание блока:', req.body);
    const requestedProject = String(req.body?.projectId || '').trim();
    if (!requestedProject) {
      return res.status(400).json({ error: 'Не выбран проект для нового этапа' });
    }
    const project = await resolveProjectForWrite({
      user: req.user,
      requestedProjectId: requestedProject,
      ownerUsername: req.user.username
    });
    if (!project) {
      return res.status(403).json({ error: 'Нет доступа к выбранному проекту' });
    }
    const ownerUsername = String(project.ownerUsername || req.user.username || '').trim();
    const payload = { ...req.body, ownerUsername, projectId: project.id };
    const newBlock = await Block.create(payload);
    await writeAuditLog({
      reqUser: req.user,
      action: 'block_create',
      blockId: newBlock.id,
      blockTitle: newBlock.title,
      details: `Создан этап "${newBlock.title || 'Без названия'}"`
    });
    res.status(201).json(newBlock);
  } catch (error) {
    console.error('❌ Ошибка создания:', error);
    res.status(500).json({ error: error.message });
  }
});

// Обновить блок (требуется токен)
app.put('/api/blocks/:id', authenticateToken, async (req, res) => {
  try {
    if (isGuestUser(req.user)) {
      return res.status(403).json({ error: 'Режим только просмотра' });
    }
    const block = await Block.findByPk(req.params.id);
    if (!block) {
      return res.status(404).json({ error: 'Блок не найден' });
    }
    if (!(await canMutateBlockViaProject(req.user, block))) {
      return res.status(403).json({ error: 'Нет доступа к этому этапу' });
    }
    const permissionNeeds = inferBlockPermissionNeeds(block, req.body);
    if (permissionNeeds.has('editStages') && !hasPermission(req.user, 'editStages')) {
      return res.status(403).json({ error: 'Нет права редактирования этапов' });
    }
    if (permissionNeeds.has('dragStages') && !hasPermission(req.user, 'dragStages')) {
      return res.status(403).json({ error: 'Нет права перетаскивания этапов' });
    }
    if (permissionNeeds.has('createTasks') && !hasPermission(req.user, 'createTasks')) {
      return res.status(403).json({ error: 'Нет права на создание задач' });
    }
    if (permissionNeeds.has('deleteTasks') && !hasPermission(req.user, 'deleteTasks')) {
      return res.status(403).json({ error: 'Нет права на удаление задач' });
    }
    if (permissionNeeds.has('editTasks') && !hasPermission(req.user, 'editTasks')) {
      return res.status(403).json({ error: 'Нет права редактирования задач' });
    }
    if (permissionNeeds.has('dragTasks') && !hasPermission(req.user, 'dragTasks')) {
      return res.status(403).json({ error: 'Нет права перетаскивания задач' });
    }
    const before = {
      id: block.id,
      title: block.title,
      description: block.description,
      ownerUsername: block.ownerUsername,
      projectId: block.projectId,
      startDate: block.startDate,
      releaseDate: block.releaseDate,
      effort: block.effort,
      completed: block.completed,
      tasks: Array.isArray(block.tasks) ? block.tasks : []
    };
    const project = await resolveProjectForWrite({
      user: req.user,
      requestedProjectId: req.body?.projectId ?? block.projectId,
      ownerUsername: block.ownerUsername
    });
    if (!project) {
      return res.status(403).json({ error: 'Нет доступа к выбранному проекту' });
    }
    const ownerUsername = String(project.ownerUsername || block.ownerUsername || '').trim();
    await block.update({ ...req.body, ownerUsername, projectId: project.id });
    const after = {
      id: block.id,
      title: block.title,
      description: block.description,
      ownerUsername: block.ownerUsername,
      projectId: block.projectId,
      startDate: block.startDate,
      releaseDate: block.releaseDate,
      effort: block.effort,
      completed: block.completed,
      tasks: Array.isArray(block.tasks) ? block.tasks : []
    };
    const changes = summarizeBlockChanges(before, after);
    if (changes.length) {
      await writeAuditLog({
        reqUser: req.user,
        action: 'block_update',
        blockId: block.id,
        blockTitle: block.title,
        details: changes.join('; ')
      });
    }
    res.json(block);
  } catch (error) {
    console.error('❌ Ошибка обновления:', error);
    res.status(500).json({ error: error.message });
  }
});

// Удалить блок (требуется токен)
app.delete('/api/blocks/:id', authenticateToken, async (req, res) => {
  try {
    if (isGuestUser(req.user)) {
      return res.status(403).json({ error: 'Режим только просмотра' });
    }
    if (!hasPermission(req.user, 'deleteStages')) {
      return res.status(403).json({ error: 'Нет права на удаление этапов' });
    }
    const block = await Block.findByPk(req.params.id);
    if (!block) {
      return res.status(404).json({ error: 'Блок не найден' });
    }
    if (!(await canMutateBlockViaProject(req.user, block))) {
      return res.status(403).json({ error: 'Нет доступа к этому этапу' });
    }
    const deletedBlockTitle = block.title;
    const deletedBlockId = block.id;
    await block.destroy();
    await writeAuditLog({
      reqUser: req.user,
      action: 'block_delete',
      blockId: deletedBlockId,
      blockTitle: deletedBlockTitle,
      details: `Удалён этап "${deletedBlockTitle || 'Без названия'}"`
    });
    res.status(204).send();
  } catch (error) {
    console.error('❌ Ошибка удаления:', error);
    res.status(500).json({ error: error.message });
  }
});

// Персональные данные рабочего стола текущего пользователя
app.get('/api/workspace-state', authenticateToken, async (req, res) => {
  try {
    const username = String(req.user?.username || '').trim();
    if (!username) return res.status(400).json({ error: 'Некорректный пользователь' });

    const row = await WorkspaceState.findOne({ where: { username } });
    if (!row) {
      return res.json({ notes: '', tasks: [], todoNotebook: [] });
    }
    res.json({
      notes: String(row.notes || ''),
      tasks: Array.isArray(row.tasks) ? row.tasks : [],
      todoNotebook: Array.isArray(row.todoNotebook) ? row.todoNotebook : []
    });
  } catch (error) {
    console.error('❌ Ошибка чтения workspace-state:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/workspace-state', authenticateToken, async (req, res) => {
  try {
    const username = String(req.user?.username || '').trim();
    if (!username) return res.status(400).json({ error: 'Некорректный пользователь' });

    const notes = String(req.body?.notes || '');
    const tasksRaw = Array.isArray(req.body?.tasks) ? req.body.tasks : [];
    const tasks = tasksRaw.map((task) => {
      const id = String(task?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      const text = String(task?.text || '')
      const time = String(task?.time || '09:00')
      const startDate = String(task?.startDate || '')
      const doneByDate = task?.doneByDate && typeof task.doneByDate === 'object' ? task.doneByDate : {}
      let recurrence = ['none', 'daily', 'weekdays', 'monthly', 'custom_days'].includes(task?.recurrence)
        ? task.recurrence
        : 'none'
      let recurrenceWeekdays = Array.isArray(task?.recurrenceWeekdays)
        ? [...new Set(task.recurrenceWeekdays.map((n) => Number(n)))]
            .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
            .sort((a, b) => a - b)
        : []
      if (recurrence !== 'custom_days') recurrenceWeekdays = []
      if (recurrence === 'custom_days' && recurrenceWeekdays.length === 0) recurrence = 'none'
      const base = { id, text, time, startDate, recurrence, doneByDate }
      if (recurrence === 'custom_days') return { ...base, recurrenceWeekdays }
      return base
    });
    const todoNotebookRaw = Array.isArray(req.body?.todoNotebook) ? req.body.todoNotebook : [];
    const todoNotebook = todoNotebookRaw.map((entry) => ({
      id: String(entry?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      title: String(entry?.title || '').trim().slice(0, 140),
      points: Array.isArray(entry?.points)
        ? entry.points
            .map((item) => {
              if (item && typeof item === 'object' && !Array.isArray(item)) {
                return {
                  id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
                  text: String(item.text || '').trim().slice(0, 220),
                  done: Boolean(item.done),
                  linkUrl: String(item.linkUrl || item.url || item.link || '')
                    .trim()
                    .slice(0, 400)
                };
              }
              return {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                text: String(item || '').trim().slice(0, 220),
                done: false
              };
            })
            .filter((item) => item.text)
            .slice(0, 100)
        : []
    }));

    const [row] = await WorkspaceState.findOrCreate({
      where: { username },
      defaults: { username, notes: '', tasks: [], todoNotebook: [] }
    });
    await row.update({ notes, tasks, todoNotebook });
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Ошибка сохранения workspace-state:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/workspace-state', authenticateToken, async (req, res) => {
  try {
    const username = String(req.user?.username || '').trim();
    if (!username) return res.status(400).json({ error: 'Некорректный пользователь' });
    await WorkspaceState.destroy({ where: { username } });
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Ошибка очистки workspace-state:', error);
    res.status(500).json({ error: error.message });
  }
});

// Справочник пользователей (логин, пароль из .env где известен, права). Только не-production или ENABLE_TEST_USER_DIRECTORY=true; только Project Architect.
app.get('/api/users/test-directory', authenticateToken, async (req, res) => {
  try {
    if (!testUserDirectoryEnabled()) {
      return res.status(404).json({ error: 'Недоступно' });
    }
    if (!canViewTestUserDirectory(req.user)) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    const users = await User.findAll({
      attributes: ['username', 'role', 'permissions', 'password', 'initialPassword'],
      order: [['username', 'ASC']]
    });
    const rows = users.map((row) => {
      const username = row.username;
      const role = row.role;
      const permissions = resolveUserPermissions(row);
      const rights = describePermissions({ role, permissions });
      const uLower = String(username || '').trim().toLowerCase();
      const fromEnv = passwordFromEnvForUsername(username);
      const initialPlain = String(row.initialPassword || '').trim();
      const resolvedInitial = initialPlain || fromEnv || null;
      const passwordNote = resolvedInitial
        ? 'Исходный пароль пользователя.'
        : 'Исходный пароль неизвестен: в БД хранится только bcrypt-хэш.';
      return {
        username,
        role,
        permissions,
        rights,
        passwordPlain: resolvedInitial,
        passwordHash: String(row.password || ''),
        passwordNote
      };
    });
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.json(rows);
  } catch (error) {
    console.error('❌ Ошибка test-directory:', error);
    res.status(500).json({ error: error.message });
  }
});

// История изменений этапов/задач (аудит). Доступ — как у вкладки "Пользователи".
app.get('/api/users/change-history', authenticateToken, async (req, res) => {
  try {
    if (!canViewTestUserDirectory(req.user)) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(10, Math.min(300, Math.floor(limitRaw)))
      : 120;

    const logs = await AuditLog.findAll({
      attributes: ['id', 'actorUsername', 'actorRole', 'action', 'blockId', 'blockTitle', 'details', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit
    });

    const actionLabel = (action) => {
      switch (action) {
        case 'auth_login':
          return 'Вход в систему';
        case 'user_create':
          return 'Создание пользователя';
        case 'user_update':
          return 'Изменение пользователя';
        case 'user_delete':
          return 'Удаление пользователя';
        case 'block_create':
          return 'Создание этапа';
        case 'block_update':
          return 'Изменение этапа/задач';
        case 'block_delete':
          return 'Удаление этапа';
        default:
          return action || 'Событие';
      }
    };

    const rows = logs.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      actorUsername: row.actorUsername,
      actorRole: row.actorRole,
      action: row.action,
      actionLabel: actionLabel(row.action),
      blockId: row.blockId,
      blockTitle: row.blockTitle,
      details: row.details || ''
    }));

    res.json(rows);
  } catch (error) {
    console.error('❌ Ошибка истории изменений:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить список пользователей для выбора владельца этапа
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    if (isGuestUser(req.user)) {
      return res.json([]);
    }
    if (isProjectDelegateUser(req.user)) {
      let owner = await User.findOne({
        where: { username: ARCHITECT_USERNAME },
        attributes: ['username', 'role', 'permissions']
      });
      if (!owner && GUEST_VIEW_OWNER && GUEST_VIEW_OWNER !== ARCHITECT_USERNAME) {
        owner = await User.findOne({
          where: { username: GUEST_VIEW_OWNER },
          attributes: ['username', 'role', 'permissions']
        });
      }
      const label = owner?.username || ARCHITECT_USERNAME;
      const rows = owner
        ? [{
            username: owner.username,
            role: owner.role,
            permissions: resolveUserPermissions(owner),
            rights: `Владелец этапов (${label})`
          }]
        : [];
      return res.json(rows);
    }
    const users = await User.findAll({
      attributes: ['username', 'role', 'permissions'],
      order: [['username', 'ASC']]
    });
    const base = users.map((u) => ({
      username: u.username,
      role: u.role,
      permissions: resolveUserPermissions(u)
    }));
    if (req.user.username !== ARCHITECT_USERNAME) {
      return res.json(base);
    }
    const withRights = base.map((row) => ({
      ...row,
      permissions: resolveUserPermissions(row),
      rights: describePermissions(row)
    }));
    res.json(withRights);
  } catch (error) {
    console.error('❌ Ошибка получения пользователей:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/manage', authenticateToken, async (req, res) => {
  try {
    if (!canManageUsersFromPanel(req.user)) {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();
    const roleRaw = String(req.body?.role || '').trim().toLowerCase();
    const allowedRoles = new Set(['admin', 'guest', 'project_user', 'user']);
    const role = allowedRoles.has(roleRaw) ? roleRaw : 'user';
    const permissionsPatch = normalizePermissionsPatch(req.body?.permissions);
    const permissions = { ...defaultPermissionsByRole(role), ...permissionsPatch };

    if (!username) return res.status(400).json({ error: 'Укажите логин' });
    if (!password) return res.status(400).json({ error: 'Укажите пароль' });
    if (password.length < 3) return res.status(400).json({ error: 'Пароль слишком короткий (минимум 3 символа)' });

    const exists = await User.findOne({
      where: sqlWhere(fn('lower', col('username')), username.toLowerCase())
    });
    if (exists) return res.status(409).json({ error: 'Пользователь с таким логином уже существует' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const created = await User.create({
      username,
      password: hashedPassword,
      initialPassword: password,
      role,
      permissions: JSON.stringify(permissions)
    });

    await writeAuditLog({
      reqUser: req.user,
      action: 'user_create',
      details: `Создан пользователь "${created.username}" с ролью "${role}" и правами: ${describePermissions({ role, permissions })}.`
    });

    res.json({ success: true, username: created.username, role: created.role, permissions });
  } catch (error) {
    console.error('❌ Ошибка создания пользователя:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/manage/:username', authenticateToken, async (req, res) => {
  try {
    if (!canManageUsersFromPanel(req.user)) {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    const targetUsername = String(req.params?.username || '').trim();
    if (!targetUsername) return res.status(400).json({ error: 'Некорректный логин пользователя' });

    const user = await User.findOne({
      where: sqlWhere(fn('lower', col('username')), targetUsername.toLowerCase())
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const updates = {};
    const changes = [];

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'role')) {
      const nextRoleRaw = String(req.body?.role || '').trim().toLowerCase();
      const allowedRoles = new Set(['admin', 'guest', 'project_user', 'user']);
      if (!allowedRoles.has(nextRoleRaw)) {
        return res.status(400).json({ error: 'Недопустимая роль' });
      }
      if (String(user.role || '') !== nextRoleRaw) {
        updates.role = nextRoleRaw;
        changes.push(`роль: "${user.role || '—'}" → "${nextRoleRaw}"`);
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'permissions')) {
      const roleForPermissions = String(updates.role || user.role || 'user');
      const currentPermissions = resolveUserPermissions({ role: roleForPermissions, permissions: user.permissions });
      const patchPermissions = normalizePermissionsPatch(req.body?.permissions);
      const nextPermissions = { ...currentPermissions, ...patchPermissions };
      updates.permissions = JSON.stringify(nextPermissions);
      changes.push(`права: ${describePermissions({ role: roleForPermissions, permissions: nextPermissions })}`);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'password')) {
      const nextPassword = String(req.body?.password || '').trim();
      if (!nextPassword) {
        return res.status(400).json({ error: 'Пароль не может быть пустым' });
      }
      if (nextPassword.length < 3) {
        return res.status(400).json({ error: 'Пароль слишком короткий (минимум 3 символа)' });
      }
      updates.password = await bcrypt.hash(nextPassword, 10);
      updates.initialPassword = nextPassword;
      changes.push('пароль: обновлён');
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'Нет изменений для сохранения' });
    }

    await user.update(updates);

    await writeAuditLog({
      reqUser: req.user,
      action: 'user_update',
      details: `Пользователь "${user.username}": ${changes.join('; ')}.`
    });

    res.json({ success: true, username: user.username, role: user.role, permissions: resolveUserPermissions(user) });
  } catch (error) {
    console.error('❌ Ошибка обновления пользователя:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/manage/:username', authenticateToken, async (req, res) => {
  try {
    if (!canManageUsersFromPanel(req.user)) {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    const targetUsername = String(req.params?.username || '').trim();
    const confirmUsername = String(req.body?.confirmUsername || '').trim();
    if (!targetUsername) return res.status(400).json({ error: 'Некорректный логин пользователя' });
    if (confirmUsername !== targetUsername) {
      return res.status(400).json({ error: 'Подтверждение логина не совпадает' });
    }
    if (String(targetUsername).toLowerCase() === String(req.user?.username || '').toLowerCase()) {
      return res.status(400).json({ error: 'Нельзя удалить текущего пользователя' });
    }

    const user = await User.findOne({
      where: sqlWhere(fn('lower', col('username')), targetUsername.toLowerCase())
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (String(user.username || '').toLowerCase() === String(ARCHITECT_USERNAME || '').toLowerCase()) {
      return res.status(400).json({ error: 'Нельзя удалить основного владельца дорожной карты' });
    }

    await WorkspaceState.destroy({ where: { username: user.username } });
    await user.destroy();

    await writeAuditLog({
      reqUser: req.user,
      action: 'user_delete',
      details: `Удалён пользователь "${targetUsername}".`
    });

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Ошибка удаления пользователя:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`🗄️ БД: ${sequelize.getDialect()}`);
  console.log(`📡 Локальный доступ:`);
  console.log(`   http://${HOST}:${PORT}`);
});