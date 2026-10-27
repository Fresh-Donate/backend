import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { config } from '@/config';
import { ValidationError } from '@/core';
import type { ProcessedImage } from '@/types';

const ACCEPTED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
const WEBP_QUALITY = 82;

const IMAGE_TARGETS = {
  product: { subdir: 'products', maxDimension: 1024 },
  shop: { subdir: 'shop/images', maxDimension: 2048 },
} as const;

export type ImageTarget = keyof typeof IMAGE_TARGETS;

export class ImageService {
  async processImage(buffer: Buffer, mimeType: string, target: ImageTarget): Promise<ProcessedImage> {
    const { subdir, maxDimension } = IMAGE_TARGETS[target];

    if (!buffer || buffer.length === 0) {
      throw new ValidationError('Empty file');
    }

    const normalizedMime = mimeType.toLowerCase();
    if (!ACCEPTED_MIME.has(normalizedMime)) {
      throw new ValidationError(
        `Unsupported image type "${mimeType}". Allowed: PNG, JPEG, WebP, GIF.`,
      );
    }

    // rotate() respects EXIF orientation (camera photos); fit: 'inside' +
    // withoutEnlargement shrinks oversized images without upscaling small ones.
    let pipeline = sharp(buffer, { failOn: 'error' })
      .rotate()
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      });

    // Sharp can't switch on `animated` mid-pipeline, so re-init for GIFs to
    // preserve animation. Static GIFs pass through the normal path fine.
    if (normalizedMime === 'image/gif') {
      pipeline = sharp(buffer, { failOn: 'error', animated: true })
        .resize({
          width: maxDimension,
          height: maxDimension,
          fit: 'inside',
          withoutEnlargement: true,
        });
    }

    const { data, info } = await pipeline
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    const filename = `${randomUUID()}.webp`;
    const relativePath = `${subdir}/${filename}`;

    const targetDir = resolve(process.cwd(), config.uploads.dir, subdir);
    await mkdir(targetDir, { recursive: true });
    await writeFile(join(targetDir, filename), data);

    return {
      relativePath,
      bytes: data.length,
      width: info.width,
      height: info.height,
    };
  }
}
