import fp from 'fastify-plugin';
import rateLimit, { type RateLimitPluginOptions } from '@fastify/rate-limit';
import { config } from '@/config';

export default fp<RateLimitPluginOptions>(async (fastify) => {
  fastify.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
    cache: config.rateLimit.cache,
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: (_req, ctx) => {
      const err = new Error('Rate limit exceeded. Please try again later.') as Error & {
        statusCode: number;
        code: string;
        error: string;
      };
      err.statusCode = ctx.statusCode;
      err.code = 'FST_ERR_RATE_LIMIT';
      err.error = ctx.ban ? 'Forbidden' : 'Too Many Requests';
      return err;
    },
  });
});
