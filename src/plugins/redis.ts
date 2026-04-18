import fp from 'fastify-plugin';
import fastifyRedis, { type FastifyRedisPluginOptions } from '@fastify/redis';
import { config } from '@/config';

export default fp<FastifyRedisPluginOptions>(async (fastify) => {
  if (process.env.SKIP_REDIS === 'true') {
    fastify.log.info('SKIP_REDIS=true — skipping redis plugin registration');
    return;
  }
  fastify.register(fastifyRedis, {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    lazyConnect: true,
  });
});
