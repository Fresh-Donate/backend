import { type Sequelize } from 'sequelize';
import { Client } from 'pg';
import { Sequelize as SequelizeTS } from 'sequelize-typescript';
import { config } from './index';
import { runMigrations } from './migrations';

const { host, port, name, user, password } = config.database;

// Import all entity models here (NOT base.model - it's abstract)
import { ShopSettings } from '@/models/shop-settings.model';
import { Product } from '@/models/product.model';
import { Settings } from '@/models/settings.model';
import { PaymentProvider } from '@/models/payment-provider.model';
import { PaymentOption } from '@/models/payment-option.model';
import { Payment } from '@/models/payment.model';
import { PaymentItem } from '@/models/payment-item.model';
import { Promotion } from '@/models/promotion.model';
import { PromotionProduct } from '@/models/promotion-product.model';
import { Group } from '@/models/group.model';
import { GroupProduct } from '@/models/group-product.model';
import { Server } from '@/models/server.model';
import { ProductServer } from '@/models/product-server.model';
import { PaymentDelivery } from '@/models/payment-delivery.model';

const models: any[] = [ShopSettings, Product, Settings, PaymentProvider, PaymentOption, Payment, PaymentItem, Promotion, PromotionProduct, Group, GroupProduct, Server, ProductServer, PaymentDelivery];

export const sequelize = new SequelizeTS({
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

const MIGRATION_LOCK_ID = 7301514;

async function withMigrationLock(fn: () => Promise<void>): Promise<void> {
  const client = new Client({ host, port, database: name, user, password });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await fn();
  } finally {
    await client.end();
  }
}

export async function initDatabase(): Promise<void> {
  if (process.env.SKIP_DB === 'true') {
    console.log('SKIP_DB=true - skipping database initialization');
    return;
  }
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    await withMigrationLock(async () => {
      const existingTables = await sequelize.getQueryInterface().showAllTables();
      if (existingTables.length === 0) {
        console.log('Detected first run. Creating tables...');
        await sequelize.sync();
      }

      await runMigrations(sequelize as unknown as Sequelize);
      await sequelize.sync({ alter: { drop: false } });
    });

    console.log('Database is up to date.');
  } catch (error) {
    console.error('Unable to initialize the database:', error);
    throw error;
  }
}
