import fp from 'fastify-plugin';
import fastifyStatic from '@fastify/static';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '@/config';

/**
 * Serves files from the uploads directory at `/uploads/*`.
 *
 * Files are content-addressed by UUID + a content-derived suffix in the
 * upload service, so they're effectively immutable — that lets us send a
 * year-long `Cache-Control: immutable` and let any reverse proxy / CDN /
 * browser cache them aggressively.
 */
export default fp(async (fastify) => {
  const uploadsRoot = resolve(process.cwd(), config.uploads.dir);

  // Ensure the dir exists at boot — first startup on a fresh volume hits
  // this path before anything has written to it.
  mkdirSync(uploadsRoot, { recursive: true });

  await fastify.register(fastifyStatic, {
    root: uploadsRoot,
    prefix: '/uploads/',
    // Disable directory listing — we only want explicit file fetches.
    list: false,
    // Don't try to render index.html for path requests.
    index: false,
    // Disable Last-Modified — Cache-Control: immutable + the UUID filename
    // is a stronger guarantee, and Last-Modified can leak info about
    // upload times.
    lastModified: false,
    // Strong cache for content-addressed files. The filename itself
    // changes when content changes, so revalidation is unnecessary.
    cacheControl: true,
    maxAge: '1y',
    immutable: true,
  });
});
