/**
 * Резервная копия данных основного проекта (без вызова pg_dump).
 * - Postgres: экспорт всех public-таблиц в JSON + manifest.
 * - SQLite: копия файла БД в каталог backups/.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

const stamp = () =>
  new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);

const outBase = path.join(backendRoot, 'backups', `backup-${stamp()}`);
fs.mkdirSync(outBase, { recursive: true });

const dialect = (process.env.DB_DIALECT || '').toLowerCase();
const databaseUrl = process.env.DATABASE_URL;
const sqlitePath = process.env.SQLITE_STORAGE
  ? path.isAbsolute(process.env.SQLITE_STORAGE)
    ? process.env.SQLITE_STORAGE
    : path.join(backendRoot, process.env.SQLITE_STORAGE.replace(/^\.\//, ''))
  : path.join(backendRoot, 'database.sqlite');

async function backupPostgres() {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  let dbName = '';
  try {
    const u = new URL(databaseUrl.replace(/^postgres:/, 'postgresql:'));
    dbName = u.pathname?.replace(/^\//, '') || '';
  } catch {
    dbName = '(unknown)';
  }

  const { rows: tables } = await client.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);

  const manifest = {
    createdAt: new Date().toISOString(),
    dialect: 'postgres',
    database: dbName,
    tables: []
  };

  for (const { tablename } of tables) {
    const safe = `"${String(tablename).replace(/"/g, '""')}"`;
    const { rows } = await client.query(`SELECT * FROM ${safe}`);
    const file = path.join(outBase, `${tablename}.json`);
    fs.writeFileSync(file, JSON.stringify(rows, null, 2), 'utf8');
    manifest.tables.push({ name: tablename, rows: rows.length, file: `${tablename}.json` });
    console.log(`  ${tablename}: ${rows.length} строк → ${path.basename(file)}`);
  }

  await client.end();

  fs.writeFileSync(path.join(outBase, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\n✅ Postgres: ${outBase}`);
}

function backupSqlite() {
  if (!fs.existsSync(sqlitePath)) {
    console.error(`❌ Файл SQLite не найден: ${sqlitePath}`);
    process.exit(1);
  }
  const dest = path.join(outBase, path.basename(sqlitePath));
  fs.copyFileSync(sqlitePath, dest);
  const manifest = {
    createdAt: new Date().toISOString(),
    dialect: 'sqlite',
    source: sqlitePath,
    file: path.basename(dest)
  };
  fs.writeFileSync(path.join(outBase, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\n✅ SQLite: скопировано в ${outBase}`);
}

try {
  console.log(`Каталог бэкапа: ${outBase}\n`);
  if (dialect === 'postgres' && databaseUrl) {
    await backupPostgres();
  } else {
    backupSqlite();
  }
} catch (e) {
  console.error('❌ Ошибка бэкапа:', e.message);
  process.exit(1);
}
