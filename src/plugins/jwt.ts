import fp from 'fastify-plugin';
import fjwt, { type FastifyJWTOptions } from '@fastify/jwt';
import { type FastifyBaseLogger, type FastifyRequest, type FastifyReply } from 'fastify';
import { randomBytes } from 'node:crypto';
import { config } from '@/config';
import { SettingsService } from '@/services/settings.service';

const EXAMPLE_SECRET = 'change-me-to-a-random-secret-in-production';

async function resolveSecret(log: FastifyBaseLogger): Promise<string> {
  const fromEnv = config.jwt.secret;
  if (fromEnv && fromEnv !== EXAMPLE_SECRET) return fromEnv;
  if (fromEnv) {
    log.warn('JWT_SECRET still has the example value from .env.example, ignoring it and using the secret stored in the database');
  }
  if (process.env.SKIP_DB === 'true') return randomBytes(48).toString('hex');
  return new SettingsService().getJwtSecret();
}

export default fp<FastifyJWTOptions>(async (fastify) => {
  await fastify.register(fjwt, {
    secret: await resolveSecret(fastify.log),
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
