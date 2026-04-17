import fp from 'fastify-plugin';
import fjwt, { type FastifyJWTOptions } from '@fastify/jwt';
import { type FastifyRequest, type FastifyReply } from 'fastify';
import { config } from '@/config';

export default fp<FastifyJWTOptions>(async (fastify) => {
  await fastify.register(fjwt, {
    secret: config.jwt.secret,
    sign: {
      expiresIn: config.jwt.expiresIn,
    },
  });

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      id: string;
      login: string;
      role: string;
    };
    user: {
      id: string;
      login: string;
      role: string;
    };
  }
}
