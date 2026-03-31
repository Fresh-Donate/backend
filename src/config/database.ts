import { Sequelize } from 'sequelize-typescript';
import { config } from './index';

const { host, port, name, user, password } = config.database;

// Import all entity models here (NOT base.model — it's abstract)
const models: any[] = [];

export const sequelize = new Sequelize({
  dialect: 'postgres',
  host,
  port,
  database: name,
  username: user,
  password,
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  models,
  pool: {
    max: 10,
    min: 2,
    acquire: 30000,
    idle: 10000,
  },
  define: {
    timestamps: true,
    underscored: true,
  },
});

export async function initDatabase(): Promise<void> {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('Database synced (alter mode).');
    }
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
}
