import { type Model } from 'sequelize-typescript';
import {
  type ModelStatic,
  type FindOptions,
  type CreateOptions,
  type UpdateOptions,
  type DestroyOptions,
  type WhereOptions,
} from 'sequelize';

export abstract class BaseRepository<T extends Model> {
  constructor(protected readonly model: ModelStatic<T>) {}

  async findAll(options?: FindOptions<T>): Promise<T[]> {
    return this.model.findAll(options);
  }

  async findById(id: string, options?: FindOptions<T>): Promise<T | null> {
    return this.model.findByPk(id, options);
  }

  async findOne(options: FindOptions<T>): Promise<T | null> {
    return this.model.findOne(options);
  }

  async create(data: Partial<T['_creationAttributes']>, options?: CreateOptions<T>): Promise<T> {
    return this.model.create(data as any, options);
  }

  async update(
    id: string,
    data: Partial<T['_creationAttributes']>,
    options?: Omit<UpdateOptions<T>, 'where'>,
  ): Promise<[number]> {
    return this.model.update(data as any, {
      ...options,
      where: { id } as WhereOptions<T>,
    });
  }

  async delete(id: string, options?: Omit<DestroyOptions<T>, 'where'>): Promise<number> {
    return this.model.destroy({
      ...options,
      where: { id } as WhereOptions<T>,
    });
  }

  async count(options?: FindOptions<T>): Promise<number> {
    return this.model.count(options);
  }

  async findAndCountAll(options?: FindOptions<T>): Promise<{ rows: T[]; count: number }> {
    return this.model.findAndCountAll(options);
  }
}
