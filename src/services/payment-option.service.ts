import { PaymentOption } from '@/models/payment-option.model';
import { NotFoundError } from '@/core';

export interface PaymentOptionDto {
  id: string;
  name: string;
  icon: string;
  providerId: string;
  sortOrder: number;
  enabled: boolean;
}

export interface CreatePaymentOptionDto {
  name: string;
  icon: string;
  providerId: string;
  sortOrder?: number;
  enabled?: boolean;
}

export interface UpdatePaymentOptionDto {
  name?: string;
  icon?: string;
  providerId?: string;
  sortOrder?: number;
  enabled?: boolean;
}

function toDto(o: PaymentOption): PaymentOptionDto {
  return {
    id: o.id,
    name: o.name,
    icon: o.icon,
    providerId: o.providerId,
    sortOrder: o.sortOrder,
    enabled: o.enabled,
  };
}

export class PaymentOptionService {
  async findAll(): Promise<PaymentOptionDto[]> {
    const options = await PaymentOption.findAll({ order: [['sort_order', 'ASC'], ['created_at', 'ASC']] });
    return options.map(toDto);
  }

  async findEnabled(): Promise<PaymentOptionDto[]> {
    const options = await PaymentOption.findAll({
      where: { enabled: true },
      order: [['sort_order', 'ASC'], ['created_at', 'ASC']],
    });
    return options.map(toDto);
  }

  async findById(id: string): Promise<PaymentOptionDto> {
    const option = await PaymentOption.findByPk(id);
    if (!option) throw new NotFoundError('Payment option not found');
    return toDto(option);
  }

  async create(data: CreatePaymentOptionDto): Promise<PaymentOptionDto> {
    if (data.sortOrder === undefined) {
      const maxOrder = await PaymentOption.max<number, PaymentOption>('sortOrder');
      data.sortOrder = (maxOrder || 0) + 1;
    }
    const option = await PaymentOption.create(data);
    return toDto(option);
  }

  async update(id: string, data: UpdatePaymentOptionDto): Promise<PaymentOptionDto> {
    const option = await PaymentOption.findByPk(id);
    if (!option) throw new NotFoundError('Payment option not found');
    await option.update(data);
    return toDto(option);
  }

  async delete(id: string): Promise<void> {
    const option = await PaymentOption.findByPk(id);
    if (!option) throw new NotFoundError('Payment option not found');
    await option.destroy();
  }
}
