// Global test setup — loaded before every test via ts-node -r
// Ensures consistent environment regardless of test file entry point
process.env.SKIP_DB = 'true';
process.env.SKIP_REDIS = 'true';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-testing-only';

// Disable HTTP proxies so nock can intercept axios calls
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.http_proxy;
delete process.env.https_proxy;
delete process.env.NO_PROXY;
delete process.env.no_proxy;
