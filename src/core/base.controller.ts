import { FastifyRequest, FastifyReply } from 'fastify';

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export abstract class BaseController {
  protected ok(reply: FastifyReply, data: unknown = { success: true }) {
    return reply.code(200).send(data);
  }

  protected created(reply: FastifyReply, data: unknown) {
    return reply.code(201).send(data);
  }

  protected noContent(reply: FastifyReply) {
    return reply.code(204).send();
  }

  protected getPagination(request: FastifyRequest): { page: number; limit: number } {
    const query = request.query as PaginationQuery;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    return { page, limit };
  }
}
