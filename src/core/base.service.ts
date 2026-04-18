import { type Model } from 'sequelize-typescript';
import { type FindOptions } from 'sequelize';
import { type BaseRepository } from './base.repository';

export abstract class BaseService<T extends Model> {
  constructor(protected readonly repository: BaseRepository<T>) {}

  async findAll(options?: FindOptions<T>): Promise<T[]> {
    return this.repository.findAll(options);
  }

  async findById(id: string, options?: FindOptions<T>): Promise<T | null> {
    return this.repository.findById(id, options);
  }

  async findByIdOrFail(id: string, options?: FindOptions<T>): Promise<T> {
    const entity = await this.repository.findById(id, options);
    if (!entity) {
      throw new EntityNotFoundError(this.entityName, id);
    }
    return entity;
  }

  async create(data: Partial<T['_creationAttributes']>): Promise<T> {
    return this.repository.create(data);
  }

  async update(id: string, data: Partial<T['_creationAttributes']>): Promise<T> {
    await this.findByIdOrFail(id);
    await this.repository.update(id, data);
    return this.findByIdOrFail(id);
  }

  async delete(id: string): Promise<void> {
    await this.findByIdOrFail(id);
    await this.repository.delete(id);
  }

  async paginate(page: number = 1, limit: number = 20, options?: FindOptions<T>) {
    const offset = (page - 1) * limit;
    const { rows, count } = await this.repository.findAndCountAll({
      ...options,
      limit,
      offset,
    });

    return {
      data: rows,
      meta: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  protected abstract get entityName(): string;
}

export class EntityNotFoundError extends Error {
  public readonly statusCode = 404;

  constructor(entity: string, id: string) {
    super(`${entity} with id "${id}" not found`);
    this.name = 'EntityNotFoundError';
  }
}
