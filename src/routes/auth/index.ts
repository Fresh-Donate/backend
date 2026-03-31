import { FastifyPluginAsync } from 'fastify';
import { config } from '../../config';
import { UnauthorizedError } from '../../core';
import crypto from 'node:crypto';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const authRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.post<{
    Body: { login: string; password: string };
  }>('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['login', 'password'],
        properties: {
          login: { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request) => {
    const { login, password } = request.body;

    if (!safeEqual(login, config.admin.login) || !safeEqual(password, config.admin.password)) {
      throw new UnauthorizedError('Invalid login or password');
    }

    const token = fastify.jwt.sign({
      id: 'admin',
      login: config.admin.login,
      role: 'admin',
    });

    return {
      token,
      user: {
        id: 'admin',
        login: config.admin.login,
        role: 'admin',
      },
    };
  });

  fastify.get('/me', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    return { user: request.user };
  });
};

export default authRoutes;
