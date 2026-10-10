import { type Sequelize, QueryTypes } from 'sequelize';

interface Migration {
  name: string;
  up: (db: Sequelize) => Promise<void>;
}

async function snapshotCustomers(db: Sequelize): Promise<void> {
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

// Idempotent DDL for the multi-server tables
async function multiServerTables(db: Sequelize): Promise<void> {
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

  await db.query(`
    ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS multi_server_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  `);

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

  await db.query(`
    ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS jwt_secret VARCHAR(128);
  `);
}

// Idempotent DDL + backfill for the optional shopping-cart feature. A cart
// order is still one `payments` row (one external charge); the individual
// products live in `payment_items`. Legacy single-product payments are
// backfilled as an order of exactly one item, so every downstream reader
// (delivery, stats, receipts) can treat `payment.items` uniformly.
async function cartTables(db: Sequelize): Promise<void> {
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

const migrations: Migration[] = [
  { name: '001-customers-snapshot', up: snapshotCustomers },
  { name: '002-multi-server', up: multiServerTables },
  { name: '003-cart', up: cartTables },
];

export async function runMigrations(db: Sequelize): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       VARCHAR(128) PRIMARY KEY,
      applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  const rows = await db.query<{ name: string }>(
    'SELECT name FROM schema_migrations',
    { type: QueryTypes.SELECT },
  );
  const applied = new Set(rows.map((r) => r.name));

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    await migration.up(db);
    await db.query('INSERT INTO schema_migrations (name) VALUES (:name)', {
      replacements: { name: migration.name },
    });
    console.log(`Migration applied: ${migration.name}`);
  }
}
