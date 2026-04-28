import { Customer } from '@/models/customer.model';
import { Payment } from '@/models/payment.model';
import { Op, fn, col, literal } from 'sequelize';
import { SettingsService } from './settings.service';
import { buildAmountInBaseSql } from '@/utils/currency';

export interface CustomerCurrencyStats {
  currency: string;
  totalSpent: number;
  purchaseCount: number;
}

export interface CustomerDto {
  id: string;
  nickname: string;
  email: string;
  stats: CustomerCurrencyStats[];
  createdAt: string;
  updatedAt: string;
}

// Учитываются только успешные платежи
const COUNTED_STATUSES = ['paid', 'delivered'];

function toDto(c: Customer, stats: CustomerCurrencyStats[]): CustomerDto {
  return {
    id: c.id,
    nickname: c.nickname,
    email: c.email,
    stats,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

async function aggregateStatsForCustomers(customerIds: string[]): Promise<Map<string, CustomerCurrencyStats[]>> {
  const map = new Map<string, CustomerCurrencyStats[]>();
  if (customerIds.length === 0) return map;

  const rows = await Payment.findAll({
    attributes: [
      'customerId',
      'currency',
      [fn('SUM', col('total_amount')), 'totalSpent'],
      [fn('COUNT', literal('*')), 'purchaseCount'],
    ],
    where: {
      customerId: { [Op.in]: customerIds },
      status: { [Op.in]: COUNTED_STATUSES },
    },
    group: ['customerId', 'currency'],
    raw: true,
  }) as unknown as Array<{
    customerId: string;
    currency: string;
    totalSpent: string | number;
    purchaseCount: string | number;
  }>;

  for (const row of rows) {
    const list = map.get(row.customerId) ?? [];
    list.push({
      currency: row.currency,
      totalSpent: Number(row.totalSpent),
      purchaseCount: Number(row.purchaseCount),
    });
    map.set(row.customerId, list);
  }
  return map;
}

export class CustomerService {
  private settingsService = new SettingsService();

  async findOrCreate(nickname: string, email: string): Promise<CustomerDto> {
    let customer = await Customer.findOne({
      where: { [Op.or]: [{ nickname }, { email }] },
    });

    if (customer) {
      if (customer.nickname !== nickname || customer.email !== email) {
        await customer.update({ nickname, email });
      }
    } else {
      customer = await Customer.create({ nickname, email });
    }

    const statsMap = await aggregateStatsForCustomers([customer.id]);
    return toDto(customer, statsMap.get(customer.id) ?? []);
  }

  async findAll(options?: {
    search?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'nickname' | 'email' | 'createdAt' | 'purchaseCount' | 'totalSpent';
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ items: CustomerDto[]; total: number }> {
    const where: any = {};
    if (options?.search) {
      where[Op.or] = [
        { nickname: { [Op.iLike]: `%${options.search}%` } },
        { email: { [Op.iLike]: `%${options.search}%` } },
      ];
    }

    const sortBy = options?.sortBy ?? 'createdAt';
    const sortDirection = options?.sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Whitelist-driven ORDER. Aggregate columns (`purchaseCount`, `totalSpent`)
    // are computed via correlated subqueries — only successful payments are
    // counted, matching aggregateStatsForCustomers. `totalSpent` normalises
    // each payment into RUB on the fly using the admin-configured rates,
    // making cross-currency sums comparable. Other columns map straight to
    // physical Customer columns. Always include a stable secondary
    // `created_at` so the page boundary doesn't reshuffle on equal keys.
    let order: any[];
    if (sortBy === 'purchaseCount') {
      order = [
        [
          literal(
            `(SELECT COUNT(*) FROM payments WHERE payments.customer_id = "Customer"."id" AND payments.status IN ('paid', 'delivered'))`,
          ),
          sortDirection,
        ],
        ['created_at', 'DESC'],
      ];
    } else if (sortBy === 'totalSpent') {
      const settings = await this.settingsService.get();
      const amountInBase = buildAmountInBaseSql(
        settings.currency_rates,
        settings.base_currency,
        'payments.total_amount',
        'payments.currency',
      );
      order = [
        [
          literal(
            `(SELECT COALESCE(SUM(${amountInBase}), 0) FROM payments WHERE payments.customer_id = "Customer"."id" AND payments.status IN ('paid', 'delivered'))`,
          ),
          sortDirection,
        ],
        ['created_at', 'DESC'],
      ];
    } else if (sortBy === 'createdAt') {
      order = [['created_at', sortDirection]];
    } else {
      // 'nickname' or 'email' — physical columns on customers.
      order = [[sortBy, sortDirection], ['created_at', 'DESC']];
    }

    const { rows, count } = await Customer.findAndCountAll({
      where,
      order,
      limit: options?.limit || 50,
      offset: options?.offset || 0,
    });

    const statsMap = await aggregateStatsForCustomers(rows.map((r) => r.id));
    return {
      items: rows.map((r) => toDto(r, statsMap.get(r.id) ?? [])),
      total: count,
    };
  }

  async findById(id: string): Promise<CustomerDto | null> {
    const customer = await Customer.findByPk(id);
    if (!customer) return null;
    const statsMap = await aggregateStatsForCustomers([id]);
    return toDto(customer, statsMap.get(id) ?? []);
  }

  async getCount(): Promise<number> {
    return Customer.count();
  }
}
