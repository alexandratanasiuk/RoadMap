import { Sequelize, DataTypes } from 'sequelize';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendDir = join(__dirname, '..');

const sqliteStorage = process.env.SQLITE_STORAGE || join(backendDir, 'database.sqlite');
const postgresUrl = process.env.DATABASE_URL;

if (!postgresUrl) {
  console.error('❌ DATABASE_URL не задан. Укажите строку подключения к PostgreSQL в .env');
  process.exit(1);
}

const defineModels = (sequelize) => {
  const User = sequelize.define('User', {
    username: { type: DataTypes.STRING, unique: true },
    password: { type: DataTypes.STRING },
    role: { type: DataTypes.STRING, defaultValue: 'user' }
  });

  const Block = sequelize.define('Block', {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    title: DataTypes.STRING,
    description: DataTypes.TEXT,
    startDate: DataTypes.STRING,
    releaseDate: DataTypes.STRING,
    effort: DataTypes.INTEGER,
    completed: DataTypes.BOOLEAN,
    tasks: {
      type: DataTypes.TEXT,
      defaultValue: '[]'
    }
  }, {
    timestamps: true
  });

  return { User, Block };
};

const sqlite = new Sequelize({
  dialect: 'sqlite',
  storage: sqliteStorage,
  logging: false
});

const postgres = new Sequelize(postgresUrl, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: process.env.DB_SSL === 'true'
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : undefined
});

const source = defineModels(sqlite);
const target = defineModels(postgres);

const migrate = async () => {
  try {
    console.log('🔎 Проверка подключений...');
    await sqlite.authenticate();
    await postgres.authenticate();
    console.log('✅ SQLite и PostgreSQL доступны');

    await target.User.sync({ alter: true });
    await target.Block.sync({ alter: true });

    const users = await source.User.findAll({ raw: true });
    const blocks = await source.Block.findAll({ raw: true });

    if (users.length) {
      await target.User.bulkCreate(users, {
        updateOnDuplicate: ['username', 'password', 'role', 'updatedAt']
      });
    }

    if (blocks.length) {
      await target.Block.bulkCreate(blocks, {
        updateOnDuplicate: [
          'title',
          'description',
          'startDate',
          'releaseDate',
          'effort',
          'completed',
          'tasks',
          'updatedAt'
        ]
      });
    }

    console.log(`✅ Миграция завершена: users=${users.length}, blocks=${blocks.length}`);
  } catch (error) {
    console.error('❌ Ошибка миграции:', error);
    process.exitCode = 1;
  } finally {
    await sqlite.close();
    await postgres.close();
  }
};

await migrate();
