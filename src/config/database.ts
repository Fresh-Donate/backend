import { Sequelize } from 'sequelize-typescript';
import { config } from './index';

const { host, port, name, user, password } = config.database;

// Import all entity models here (NOT base.model — it's abstract)
import { ShopSettings } from '../models/shop-settings.model';
import { Product } from '../models/product.model';
import { Settings } from '../models/settings.model';
import { PaymentProvider } from '../models/payment-provider.model';

const models: any[] = [ShopSettings, Product, Settings, PaymentProvider];

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

    await sequelize.sync({ alter: true });
    console.log('Database synced.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
}
