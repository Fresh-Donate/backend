import fp from 'fastify-plugin';
import rateLimit, { type RateLimitPluginOptions } from '@fastify/rate-limit';
import { config } from '@/config';

export default fp<RateLimitPluginOptions>(async (fastify) => {
  fastify.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
    cache: config.rateLimit.cache,
    keyGenerator: (req) => {
      const ip = req.ip || req.headers['x-real-ip'];
      console.log(ip);
      return typeof ip === 'string' ? ip : 'unknown-ip';
    },
    errorResponseBuilder: (req, ctx) => ({
      statusCode: ctx.statusCode,
      error: ctx.ban ? 'Forbidden' : 'Too Many Requests',
      code: 'FST_ERR_RATE_LIMIT',
      message: 'Rate limit exceeded. Please try again later.',
      key: req.ip,
      ips: req.ips,
      remoteAddress: req.socket.remoteAddress,
      forwardedFor: req.headers['x-forwarded-for'],
      realIp: req.headers['x-real-ip'],
      limit: ctx.max,
      timeWindow: ctx.after,
    }),
  });
});
