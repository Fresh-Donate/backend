# FreshDonate — Backend

> REST API and payment/delivery core of the FreshDonate platform.

Part of the **FreshDonate** open‑source donation platform for Minecraft servers.
See also: [Shop](https://github.com/Fresh-Donate/shop) · [Admin Panel](https://github.com/Fresh-Donate/panel) · [Minecraft Plugin](https://github.com/Fresh-Donate/fresh-donate-plugin) · [Russian README](README.ru.md)

---

## About FreshDonate

FreshDonate is a self‑hosted donation system for Minecraft servers. It lets you sell ranks, items, currency and any other in‑game goods through your own storefront, accept payments via multiple providers, and deliver purchases to players automatically the next time they are online — without any third‑party commission or lock‑in.

The platform is split into four repositories:

| Repository | Role |
| --- | --- |
| **fresh-donate-backend** *(this repo)* | Fastify API, payments, webhooks, delivery queue |
| [fresh-donate-shop](https://github.com/Fresh-Donate/shop) | Public storefront for players (Nuxt) |
| [fresh-donate-panel](https://github.com/Fresh-Donate/panel) | Admin panel for owners (Nuxt) |
| [fresh-donate-plugin](https://github.com/Fresh-Donate/fresh-donate-plugin) | Minecraft plugin that delivers purchases in‑game |

## Role of this repository

The backend is the single source of truth for products, payments and customers. It:

- serves the REST API consumed by the shop and the admin panel;
- creates payments in external gateways (YooKassa, Heleket) and handles their webhooks;
- stores pending deliveries and hands them to the in‑game plugin when a player logs in;
- runs an RCON fallback for servers without the plugin installed;
- issues JWT tokens for the admin panel and rate‑limits public endpoints.

## Tech stack

- **Fastify 5** (TypeScript) + autoload plugins/routes
- **PostgreSQL 17** via **Sequelize 6** (sequelize‑typescript)
- **Redis 7** for rate‑limiting and short‑lived caches
- **JWT** authentication, **bcrypt** for admin password hashing
- **axios** for outbound gateway calls
- **node:test** + **c8** for tests and coverage

## Requirements

- Node.js 20+
- PostgreSQL 14+ (17 recommended)
- Redis 6+ (optional in dev — set `SKIP_REDIS=true`)
- For delivery: a running [fresh-donate-plugin](https://github.com/Fresh-Donate/fresh-donate-plugin) **or** RCON access to the server

## Quick start (dev)

```bash
cp .env.example .env    # if provided, otherwise see "Configuration" below
npm install
npm run dev
```

API starts on `http://localhost:3001` by default. The schema is synced automatically on boot (`sequelize.sync({ alter: true })`).

## Build / production

```bash
npm run build:ts        # compiles TypeScript to dist/
npm start               # runs fastify-cli against dist/app.js
```

## Docker

A `Dockerfile` and `docker-compose.yml` are provided and bring up Postgres + Redis + backend together:

```bash
docker compose up -d --build
```

## Configuration

All configuration is read from environment variables (see `src/config/index.ts`):

| Variable | Default | Description |
| --- | --- | --- |
| `HOST` / `PORT` | `0.0.0.0` / `3001` | HTTP bind address |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | `localhost` / `5432` / `fresh_donate` / `postgres` / `postgres` | PostgreSQL connection |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | `localhost` / `6379` / *(empty)* | Redis connection |
| `ADMIN_LOGIN` / `ADMIN_PASSWORD` | `admin` / `admin` | Initial admin credentials (change in prod) |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | `change-me...` / `7d` | JWT signing |
| `CORS_ORIGIN` | `http://localhost:3000,http://localhost:3002` | Comma‑separated allowed origins |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_TIMEWINDOW` | `100` / `60000` | Global rate limit |
| `PAYMENT_RETURN_URL` | `http://localhost:3002/payment/success` | Where gateways redirect the player |
| `WEBHOOK_BASE_URL` | `http://localhost:3001` | Public backend URL used in gateway webhooks |
| `SKIP_DB` / `SKIP_REDIS` | `false` | Skip external deps (used by tests) |

## Project structure

```
src/
  config/      env + sequelize bootstrap
  core/        base repository / service / controller, shared errors
  gateways/    YooKassa, Heleket HTTP clients
  models/      Sequelize models
  plugins/     Fastify plugins (jwt, cors, redis, rate-limit, error-handler)
  routes/      auth, products, payments, customers, stats, webhooks, plugin
  services/    business logic (payments, delivery, rcon, settings, ...)
test/          node:test suites (unit + route‑level)
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Build + watch + run with hot reload |
| `npm start` | Production start (after `build:ts`) |
| `npm run build:ts` | Compile TypeScript to `dist/` |
| `npm run test` | Build, compile tests, run with `c8` coverage |
| `npm run lint` / `lint:fix` | ESLint |

## Related repositories

- [fresh-donate-shop](https://github.com/Fresh-Donate/shop) — public storefront
- [fresh-donate-panel](https://github.com/Fresh-Donate/panel) — admin panel
- [fresh-donate-plugin](https://github.com/Fresh-Donate/fresh-donate-plugin) — Minecraft delivery plugin

## License

See [LICENSE](LICENSE).
