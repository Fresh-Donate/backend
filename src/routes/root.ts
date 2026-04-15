import { FastifyPluginAsync } from 'fastify';
import { execSync } from 'node:child_process';

let gitCommit = process.env.GIT_COMMIT || '';
if (!gitCommit) {
  try {
    gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    gitCommit = 'unknown';
  }
}

const root: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get('/', async () => {
    return {
      name: 'FreshDonate API',
      version: '1.0.0',
      commit: gitCommit,
      status: 'running',
    };
  });

  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
};

export default root;
