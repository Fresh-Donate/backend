import 'reflect-metadata';
import { join } from 'node:path';
import AutoLoad, { type AutoloadPluginOptions } from '@fastify/autoload';
import { type FastifyPluginAsync, type FastifyServerOptions } from 'fastify';
import { initDatabase } from '@/config/database';

export interface AppOptions extends FastifyServerOptions, Partial<AutoloadPluginOptions> {}

const options: AppOptions = {
  trustProxy: true,
};

const app: FastifyPluginAsync<AppOptions> = async (fastify, opts): Promise<void> => {
  await initDatabase();

  await fastify.register(AutoLoad, {
    dir: join(__dirname, 'plugins'),
    options: opts,
  });

  await fastify.register(AutoLoad, {
    dir: join(__dirname, 'routes'),
    options: opts,
    routeParams: true,
  });
};

export default app;
export { app, options };
