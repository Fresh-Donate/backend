import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { config } from '@/config';
import { ValidationError } from '@/core';

/**
 * MIME types we accept on upload. Anything else is rejected before sharp
 * even sees the bytes — the Buffer is then re-encoded as WebP regardless,
 * so this is purely a defensive filter against weird inputs.
 */
const ACCEPTED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);

/** Max output edge in pixels — product card thumbnails never need more. */
const MAX_DIMENSION = 1024;

/** WebP quality — high enough to look clean, low enough to ship small. */
const WEBP_QUALITY = 82;

export interface ProcessedImage {
  /** Filename written under {@link config.uploads.dir}, e.g. `products/abc.webp`. */
  relativePath: string;
  /** Number of bytes actually written to disk. */
  bytes: number;
  /** Final dimensions after resize. */
  width: number;
  height: number;
}

export class ImageService {
  /**
   * Take raw bytes from a multipart upload, validate the MIME, downscale
   * to fit within {@link MAX_DIMENSION}, recompress to WebP, and write to
   * `<uploads>/products/<uuid>.webp`.
   *
   * Throws {@link ValidationError} on disallowed MIME or empty buffer.
   */
  async processProductImage(buffer: Buffer, mimeType: string): Promise<ProcessedImage> {
    if (!buffer || buffer.length === 0) {
      throw new ValidationError('Empty file');
    }

    const normalizedMime = mimeType.toLowerCase();
    if (!ACCEPTED_MIME.has(normalizedMime)) {
      throw new ValidationError(
        `Unsupported image type "${mimeType}". Allowed: PNG, JPEG, WebP, GIF.`,
      );
    }

    // Re-encode in one pipeline:
    //  - rotate() respects EXIF orientation (camera photos)
    //  - resize() with `fit: inside` + `withoutEnlargement` shrinks big
    //    images and leaves small ones untouched
    //  - webp() is a strong lossy default; effort=4 trades a bit of CPU for
    //    a noticeably smaller file than the default
    let pipeline = sharp(buffer, { failOn: 'error' })
      .rotate()
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      });

    // GIF input — preserve animation by passing `animated: true` upstream.
    // Sharp doesn't expose that on an existing pipeline, so re-init when
    // we see a GIF. Static GIFs go through the normal path fine.
    if (normalizedMime === 'image/gif') {
      pipeline = sharp(buffer, { failOn: 'error', animated: true })
        .resize({
          width: MAX_DIMENSION,
          height: MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        });
    }

    const { data, info } = await pipeline
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    const filename = `${randomUUID()}.webp`;
    const subdir = 'products';
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
