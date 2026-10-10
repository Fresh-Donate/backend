# FreshDonate - Backend

> REST API and payment/delivery core of the FreshDonate platform.

Part of the **FreshDonate** open‑source donation platform for Minecraft servers.
See also: [Shop](https://github.com/Fresh-Donate/shop) · [Admin Panel](https://github.com/Fresh-Donate/panel) · [Minecraft Plugin](https://github.com/Fresh-Donate/plugin) · [Russian README](README.ru.md)

---

## About FreshDonate

FreshDonate is a self‑hosted donation system for Minecraft servers. It lets you sell ranks, items, currency and any other in‑game goods through your own storefront, accept payments via multiple providers, and deliver purchases to players automatically the next time they are online - without any third‑party commission or lock‑in.

The platform is split into four repositories:

| Repository                                                                 | Role                                             |
|----------------------------------------------------------------------------|--------------------------------------------------|
| **fresh-donate-backend** *(this repo)*                                     | Fastify API, payments, webhooks, delivery queue  |
| [fresh-donate-shop](https://github.com/Fresh-Donate/shop)                  | Public storefront for players (Nuxt)             |
| [fresh-donate-panel](https://github.com/Fresh-Donate/panel)                | Admin panel for owners (Nuxt)                    |
| [fresh-donate-plugin](https://github.com/Fresh-Donate/plugin) | Minecraft plugin that delivers purchases in‑game |

## Role of this repository

The backend is the single source of truth for products, payments and customers. It:

- serves the REST API consumed by the shop and the admin panel;
- creates payments in external gateways (YooKassa, Heleket, Wata, Robokassa, Tebex, CryptoBot) and handles their webhooks;
- stores pending deliveries and hands them to the in‑game plugin when a player logs in;
- runs an RCON fallback for servers without the plugin installed;
- issues JWT tokens for the admin panel and rate‑limits public endpoints.

## Tech stack

- **Fastify 5** (TypeScript) + autoload plugins/routes
- **PostgreSQL 17** via **Sequelize 6** (sequelize‑typescript)
- **JWT** authentication, **bcrypt** for admin password hashing
- **axios** for outbound gateway calls
- **node:test** + **c8** for tests and coverage

## Requirements

- Node.js 20+
- PostgreSQL 14+ (17 recommended)
- For delivery: a running [fresh-donate-plugin](https://github.com/Fresh-Donate/plugin) **or** RCON access to the server

## Quick start (dev)

```bash
cp .env.example .env    # if provided, otherwise see "Configuration" below
npm install
npm run dev
```

API starts on `http://localhost:3001` by default. Schema changes are applied on boot by the migrations in `src/config/migrations.ts`; new tables and columns from the models are added automatically, nothing is ever dropped or altered.

## Build / production

```bash
npm run build:ts        # compiles TypeScript to dist/
npm start               # runs fastify-cli against dist/app.js
```

## Docker

A `Dockerfile` and `docker-compose.yml` are provided and bring up Postgres + backend together:

```bash
docker compose up -d --build
```

Redis is no longer used. On an existing install the `redis` container and `REDIS_*` variables can stay, they are ignored; to remove the container run `docker compose up -d --remove-orphans`.

## Configuration

All configuration is read from environment variables (see `src/config/index.ts`):

| Variable                                                      | Default                                                         | Description                                                                                                                                       |
|---------------------------------------------------------------|-----------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| `HOST` / `PORT`                                               | `0.0.0.0` / `3001`                                              | HTTP bind address                                                                                                                                 |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | `localhost` / `5432` / `fresh_donate` / `postgres` / `postgres` | PostgreSQL connection                                                                                                                             |
| `ADMIN_LOGIN` / `ADMIN_PASSWORD`                              | `admin` / `admin`                                               | Initial admin credentials (change in prod)                                                                                                        |
| `JWT_SECRET` / `JWT_EXPIRES_IN`                               | *(generated, stored in DB)* / `24h`                             | JWT signing. Empty or the `.env.example` value means a random secret is generated on first start and kept in the `settings` table. Changing `ADMIN_LOGIN` or `ADMIN_PASSWORD` signs out every session |
| `CORS_ORIGIN`                                                 | `http://localhost:3000,http://localhost:3002`                   | Comma‑separated allowed origins                                                                                                                   |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_TIMEWINDOW`                    | `100` / `60000`                                                 | Global rate limit                                                                                                                                 |
| `TRUSTED_PROXIES`                                             | private ranges                                                  | Proxies whose `X-Forwarded-For` is trusted when resolving the client IP. The default fits a reverse proxy on the Docker network (Coolify/Traefik, nginx in compose). `GET /health` returns the `ip` the backend sees: it must be your address, not the proxy's. Behind Cloudflare, add Cloudflare ranges here and to the proxy's trusted IPs |
| `<PROVIDER>_SKIP_SIGNATURE_CHECK`                             | `false`                                                         | `WATA`, `TEBEX`, `CRYPTOBOT`, `ROBOKASSA`: accept webhooks without a valid signature. Local debugging only, `NODE_ENV` no longer turns checks off |
| `PAYMENT_RETURN_URL`                                          | `http://localhost:3002/payment/success`                         | Where gateways redirect the player                                                                                                                |
| `WEBHOOK_BASE_URL`                                            | `http://localhost:3001`                                         | Public backend URL used in gateway webhooks                                                                                                       |
| `SKIP_DB`                                                     | `false`                                                         | Skip external deps (used by tests)                                                                                                                |

## Project structure

```
src/
  config/      env + sequelize bootstrap
  core/        base repository / service / controller, shared errors
  gateways/    YooKassa, Heleket, Wata, Robokassa, Tebex, CryptoBot HTTP clients
  models/      Sequelize models
  plugins/     Fastify plugins (jwt, cors, rate-limit, error-handler)
  routes/      auth, products, payments, customers, stats, webhooks, plugin
  services/    business logic (payments, delivery, rcon, settings, ...)
test/          node:test suites (unit + route‑level)
```

## Scripts

| Script                      | What it does                                 |
|-----------------------------|----------------------------------------------|
| `npm run dev`               | Build + watch + run with hot reload          |
| `npm start`                 | Production start (after `build:ts`)          |
| `npm run build:ts`          | Compile TypeScript to `dist/`                |
| `npm run test`              | Build, compile tests, run with `c8` coverage |
| `npm run lint` / `lint:fix` | ESLint                                       |

## Related repositories

- [fresh-donate-shop](https://github.com/Fresh-Donate/shop) - public storefront
- [fresh-donate-panel](https://github.com/Fresh-Donate/panel) - admin panel
- [fresh-donate-plugin](https://github.com/Fresh-Donate/plugin) - Minecraft delivery plugin

## License

See [LICENSE](LICENSE).
