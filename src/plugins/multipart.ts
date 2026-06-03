import fp from 'fastify-plugin';
import multipart from '@fastify/multipart';
import { config } from '@/config';

// Per-file ceiling is enforced here - sharp re-encodes server-side, so this
// just keeps a malicious client from streaming gigabytes at us.
export default fp(async (fastify) => {
  await fastify.register(multipart, {
    limits: {
      fileSize: config.uploads.maxFileSize,
      files: 1,
      fieldNameSize: 256,
      fieldSize: 1024,
    },
  });
});
