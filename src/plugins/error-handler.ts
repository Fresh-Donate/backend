import fp from 'fastify-plugin';
import { FastifyError } from 'fastify';
import { AppError } from '../core/errors';
import { EntityNotFoundError } from '../core/base.service';

export default fp(async (fastify) => {
  fastify.setErrorHandler((error: FastifyError | AppError | EntityNotFoundError, request, reply) => {
    const isDev = process.env.NODE_ENV === 'development';

    if (error instanceof AppError || error instanceof EntityNotFoundError) {
      return reply.code(error.statusCode).send({
        error: error.name,
        message: error.message,
        ...('code' in error && { code: (error as AppError).code }),
      });
    }

    // Fastify validation errors
    if (error.validation) {
      return reply.code(400).send({
        error: 'ValidationError',
        message: 'Request validation failed',
        details: error.validation,
      });
    }

    // Unexpected errors
    request.log.error(error);
    return reply.code(error.statusCode || 500).send({
      error: 'InternalServerError',
      message: isDev ? error.message : 'An unexpected error occurred',
      ...(isDev && { stack: error.stack }),
    });
  });
});
