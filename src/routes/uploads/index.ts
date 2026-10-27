import { type FastifyPluginAsync, type FastifyRequest } from 'fastify';
import { ImageService, type ImageTarget } from '@/services/image.service';
import { FileService } from '@/services/file.service';
import { ValidationError } from '@/core';
import { config } from '@/config';

const imageService = new ImageService();
const fileService = new FileService();

// Prefer BACKEND_PUBLIC_URL so URLs persisted in the DB stay stable across
// reverse-proxy hops; fall back to the request's scheme + host for local dev.
function buildPublicUrl(request: FastifyRequest, relativePath: string): string {
  const base =
    config.uploads.publicBaseUrl
    || `${request.protocol}://${request.headers.host ?? `${config.server.host}:${config.server.port}`}`;
  const encoded = relativePath.split('/').map(encodeURIComponent).join('/');
  return `${base.replace(/\/+$/, '')}/uploads/${encoded}`;
}

const uploadsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  async function uploadImage(request: FastifyRequest, target: ImageTarget) {
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

    const result = await imageService.processImage(buffer, file.mimetype, target);

    return {
      url: buildPublicUrl(request, result.relativePath),
      bytes: result.bytes,
      width: result.width,
      height: result.height,
    };
  }

  fastify.post('/product-image', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    return reply.code(201).send(await uploadImage(request, 'product'));
  });

  fastify.post('/shop-image', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    return reply.code(201).send(await uploadImage(request, 'shop'));
  });

  fastify.post('/shop-file', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const file = await request.file({ throwFileSizeLimit: false });
    if (!file) {
      throw new ValidationError('No file uploaded');
    }

    const result = await fileService.saveShopFile(file.file, file.filename, file.mimetype);

    return reply.code(201).send({
      url: buildPublicUrl(request, result.relativePath),
      name: result.name,
      bytes: result.bytes,
      mimeType: result.mimeType,
    });
  });
};

export default uploadsRoutes;
