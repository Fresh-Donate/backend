import { Product } from '@/models/product.model';
import { NotFoundError } from '@/core';

export interface ProductDto {
  id: string;
  name: string;
  price: number;
  currency: string;
  quantity: number;
  description: string;
  type: string;
  commands: string[];
  imageUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProductDto {
  name: string;
  price: number;
  currency: string;
  quantity: number;
  description?: string;
  type: string;
  commands?: string[];
  imageUrl?: string;
}

export interface UpdateProductDto {
  name?: string;
  price?: number;
  currency?: string;
  quantity?: number;
  description?: string;
  type?: string;
  commands?: string[];
  imageUrl?: string;
}

function toDto(p: Product): ProductDto {
  return {
    id: p.id,
    name: p.name,
    price: Number(p.price),
    currency: p.currency,
    quantity: p.quantity,
    description: p.description,
    type: p.type,
    commands: p.commands,
    imageUrl: p.imageUrl,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export class ProductService {
  async findAll(): Promise<ProductDto[]> {
    const products = await Product.findAll({ order: [['created_at', 'DESC']] });
    return products.map(toDto);
  }

  async findById(id: string): Promise<ProductDto> {
    const product = await Product.findByPk(id);
    if (!product) throw new NotFoundError(`Product with id "${id}" not found`);
    return toDto(product);
  }

  async create(data: CreateProductDto): Promise<ProductDto> {
    const product = await Product.create({
      name: data.name,
      price: data.price,
      currency: data.currency,
      quantity: data.quantity,
      description: data.description || '',
      type: data.type,
      commands: data.commands || [],
      imageUrl: data.imageUrl || '',
    });
    return toDto(product);
  }

  async update(id: string, data: UpdateProductDto): Promise<ProductDto> {
    const product = await Product.findByPk(id);
    if (!product) throw new NotFoundError(`Product with id "${id}" not found`);
    await product.update(data);
    return toDto(product);
  }

  async delete(id: string): Promise<void> {
    const product = await Product.findByPk(id);
    if (!product) throw new NotFoundError(`Product with id "${id}" not found`);
    await product.destroy();
  }

  async duplicate(id: string): Promise<ProductDto> {
    const source = await Product.findByPk(id);
    if (!source) throw new NotFoundError(`Product with id "${id}" not found`);

    const product = await Product.create({
      name: `${source.name} (копия)`,
      price: source.price,
      currency: source.currency,
      quantity: source.quantity,
      description: source.description,
      type: source.type,
      commands: [...source.commands],
      imageUrl: source.imageUrl,
    });

    return toDto(product);
  }
}
