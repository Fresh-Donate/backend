import { Op, QueryTypes, fn, literal } from 'sequelize';
import { sequelize } from '@/config/database';
import { Payment } from '@/models/payment.model';
import { PaymentItem } from '@/models/payment-item.model';
import { Product } from '@/models/product.model';
import { Server } from '@/models/server.model';
import { PaymentDelivery, type PaymentDeliveryStatus } from '@/models/payment-delivery.model';
import { NotFoundError } from '@/core';
import { RconService } from './rcon.service';
import { SettingsService } from './settings.service';
import { buildCommandVariables, resolveCommandVariables } from '@/utils/command-variables';
import { appendDeliveryLog, archiveDeliveryLogs, mergedMeta } from '@/utils/payment-meta';
import type { RconResult } from '@/types';

const RETRY_DELAYS_MS = [1, 2, 5, 10, 30, 60].map((minutes) => minutes * 60 * 1000);
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const RCON_LEASE_MS = 5 * 60 * 1000;
const PLUGIN_LEASE_MS = 2 * 60 * 1000;
const PLUGIN_BATCH = 50;
const RCON_BATCH = 10;
const RCON_ROUNDS_PER_TICK = 10;
const HEAL_BATCH = 50;

export interface Order {
  payment: Payment;
  items: PaymentItem[];
  productById: Map<string, Product>;
}

export interface CommandLine {
  key: string;
  command: string;
}

interface Plan {
  lines: CommandLine[];
  requireOnline: boolean;
}

export interface PluginDelivery {
  paymentId: string;
  playerNickname: string;
  productName: string;
  commands: string[];
  requireOnline: boolean;
}

export interface CommandReport {
  command: string;
  success: boolean;
  response: string;
}

interface ClaimOptions {
  serverId: string | null;
  limit: number;
  leaseMs: number;
  paymentId?: string;
  online?: string[];
}

function nowPlus(ms: number): string {
  return `NOW() + INTERVAL '${Math.round(ms / 1000)} seconds'`;
}

async function loadOrders(paymentIds: string[]): Promise<Map<string, Order>> {
  const ids = [...new Set(paymentIds)];
  const orders = new Map<string, Order>();
  if (ids.length === 0) return orders;

  const payments = await Payment.findAll({ where: { id: ids } });
  const items = await PaymentItem.findAll({
    where: { paymentId: ids },
    order: [['created_at', 'ASC']],
  });
  const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))];
  const products = productIds.length > 0
    ? await Product.findAll({
      where: { id: productIds },
      include: [{ model: Server, through: { attributes: [] }, required: false }],
    })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  for (const payment of payments) {
    orders.set(payment.id, {
      payment,
      items: items.filter((i) => i.paymentId === payment.id),
      productById,
    });
  }
  return orders;
}

export function planFor(order: Order, serverId: string | null, done: Set<string>): Plan {
  const lines: CommandLine[] = [];
  let requireOnline = false;
  for (const item of order.items) {
    const product = order.productById.get(item.productId);
    if (!product) continue;
    if (serverId && !(product.servers || []).some((s) => s.id === serverId)) continue;
    const variables = buildCommandVariables(order.payment, product, item);
    (product.commands || []).forEach((raw, index) => {
      const key = `${item.id}:${index}`;
      if (done.has(key)) return;
      lines.push({ key, command: resolveCommandVariables(raw, variables) });
      if (!product.forceDelivery) requireOnline = true;
    });
  }
  return { lines, requireOnline };
}

export function matchReported(lines: CommandLine[], logs: CommandReport[]): string[] {
  const keysByCommand = new Map<string, string[]>();
  for (const line of lines) {
    keysByCommand.set(line.command, [...(keysByCommand.get(line.command) || []), line.key]);
  }
  const succeeded: string[] = [];
  for (const log of logs) {
    if (!log.success) continue;
    const key = keysByCommand.get(log.command)?.shift();
    if (key) succeeded.push(key);
  }
  return succeeded;
}

