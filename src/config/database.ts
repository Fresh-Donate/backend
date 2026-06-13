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

  // Defensive: pre-normalize receipt_template before sync({ alter: true }) runs.
  await db.query(`
    ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS receipt_template JSONB;
  `);
  await db.query(`
    ALTER TABLE settings ALTER COLUMN receipt_template DROP DEFAULT;
  `);
  await db.query(`
    ALTER TABLE settings ALTER COLUMN receipt_template DROP NOT NULL;
  `);
}

// Idempotent DDL + backfill for the optional shopping-cart feature. A cart
// order is still one `payments` row (one external charge); the individual
// products live in `payment_items`. Legacy single-product payments are
// backfilled as an order of exactly one item, so every downstream reader
// (delivery, stats, receipts) can treat `payment.items` uniformly.
async function migrateCartTables(db: Sequelize): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS payment_items (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      payment_id          UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      product_id          UUID,
      product_name        VARCHAR(128) NOT NULL DEFAULT '',
      product_price       DECIMAL(12,2) NOT NULL DEFAULT 0,
      product_currency    VARCHAR(8) NOT NULL DEFAULT '',
      quantity            INTEGER NOT NULL DEFAULT 1,
      user_selected_count INTEGER NOT NULL DEFAULT 1,
      line_total          DECIMAL(12,2) NOT NULL DEFAULT 0,
      discount_percent    DECIMAL(5,2) NOT NULL DEFAULT 0,
      upgrade_discount    DECIMAL(12,2) NOT NULL DEFAULT 0,
      meta                JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS payment_items_payment_id_idx
      ON payment_items (payment_id);
  `);

  await db.query(`
    ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS items_count INTEGER NOT NULL DEFAULT 1;
  `);

  await db.query(`
    ALTER TABLE shop_settings
      ADD COLUMN IF NOT EXISTS cart_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  // Backfill: one item per legacy payment that has none yet. Idempotent via
  // the NOT EXISTS guard, so reruns on already-migrated rows are no-ops.
  // line_total mirrors the legacy `product_price`, which already stored the
  // order total (finalUnit * count); per-unit price is derived from count.
  await db.query(`
    INSERT INTO payment_items (
      payment_id, product_id, product_name, product_price, product_currency,
      quantity, user_selected_count, line_total, created_at, updated_at
    )
    SELECT
      p.id,
      p.product_id,
      p.product_name,
      ROUND(p.product_price / GREATEST(p.user_selected_count, 1), 2),
      COALESCE(NULLIF(p.product_currency, ''), p.currency),
      p.quantity,
      p.user_selected_count,
      p.product_price,
      p.created_at,
      p.updated_at
    FROM payments p
    WHERE NOT EXISTS (
      SELECT 1 FROM payment_items pi WHERE pi.payment_id = p.id
    );
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

    const existingTables = await sequelize.getQueryInterface().showAllTables();
    const isFirstRun = existingTables.length === 0;

    if (isFirstRun) {
      console.log('Detected first run. Syncing models without migration...');
      sequelize.sync({ alter: true }).then(() => {
        console.log('Database synced.');
      }).catch((err) => {
        console.error('Database sync failed:', err);
      });
    }

    await migrateCustomersToSnapshot(sequelize as unknown as Sequelize);
    await migrateMultiServerTables(sequelize as unknown as Sequelize);
    await migrateCartTables(sequelize as unknown as Sequelize);

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
