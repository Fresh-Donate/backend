import { Payment } from '@/models/payment.model';
import { Op, fn, col, literal } from 'sequelize';
import { SettingsService } from './settings.service';
import { buildAmountInBaseSql } from '@/utils/currency';
import type { CustomerDto, CustomerCurrencyStats } from '@/types';

const COUNTED_STATUSES = ['paid', 'delivered'];

export interface CustomerDateRange {
  from?: Date;
  to?: Date;
}

function paidAtFilter(range?: CustomerDateRange): Record<symbol, Date> | undefined {
  if (!range?.from && !range?.to) return undefined;
  const filter: any = {};
  if (range.from) filter[Op.gte] = range.from;
  if (range.to) filter[Op.lte] = range.to;
  return filter;
}

function baseWhere(range?: CustomerDateRange): any {
  const where: any = { status: { [Op.in]: COUNTED_STATUSES } };
  const paidAt = paidAtFilter(range);
  if (paidAt) where.paidAt = paidAt;
  return where;
}

async function statsByNickname(
  nicknames: string[],
  range?: CustomerDateRange,
): Promise<Map<string, CustomerCurrencyStats[]>> {
  const map = new Map<string, CustomerCurrencyStats[]>();
  if (nicknames.length === 0) return map;

  const rows = await Payment.findAll({
    attributes: [
      'customerNickname',
      'currency',
      [fn('SUM', col('total_amount')), 'totalSpent'],
      [fn('COUNT', literal('*')), 'purchaseCount'],
    ],
    where: {
      ...baseWhere(range),
      customerNickname: { [Op.in]: nicknames },
    },
    group: ['customer_nickname', 'currency'],
    raw: true,
  }) as unknown as Array<{
    customerNickname: string;
    currency: string;
    totalSpent: string | number;
    purchaseCount: string | number;
  }>;

  for (const row of rows) {
    const list = map.get(row.customerNickname) ?? [];
    list.push({
      currency: row.currency,
      totalSpent: Number(row.totalSpent),
      purchaseCount: Number(row.purchaseCount),
    });
    map.set(row.customerNickname, list);
  }
  return map;
}

async function emailByNickname(
  nicknames: string[],
  range?: CustomerDateRange,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (nicknames.length === 0) return map;

  const rows = await Payment.findAll({
    where: {
      ...baseWhere(range),
      customerNickname: { [Op.in]: nicknames },
    },
    attributes: ['customerNickname', 'customerEmail'],
    order: [['created_at', 'DESC']],
  });

  for (const r of rows) {
    if (!map.has(r.customerNickname)) {
      map.set(r.customerNickname, r.customerEmail);
    }
  }
  return map;
}

interface AggregateRow {
  nickname: string;
  createdAt: string;
  updatedAt: string;
}

export class CustomerService {
  private settingsService = new SettingsService();

  async findAll(options?: {
    search?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'nickname' | 'email' | 'createdAt' | 'purchaseCount' | 'totalSpent';
    sortOrder?: 'asc' | 'desc';
    from?: Date;
    to?: Date;
  }): Promise<{ items: CustomerDto[]; total: number }> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    const sortBy = options?.sortBy ?? 'createdAt';
    const direction = options?.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const range: CustomerDateRange = { from: options?.from, to: options?.to };

    const where: any = baseWhere(range);
    if (options?.search) {
      where[Op.or] = [
        { customerNickname: { [Op.iLike]: `%${options.search}%` } },
        { customerEmail: { [Op.iLike]: `%${options.search}%` } },
      ];
    }

    let order: any[];
    if (sortBy === 'nickname') {
      order = [[col('customer_nickname'), direction]];
    } else if (sortBy === 'email') {
      order = [[fn('MAX', col('customer_email')), direction]];
    } else if (sortBy === 'purchaseCount') {
      order = [[fn('COUNT', literal('*')), direction]];
    } else if (sortBy === 'totalSpent') {
      const settings = await this.settingsService.get();
      const amountInBase = buildAmountInBaseSql(
        settings.currency_rates,
        settings.base_currency,
        'total_amount',
        'currency',
      );
      order = [[fn('SUM', literal(amountInBase)), direction]];
    } else {
      order = [[fn('MIN', col('created_at')), direction]];
    }

    const [rows, totalRows] = await Promise.all([
      Payment.findAll({
        where,
        attributes: [
          [col('customer_nickname'), 'nickname'],
          [fn('MIN', col('created_at')), 'createdAt'],
          [fn('MAX', fn('COALESCE', col('paid_at'), col('created_at'))), 'updatedAt'],
        ],
        group: ['customer_nickname'],
        order,
        limit,
        offset,
        raw: true,
      }) as unknown as Promise<AggregateRow[]>,
      Payment.findAll({
        where,
        attributes: [[fn('COUNT', fn('DISTINCT', col('customer_nickname'))), 'count']],
        raw: true,
      }) as unknown as Promise<Array<{ count: string }>>,
    ]);

    const total = Number(totalRows[0]?.count ?? 0);
    const nicknames = rows.map((r) => r.nickname);
    const [statsMap, emailMap] = await Promise.all([
      statsByNickname(nicknames, range),
      emailByNickname(nicknames, range),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.nickname,
        nickname: r.nickname,
        email: emailMap.get(r.nickname) ?? '',
        stats: statsMap.get(r.nickname) ?? [],
        createdAt: new Date(r.createdAt).toISOString(),
        updatedAt: new Date(r.updatedAt).toISOString(),
      })),
      total,
    };
  }

  async findById(nickname: string, range?: CustomerDateRange): Promise<CustomerDto | null> {
    const rows = await Payment.findAll({
      where: {
        ...baseWhere(range),
        customerNickname: nickname,
      },
      attributes: [
        [col('customer_nickname'), 'nickname'],
        [fn('MIN', col('created_at')), 'createdAt'],
        [fn('MAX', fn('COALESCE', col('paid_at'), col('created_at'))), 'updatedAt'],
      ],
      group: ['customer_nickname'],
      raw: true,
    }) as unknown as AggregateRow[];

    const row = rows[0];
    if (!row) return null;

    const [statsMap, emailMap] = await Promise.all([
      statsByNickname([nickname], range),
      emailByNickname([nickname], range),
    ]);

    return {
      id: row.nickname,
      nickname: row.nickname,
      email: emailMap.get(nickname) ?? '',
      stats: statsMap.get(nickname) ?? [],
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
  }

  async getCount(range?: CustomerDateRange): Promise<number> {
    const rows = await Payment.findAll({
      where: baseWhere(range),
      attributes: [[fn('COUNT', fn('DISTINCT', col('customer_nickname'))), 'count']],
      raw: true,
    }) as unknown as Array<{ count: string }>;
    return Number(rows[0]?.count ?? 0);
  }
}
