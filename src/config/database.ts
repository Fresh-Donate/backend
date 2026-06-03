import { type Sequelize, QueryTypes } from 'sequelize';
import { Sequelize as SequelizeTS } from 'sequelize-typescript';
import { config } from './index';

const { host, port, name, user, password } = config.database;

// Import all entity models here (NOT base.model - it's abstract)
import { ShopSettings } from '@/models/shop-settings.model';
import { Product } from '@/models/product.model';
import { Settings } from '@/models/settings.model';
import { PaymentProvider } from '@/models/payment-provider.model';
import { PaymentOption } from '@/models/payment-option.model';
import { Payment } from '@/models/payment.model';
import { Promotion } from '@/models/promotion.model';
import { PromotionProduct } from '@/models/promotion-product.model';
import { Group } from '@/models/group.model';
import { GroupProduct } from '@/models/group-product.model';
import { Server } from '@/models/server.model';
import { ProductServer } from '@/models/product-server.model';
import { PaymentDelivery } from '@/models/payment-delivery.model';

const models: any[] = [ShopSettings, Product, Settings, PaymentProvider, PaymentOption, Payment, Promotion, PromotionProduct, Group, GroupProduct, Server, ProductServer, PaymentDelivery];

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

// Idempotent DDL for the multi-server tables
async function migrateMultiServerTables(db: Sequelize): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS servers (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      ip VARCHAR(256) NOT NULL DEFAULT '',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMP WITH TIME ZONE NULL
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS product_servers (
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      server_id  VARCHAR(64) NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      PRIMARY KEY (product_id, server_id)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS payment_deliveries (
      id           UUID PRIMARY KEY,
      payment_id   UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      server_id    VARCHAR(64) NOT NULL REFERENCES servers(id),
      status       VARCHAR(16) NOT NULL DEFAULT 'pending',
      delivered_at TIMESTAMP WITH TIME ZONE NULL,
      meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS payment_deliveries_payment_server_unique
      ON payment_deliveries (payment_id, server_id);
  `);

  // Defensive: sync({ alter: true }) usually adds this column, but if that
  // step ever fails silently the settings API would 500 on every read. The
  // idempotent ADD closes the gap.
  await db.query(`
    ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS multi_server_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  `);
}

async function migrateCustomersToSnapshot(db: Sequelize): Promise<void> {
  const [row] = await db.query<{ regclass: string | null }>(
    `SELECT to_regclass('public.customers')::text AS regclass`,
    { type: QueryTypes.SELECT },
  );
  if (!row?.regclass) return;

  console.log('Migrating customers → payment snapshots…');

  await db.query(`
    ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS customer_nickname VARCHAR(64),
      ADD COLUMN IF NOT EXISTS customer_email VARCHAR(256);
  `);

  await db.query(`
    UPDATE payments p
       SET customer_nickname = c.nickname,
           customer_email    = c.email
      FROM customers c
     WHERE p.customer_id = c.id
       AND (p.customer_nickname IS NULL OR p.customer_nickname = '');
  `);

  await db.query(`
    UPDATE payments
       SET customer_nickname = COALESCE(customer_nickname, ''),
           customer_email    = COALESCE(customer_email, '')
     WHERE customer_nickname IS NULL OR customer_email IS NULL;
  `);

  await db.query(`ALTER TABLE payments DROP COLUMN IF EXISTS customer_id;`);
  await db.query(`DROP TABLE IF EXISTS customers;`);

  console.log('Migration finished: customers table dropped.');
}

export async function initDatabase(): Promise<void> {
  if (process.env.SKIP_DB === 'true') {
    console.log('SKIP_DB=true - skipping database initialization');
    return;
  }
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    await migrateCustomersToSnapshot(sequelize as unknown as Sequelize);
    await migrateMultiServerTables(sequelize as unknown as Sequelize);

    sequelize.sync({ alter: true }).then(() => {
      console.log('Database synced.');
    }).catch((err) => {
      console.error('Database sync failed:', err);
    });
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
}
