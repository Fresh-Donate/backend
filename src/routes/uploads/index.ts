import { type FastifyPluginAsync, type FastifyRequest } from 'fastify';
import { ImageService } from '@/services/image.service';
import { ValidationError } from '@/core';
import { config } from '@/config';

const imageService = new ImageService();

// Prefer BACKEND_PUBLIC_URL so URLs persisted in the DB stay stable across
// reverse-proxy hops; fall back to the request's scheme + host for local dev.
function buildPublicUrl(request: FastifyRequest, relativePath: string): string {
  const base =
    config.uploads.publicBaseUrl
    || `${request.protocol}://${request.headers.host ?? `${config.server.host}:${config.server.port}`}`;
  return `${base.replace(/\/+$/, '')}/uploads/${relativePath}`;
}

const uploadsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.post('/product-image', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const file = await request.file();
    if (!file) {
      throw new ValidationError('No file uploaded');
    }

    // fileSize is capped by the multipart plugin, so draining to a Buffer
    // here is bounded and won't blow up RAM.
    const buffer = await file.toBuffer();
    if (file.file.truncated) {
      throw new ValidationError(
        `File too large (max ${config.uploads.maxFileSize} bytes)`,
      );
    }

    const result = await imageService.processProductImage(buffer, file.mimetype);

    return reply.code(201).send({
      url: buildPublicUrl(request, result.relativePath),
      bytes: result.bytes,
      width: result.width,
      height: result.height,
    });
  });
};

export default uploadsRoutes;