function targetServers(order: Order): string[] {
  const ids = new Set<string>();
  for (const item of order.items) {
    const product = order.productById.get(item.productId);
    if (!product || (product.commands || []).length === 0) continue;
    for (const server of product.servers || []) ids.add(server.id);
  }
  return [...ids];
}

function hasCommands(order: Order): boolean {
  return order.items.some((i) => (order.productById.get(i.productId)?.commands || []).length > 0);
}

function hasMissingProducts(order: Order): boolean {
  return order.items.some((i) => !order.productById.has(i.productId));
}

function doneKeys(job: PaymentDelivery): Set<string> {
  const done = job.meta?.doneCommands;
  return new Set(Array.isArray(done) ? done : []);
}

export class DeliveryService {
  private rconService = new RconService();
  private settingsService = new SettingsService();

  async enqueue(paymentId: string, opts: { force?: boolean } = {}): Promise<void> {
    const settings = await this.settingsService.get();
    const order = (await loadOrders([paymentId])).get(paymentId);
    if (!order) return;

    const multi = settings.delivery_method === 'plugin' && settings.multi_server_enabled;
    const targets: (string | null)[] = multi ? targetServers(order) : [null];
    const plans = targets
      .map((serverId) => ({ serverId, plan: planFor(order, serverId, new Set()) }))
      .filter((t) => t.plan.lines.length > 0);

    if (opts.force) {
      const wanted = new Set(plans.map((p) => p.serverId));
      const existing = await PaymentDelivery.findAll({ where: { paymentId } });
      const stale = existing.filter((job) => !wanted.has(job.serverId));
      if (stale.length > 0) {
        await PaymentDelivery.destroy({ where: { id: stale.map((job) => job.id) } });
      }
    }

    if (plans.length === 0) {
      if (hasMissingProducts(order)) {
        await this.failPayment(paymentId, 'product_deleted');
      } else if (multi && hasCommands(order)) {
        await this.failPayment(paymentId, 'no_servers_bound_at_payment_time');
      } else {
        await this.finishPayment(paymentId);
      }
      return;
    }

    for (const { serverId, plan } of plans) {
      const [job, created] = await PaymentDelivery.findOrCreate({
        where: { paymentId, serverId },
        defaults: {
          paymentId,
          serverId,
          status: 'pending',
          requireOnline: plan.requireOnline,
        },
      });
      if (!created && opts.force) {
        await PaymentDelivery.update({
          status: 'pending',
          attempts: 0,
          nextAttemptAt: fn('NOW'),
          requireOnline: plan.requireOnline,
          deliveredAt: null,
          meta: { ...job.meta, doneCommands: [] },
        }, { where: { id: job.id } });
      }
    }
  }

  async deliverNow(paymentId: string): Promise<void> {
    const settings = await this.settingsService.get();
    if (settings.delivery_method !== 'rcon') return;
    const jobs = await this.claim({ serverId: null, limit: 1, leaseMs: RCON_LEASE_MS, paymentId });
    for (const job of jobs) {
      await this.runRconJob(job);
    }
  }

  async processDue(): Promise<void> {
    await this.enqueuePaidWithoutJobs();

    const settings = await this.settingsService.get();
    if (settings.delivery_method !== 'rcon') return;

    for (let round = 0; round < RCON_ROUNDS_PER_TICK; round++) {
      const jobs = await this.claim({ serverId: null, limit: RCON_BATCH, leaseMs: RCON_LEASE_MS });
      if (jobs.length === 0) return;
      for (const job of jobs) {
        await this.runRconJob(job);
      }
    }
  }

  async force(paymentId: string): Promise<void> {
    const payment = await Payment.findByPk(paymentId);
    if (!payment) throw new NotFoundError('Payment not found');

    await archiveDeliveryLogs(paymentId);
    if (payment.paidAt && (payment.status === 'delivered' || payment.status === 'failed')) {
      await Payment.update({ status: 'paid' }, { where: { id: paymentId, status: payment.status } });
    }

    await this.enqueue(paymentId, { force: true });
    await this.deliverNow(paymentId);
  }

