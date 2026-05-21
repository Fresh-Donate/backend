import { Sequelize, QueryTypes } from 'sequelize';
import { Sequelize as SequelizeTS } from 'sequelize-typescript';
import { config } from './index';

const { host, port, name, user, password } = config.database;

// Import all entity models here (NOT base.model — it's abstract)
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

const models: any[] = [ShopSettings, Product, Settings, PaymentProvider, PaymentOption, Payment, Promotion, PromotionProduct, Group, GroupProduct];

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

// One-shot migration: when the legacy `customers` table is still present,
// copy nickname/email into the new snapshot columns on `payments`, drop the
// FK, and remove the table. Idempotent — does nothing once `customers` is
// gone. Runs before sync() so sync doesn't trip on the legacy FK column.
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

  // Orphaned payments (customer row already gone) — fill with placeholder so
  // NOT NULL constraint can be applied. Real value can't be recovered.
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
    console.log('SKIP_DB=true — skipping database initialization');
    return;
  }
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    await migrateCustomersToSnapshot(sequelize as unknown as Sequelize);

    // sync в фоне — не блокирует старт сервера
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
