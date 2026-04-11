import 'reflect-metadata';
import { join } from 'node:path';
import AutoLoad, { AutoloadPluginOptions } from '@fastify/autoload';
import { FastifyPluginAsync, FastifyServerOptions } from 'fastify';
import { initDatabase } from '@/config/database';

export interface AppOptions extends FastifyServerOptions, Partial<AutoloadPluginOptions> {}

const options: AppOptions = {
  trustProxy: true,
};

const app: FastifyPluginAsync<AppOptions> = async (fastify, opts): Promise<void> => {
  // Initialize database connection
  await initDatabase();

  // Load all plugins (cors, jwt, rate-limit, error-handler, sensible)
  await fastify.register(AutoLoad, {
    dir: join(__dirname, 'plugins'),
    options: opts,
  });

  // Load all routes
  await fastify.register(AutoLoad, {
    dir: join(__dirname, 'routes'),
    options: opts,
    routeParams: true,
  });
};

export default app;
export { app, options };
