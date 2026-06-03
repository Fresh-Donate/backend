import fp from 'fastify-plugin';
import fastifyStatic from '@fastify/static';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '@/config';

// Files are content-addressed (UUID-based filenames produced by ImageService),
// so they're effectively immutable - that lets us send Cache-Control:
// immutable + 1y maxAge and let proxies / CDN / browsers cache aggressively.
export default fp(async (fastify) => {
  const uploadsRoot = resolve(process.cwd(), config.uploads.dir);

  // First startup on a fresh volume hits / before anything has written here.
  mkdirSync(uploadsRoot, { recursive: true });

  await fastify.register(fastifyStatic, {
    root: uploadsRoot,
    prefix: '/uploads/',
    list: false,
    index: false,
    // Cache-Control: immutable + UUID filename is a stronger guarantee than
    // Last-Modified, and Last-Modified can leak upload timestamps.
    lastModified: false,
    cacheControl: true,
    maxAge: '1y',
    immutable: true,
  });
});