  async pendingForPlugin(serverId: string | null, online: string[] | null): Promise<PluginDelivery[]> {
    const jobs = await this.claim({
      serverId,
      limit: PLUGIN_BATCH,
      leaseMs: PLUGIN_LEASE_MS,
      ...(online ? { online } : {}),
    });
    if (jobs.length === 0) return [];

    const orders = await loadOrders(jobs.map((job) => job.paymentId));
    const result: PluginDelivery[] = [];
    for (const job of jobs) {
      const order = orders.get(job.paymentId);
      if (!order) continue;
      const done = doneKeys(job);
      const plan = planFor(order, serverId, done);
      if (plan.lines.length === 0) {
        await this.completeJob(job, [...done], job.attempts);
        continue;
      }
      result.push({
        paymentId: order.payment.id,
        playerNickname: order.payment.customerNickname || '',
        productName: order.payment.itemsCount > 1
          ? `Заказ из ${order.payment.itemsCount} товаров`
          : order.payment.productName,
        commands: plan.lines.map((line) => line.command),
        requireOnline: plan.requireOnline,
      });
    }
    return result;
  }

  async reportFromPlugin(
    paymentId: string,
    serverId: string | null,
    success: boolean,
    logs: CommandReport[],
  ): Promise<PaymentDeliveryStatus | null> {
    const job = await PaymentDelivery.findOne({ where: { paymentId, serverId } });
    if (!job) return null;
    if (job.status === 'delivered') return 'delivered';

    const order = (await loadOrders([paymentId])).get(paymentId);
    const done = doneKeys(job);
    const plan = order ? planFor(order, serverId, done) : { lines: [], requireOnline: false };
    const succeeded = matchReported(plan.lines, logs);
    return this.recordAttempt(job, done, succeeded, plan.lines.length, { results: logs }, success);
  }

  async cancelPending(paymentId: string): Promise<void> {
    await PaymentDelivery.update(
      { status: 'failed', nextAttemptAt: null },
      { where: { paymentId, status: 'pending' } },
    );
  }

  private async claim(opts: ClaimOptions): Promise<PaymentDelivery[]> {
    const conditions = [
      `d.status = 'pending'`,
      'd.next_attempt_at <= NOW()',
      'd.server_id IS NOT DISTINCT FROM :serverId',
    ];
    const replacements: Record<string, unknown> = {
      serverId: opts.serverId,
      limit: opts.limit,
    };
    if (opts.paymentId) {
      conditions.push('d.payment_id = :paymentId');
      replacements.paymentId = opts.paymentId;
    }
    if (opts.online) {
      if (opts.online.length > 0) {
        conditions.push('(d.require_online = FALSE OR lower(p.customer_nickname) IN (:online))');
        replacements.online = opts.online.map((name) => name.toLowerCase());
      } else {
        conditions.push('d.require_online = FALSE');
      }
    }

    const rows = await sequelize.query<{ id: string }>(
      `UPDATE payment_deliveries
          SET next_attempt_at = ${nowPlus(opts.leaseMs)}, updated_at = NOW()
        WHERE id IN (
          SELECT d.id
            FROM payment_deliveries d
            JOIN payments p ON p.id = d.payment_id
           WHERE ${conditions.join(' AND ')}
           ORDER BY d.next_attempt_at, d.created_at
           LIMIT :limit
           FOR UPDATE OF d SKIP LOCKED
        )
        RETURNING id`,
      { replacements, type: QueryTypes.SELECT },
    );
    if (rows.length === 0) return [];
    return PaymentDelivery.findAll({
      where: { id: rows.map((row) => row.id) },
      order: [['next_attempt_at', 'ASC'], ['created_at', 'ASC']],
    });
  }

