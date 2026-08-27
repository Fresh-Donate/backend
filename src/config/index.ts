export const config = {
  server: {
    host: process.env.HOST || '0.0.0.0',
    port: parseInt(process.env.PORT || '3001', 10),
    pluginTimeout: parseInt(process.env.PLUGIN_TIMEOUT || '30000', 10),
  },

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'fresh_donate',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },

  admin: {
    login: process.env.ADMIN_LOGIN || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-to-a-random-secret-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3002').split(','),
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
  },

  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_TIMEWINDOW || '60000', 10),
    cache: parseInt(process.env.RATE_LIMIT_CACHE || '50000', 10),
  },

  trustedProxies: (process.env.TRUSTED_PROXIES
    || '127.0.0.1/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7,169.254.0.0/16,fe80::/10'
  ).split(',').map((s) => s.trim()).filter(Boolean),

  payment: {
    returnUrl: process.env.PAYMENT_RETURN_URL || 'http://localhost:3002/payment/success',
    webhookBaseUrl: process.env.WEBHOOK_BASE_URL || 'http://localhost:3001',
  },

  uploads: {
    dir: process.env.UPLOADS_DIR || 'uploads',
    maxFileSize: parseInt(process.env.UPLOADS_MAX_FILE_SIZE || '10485760', 10),
    publicBaseUrl: process.env.BACKEND_PUBLIC_URL || '',
  },

  telemetry: {
    host: process.env.APTABASE_HOST || 'https://telemetry.zaralx.ru',
    appKey: process.env.APTABASE_APP_KEY || 'A-SH-6436156094',
    disabled: process.env.APTABASE_DISABLED === 'true' || process.env.SKIP_TELEMETRY === 'true',
  },
} as const;
