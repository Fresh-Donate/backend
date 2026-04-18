// Shared test helpers: fastify app bootstrap and common utilities
import * as path from 'node:path';
import * as test from 'node:test';

// Force skip DB connection for tests
process.env.SKIP_DB = 'true';
process.env.SKIP_REDIS = 'true';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-testing-only';

// Disable HTTP proxies so nock can intercept axios calls
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.http_proxy;
delete process.env.https_proxy;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const helper = require('fastify-cli/helper.js');

export type TestContext = {
  after: typeof test.after;
};

const AppPath = path.join(__dirname, '..', 'src', 'app.ts');

function config() {
  return { skipOverride: true };
}

/**
 * Bootstrap the full Fastify app (without DB connection).
 * Use for route / plugin integration tests that don't hit the DB directly.
 */
async function build(t: TestContext) {
  const argv = [AppPath];
  const app = await helper.build(argv, config());
  t.after(() => void app.close());
  return app;
}

export { config, build };
