import { Customer } from '../models/customer.model';
import { Op } from 'sequelize';

export interface CustomerDto {
  id: string;
  nickname: string;
  email: string;
  totalSpent: number;
  purchaseCount: number;
  createdAt: string;
  updatedAt: string;
}

function toDto(c: Customer): CustomerDto {
  return {
    id: c.id,
    nickname: c.nickname,
    email: c.email,
    totalSpent: Number(c.totalSpent),
    purchaseCount: c.purchaseCount,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export class CustomerService {
  /**
   * Find or create a customer by nickname + email.
   * If a customer with the same nickname exists, update email.
   * If a customer with the same email exists, update nickname.
   */
  async findOrCreate(nickname: string, email: string): Promise<CustomerDto> {
    let customer = await Customer.findOne({
      where: {
        [Op.or]: [{ nickname }, { email }],
      },
    });

    if (customer) {
      // Update if changed
      if (customer.nickname !== nickname || customer.email !== email) {
        await customer.update({ nickname, email });
      }
    } else {
      customer = await Customer.create({ nickname, email });
    }

    return toDto(customer);
  }

  async findAll(options?: { search?: string; limit?: number; offset?: number }): Promise<{ items: CustomerDto[]; total: number }> {
    const where: any = {};
    if (options?.search) {
      where[Op.or] = [
        { nickname: { [Op.iLike]: `%${options.search}%` } },
        { email: { [Op.iLike]: `%${options.search}%` } },
      ];
    }

    const { rows, count } = await Customer.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: options?.limit || 50,
      offset: options?.offset || 0,
    });

    return { items: rows.map(toDto), total: count };
  }

  async findById(id: string): Promise<CustomerDto | null> {
    const customer = await Customer.findByPk(id);
    return customer ? toDto(customer) : null;
  }

  async incrementStats(customerId: string, amount: number): Promise<void> {
    await Customer.increment(
      { totalSpent: amount, purchaseCount: 1 },
      { where: { id: customerId } },
    );
  }

  async getCount(): Promise<number> {
    return Customer.count();
  }
}
