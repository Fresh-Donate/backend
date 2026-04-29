import { type FastifyPluginAsync, type FastifyRequest } from 'fastify';
import { ImageService } from '@/services/image.service';
import { ValidationError } from '@/core';
import { config } from '@/config';

const imageService = new ImageService();

/**
 * Build the public URL for a stored upload. Prefers an explicit
 * `BACKEND_PUBLIC_URL` (from config) so URLs persisted in the DB stay
 * stable across reverse-proxy hops; falls back to the incoming request's
 * scheme + host when no override is configured (typical local dev).
 */
function buildPublicUrl(request: FastifyRequest, relativePath: string): string {
  const base =
    config.uploads.publicBaseUrl
    || `${request.protocol}://${request.headers.host ?? `${config.server.host}:${config.server.port}`}`;
  return `${base.replace(/\/+$/, '')}/uploads/${relativePath}`;
}

const uploadsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  /**
   * POST /uploads/product-image — admin-only.
   * Accepts a single multipart file under any field name, recompresses to
   * WebP via {@link ImageService}, and returns the public URL the panel
   * should store on the product.
   */
  fastify.post('/product-image', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const file = await request.file();
    if (!file) {
      throw new ValidationError('No file uploaded');
    }

    // Drain the stream into memory. We've already capped fileSize via the
    // multipart plugin, so this won't blow up RAM.
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
