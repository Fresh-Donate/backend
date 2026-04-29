export const config = {
  server: {
    host: process.env.HOST || '0.0.0.0',
    port: parseInt(process.env.PORT || '3001', 10),
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
  },

  payment: {
    returnUrl: process.env.PAYMENT_RETURN_URL || 'http://localhost:3002/payment/success',
    webhookBaseUrl: process.env.WEBHOOK_BASE_URL || 'http://localhost:3001',
  },

  uploads: {
    // Filesystem location for user-uploaded assets (product images etc.).
    // In Docker this is backed by a persistent volume — see docker-compose.yml.
    dir: process.env.UPLOADS_DIR || 'uploads',
    // Hard upper bound on a single uploaded file. We resize/recompress on
    // ingest, so this only needs to accommodate the largest source the admin
    // might drop in (phone photos can hit ~10 MB).
    maxFileSize: parseInt(process.env.UPLOADS_MAX_FILE_SIZE || '10485760', 10), // 10 MB
    // Optional canonical URL of the backend ("https://api.example.com").
    // When set, upload responses return absolute URLs built from this; when
    // empty, the URL is derived from the incoming request — handy for local
    // dev where the backend is reached at multiple hostnames.
    publicBaseUrl: process.env.BACKEND_PUBLIC_URL || '',
  },
} as const;
