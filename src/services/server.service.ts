import crypto from 'crypto';
import { Server } from '@/models/server.model';
import { Product } from '@/models/product.model';
import { ProductServer } from '@/models/product-server.model';
import { ConflictError, NotFoundError, ValidationError } from '@/core';
import type { ServerDto, CreateServerDto, UpdateServerDto } from '@/types';

const ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

function generateId(): string {
  return crypto.randomBytes(12).toString('base64url');
}

function toDto(s: Server): ServerDto {
  return {
    id: s.id,
    name: s.name,
    ip: s.ip,
    productIds: (s.products || []).map((p) => p.id),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export class ServerService {
  async findAll(): Promise<ServerDto[]> {
    const servers = await Server.findAll({
      include: [{ model: Product, attributes: ['id'], through: { attributes: [] as string[] } }],
      order: [['created_at', 'DESC']],
    });
    return servers.map(toDto);
  }

  async findById(id: string): Promise<ServerDto> {
    return toDto(await this.loadOne(id));
  }

  async create(data: CreateServerDto): Promise<ServerDto> {
    const name = (data.name || '').trim();
    if (!name) throw new ValidationError('Server name is required');

    let id = (data.id || '').trim();
    if (id) {
      if (!ID_PATTERN.test(id)) {
        throw new ValidationError('Server id must be 4-64 chars: letters, digits, "_", "-"');
      }
      const existing = await Server.findByPk(id, { paranoid: false });
      if (existing) throw new ConflictError(`Server with id "${id}" already exists`);
    } else {
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateId();
        const clash = await Server.findByPk(candidate, { paranoid: false });
        if (!clash) {
          id = candidate;
          break;
        }
      }
      if (!id) throw new Error('Could not generate unique server id');
    }

    const server = await Server.create({
      id,
      name,
      ip: (data.ip || '').trim().slice(0, 256),
    });
    return toDto(await this.loadOne(server.id));
  }

  async update(id: string, data: UpdateServerDto): Promise<ServerDto> {
    const server = await this.loadOne(id);
    const patch: Partial<Pick<Server, 'name' | 'ip'>> = {};
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new ValidationError('Server name cannot be empty');
      patch.name = name;
    }
    if (data.ip !== undefined) patch.ip = data.ip.trim().slice(0, 256);
    if (Object.keys(patch).length > 0) {
      await server.update(patch);
    }
    return toDto(await this.loadOne(id));
  }

  async delete(id: string): Promise<void> {
    const server = await Server.findByPk(id);
    if (!server) throw new NotFoundError(`Server with id "${id}" not found`);
    await server.destroy();
  }

  async findByAuthKey(apiKey: string): Promise<Server | null> {
    if (!apiKey) return null;
    return Server.findByPk(apiKey);
  }

  private async loadOne(id: string): Promise<Server> {
    const server = await Server.findByPk(id, {
      include: [{ model: Product, attributes: ['id'], through: { attributes: [] as string[] } }],
    });
    if (!server) throw new NotFoundError(`Server with id "${id}" not found`);
    return server;
  }
}

export async function assertServersExist(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const unique = Array.from(new Set(ids));
  const found = await Server.count({ where: { id: unique } });
  if (found !== unique.length) {
    throw new ValidationError('One or more serverIds do not exist');
  }
}

export { ProductServer };
