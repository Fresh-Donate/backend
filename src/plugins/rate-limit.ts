import fp from 'fastify-plugin';
import rateLimit, { RateLimitPluginOptions } from '@fastify/rate-limit';
import { config } from '../config';

export default fp<RateLimitPluginOptions>(async (fastify) => {
  fastify.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
    errorResponseBuilder: () => ({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      statusCode: 429,
    }),
  });
});
