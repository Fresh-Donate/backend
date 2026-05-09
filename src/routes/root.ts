import fs from 'fs';
import path from 'path';
import { type FastifyPluginAsync } from 'fastify';

function readBackendVersion(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { version?: string };
        if (pkg.version) return pkg.version;
      } catch { /* keep walking */ }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return '0.0.0';
}

const VERSION = readBackendVersion();

const root: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get('/', async () => {
    return {
      name: 'FreshDonate API',
      version: VERSION,
      status: 'running',
    };
  });

  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
};

export default root;