  private async runRconJob(job: PaymentDelivery): Promise<void> {
    const order = (await loadOrders([job.paymentId])).get(job.paymentId);
    if (!order) {
      await PaymentDelivery.update({ status: 'failed', nextAttemptAt: null }, { where: { id: job.id } });
      return;
    }

    const done = doneKeys(job);
    const plan = planFor(order, null, done);
    if (plan.lines.length === 0) {
      await this.completeJob(job, [...done], job.attempts);
      return;
    }

    let results: RconResult[] = [];
    let error: string | undefined;
    try {
      results = await this.rconService.executeCommands(plan.lines.map((line) => line.command), {});
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const succeeded = plan.lines.filter((_, i) => results[i]?.success).map((line) => line.key);
    await this.recordAttempt(job, done, succeeded, plan.lines.length, { results, error });
  }

  private async recordAttempt(
    job: PaymentDelivery,
    done: Set<string>,
    succeeded: string[],
    planned: number,
    outcome: { results?: RconResult[]; error?: string },
    reportedSuccess = false,
  ): Promise<PaymentDeliveryStatus> {
    const doneCommands = [...done, ...succeeded];
    const attempt = job.attempts + 1;
    const complete = reportedSuccess || (!outcome.error && succeeded.length === planned);

    await appendDeliveryLog(job.paymentId, {
      attempt,
      timestamp: new Date().toISOString(),
      success: complete,
      ...(outcome.results && outcome.results.length > 0 ? { results: outcome.results } : {}),
      ...(outcome.error ? { error: outcome.error } : {}),
      ...(job.serverId ? { serverId: job.serverId } : {}),
    });

    if (complete) {
      await this.completeJob(job, doneCommands, attempt);
      return 'delivered';
    }

    const meta = { ...job.meta, doneCommands };
    if (attempt >= MAX_ATTEMPTS) {
      await PaymentDelivery.update(
        { status: 'failed', attempts: attempt, nextAttemptAt: null, meta },
        { where: { id: job.id } },
      );
      await this.rollUp(job.paymentId);
      return 'failed';
    }

    await PaymentDelivery.update(
      { attempts: attempt, nextAttemptAt: literal(nowPlus(RETRY_DELAYS_MS[attempt - 1] ?? 0)), meta },
      { where: { id: job.id } },
    );
    return 'pending';
  }

  private async completeJob(job: PaymentDelivery, doneCommands: string[], attempts: number): Promise<void> {
    await PaymentDelivery.update({
      status: 'delivered',
      attempts,
      deliveredAt: new Date(),
      nextAttemptAt: null,
      meta: { ...job.meta, doneCommands },
    }, { where: { id: job.id } });
    await this.rollUp(job.paymentId);
  }

  private async rollUp(paymentId: string): Promise<void> {
    const jobs = await PaymentDelivery.findAll({ where: { paymentId }, attributes: ['status'] });
    if (jobs.some((job) => job.status === 'failed')) {
      await this.failPayment(paymentId);
    } else if (jobs.every((job) => job.status === 'delivered')) {
      await this.finishPayment(paymentId);
    }
  }

  private async finishPayment(paymentId: string): Promise<void> {
    await Payment.update(
      { status: 'delivered', deliveredAt: new Date() },
      {
        where: {
          id: paymentId,
          [Op.or]: [{ status: 'paid' }, { status: 'failed', paidAt: { [Op.ne]: null } }],
        },
      },
    );
  }

  private async failPayment(paymentId: string, reason?: string): Promise<void> {
    await Payment.update(
      { status: 'failed', ...(reason ? { meta: mergedMeta({ deliveryFailure: reason }) } : {}) },
      { where: { id: paymentId, status: 'paid' } },
    );
  }

  private async enqueuePaidWithoutJobs(): Promise<void> {
    const payments = await Payment.findAll({
      attributes: ['id'],
      where: {
        status: 'paid',
        [Op.and]: [literal('NOT EXISTS (SELECT 1 FROM payment_deliveries d WHERE d.payment_id = "Payment"."id")')],
      },
      order: [['paid_at', 'ASC']],
      limit: HEAL_BATCH,
    });
    for (const payment of payments) {
      await this.enqueue(payment.id);
    }
  }
}
