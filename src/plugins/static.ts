import fp from 'fastify-plugin';
import fastifyStatic from '@fastify/static';
import { mkdirSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { config } from '@/config';
import { SHOP_FILES_SUBDIR } from '@/services/file.service';

const INLINE_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp3', '.mp4', '.webm', '.txt']);

// Files are content-addressed (UUID-based filenames produced by ImageService),
// so they're effectively immutable - that lets us send Cache-Control:
// immutable + 1y maxAge and let proxies / CDN / browsers cache aggressively.
export default fp(async (fastify) => {
  const uploadsRoot = resolve(process.cwd(), config.uploads.dir);

  // First startup on a fresh volume hits / before anything has written here.
  mkdirSync(uploadsRoot, { recursive: true });
  const shopFilesRoot = resolve(uploadsRoot, SHOP_FILES_SUBDIR) + sep;

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
    setHeaders: (res, filePath) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (!resolve(filePath).startsWith(shopFilesRoot)) return;
      res.setHeader('Content-Security-Policy', 'sandbox');
      if (!INLINE_EXTENSIONS.has(extname(filePath).toLowerCase())) {
        res.setHeader('Content-Disposition', 'attachment');
      }
    },
  });
});
