import fp from 'fastify-plugin';
import fastifyRedis, { FastifyRedisPluginOptions } from '@fastify/redis';
import { config } from '@/config';

export default fp<FastifyRedisPluginOptions>(async (fastify) => {
  console.log({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
  })
  fastify.register(fastifyRedis, {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
  });
});
