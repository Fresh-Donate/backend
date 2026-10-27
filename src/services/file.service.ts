import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { config } from '@/config';
import { ValidationError } from '@/core';
import type { StoredFile } from '@/types';

export const SHOP_FILES_SUBDIR = 'shop/files';

export function safeFileName(name: string): string {
  const cleaned = basename(name.replace(/\\/g, '/'))
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/^[._]+/, '')
    .slice(-100);
  return cleaned || 'file';
}

export class FileService {
  async saveShopFile(stream: Readable & { truncated?: boolean }, originalName: string, mimeType: string): Promise<StoredFile> {
    const name = safeFileName(originalName);
    const folder = randomUUID();
    const relativeDir = `${SHOP_FILES_SUBDIR}/${folder}`;
    const targetDir = resolve(process.cwd(), config.uploads.dir, relativeDir);
    const targetPath = join(targetDir, name);

    await mkdir(targetDir, { recursive: true });
    try {
      await pipeline(stream, createWriteStream(targetPath));
    } catch (err) {
      await rm(targetDir, { recursive: true, force: true });
      throw err;
    }

    if (stream.truncated) {
      await rm(targetDir, { recursive: true, force: true });
      throw new ValidationError(`Файл больше ${Math.floor(config.uploads.maxFileSize / 1024 / 1024)} МБ`);
    }

    const { size } = await stat(targetPath);
    if (size === 0) {
      await rm(targetDir, { recursive: true, force: true });
      throw new ValidationError('Пустой файл');
    }

    return { relativePath: `${relativeDir}/${name}`, name, bytes: size, mimeType };
  }
}
