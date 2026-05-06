# FreshDonate — Backend

> REST API и ядро платежей/доставки платформы FreshDonate.

Часть проекта **FreshDonate** — open‑source платформы донатов для Minecraft‑серверов.
См. также: [Магазин](https://github.com/Fresh-Donate/shop) · [Админ‑панель](https://github.com/Fresh-Donate/panel) · [Minecraft‑плагин](https://github.com/Fresh-Donate/fresh-donate-plugin) · [English README](README.md)

---

## О проекте FreshDonate

FreshDonate — самохостимая система приёма донатов для Minecraft‑серверов. Она позволяет продавать привилегии, предметы, валюту и любые другие внутриигровые товары через собственную витрину, принимать оплату через несколько платёжных систем и автоматически доставлять покупки игрокам при следующем заходе на сервер — без комиссий сторонних сервисов и без вендор‑лока.

Платформа разделена на четыре репозитория:

| Репозиторий | Роль |
| --- | --- |
| **fresh-donate-backend** *(этот)* | Fastify API, платежи, вебхуки, очередь доставки |
| [fresh-donate-shop](https://github.com/Fresh-Donate/shop) | Публичная витрина для игроков (Nuxt) |
| [fresh-donate-panel](https://github.com/Fresh-Donate/panel) | Админка для владельца (Nuxt) |
| [fresh-donate-plugin](https://github.com/Fresh-Donate/fresh-donate-plugin) | Плагин Minecraft, выдающий покупки в игре |

## Роль этого репозитория

Бекенд — единый источник правды по товарам, платежам и клиентам. Он:

- отдаёт REST API, который используют магазин и админка;
- создаёт платежи во внешних шлюзах (YooKassa, Heleket) и обрабатывает их вебхуки;
- хранит отложенные доставки и передаёт их плагину при заходе игрока;
- умеет доставлять покупки через RCON, если плагин не установлен;
- выдаёт JWT для админки и ограничивает публичные ручки через rate‑limit.

## Стек

- **Fastify 5** (TypeScript) + autoload плагинов/роутов
- **PostgreSQL 17** через **Sequelize 6** (sequelize‑typescript)
- **Redis 7** для rate‑limit и коротких кэшей
- **JWT** для авторизации, **bcrypt** для хеширования пароля админа
- **axios** для запросов во внешние шлюзы
- **node:test** + **c8** для тестов и покрытия

## Требования

- Node.js 20+
- PostgreSQL 14+ (рекомендуется 17)
- Redis 6+ (в dev‑режиме можно отключить: `SKIP_REDIS=true`)
- Для доставки: запущенный [fresh-donate-plugin](https://github.com/Fresh-Donate/fresh-donate-plugin) **или** RCON‑доступ к серверу

## Быстрый старт (dev)

```bash
cp .env.example .env    # если файла нет — см. раздел «Конфигурация» ниже
npm install
npm run dev
```

API поднимется на `http://localhost:3001`. Схема БД синхронизируется автоматически при старте (`sequelize.sync({ alter: true })`).

## Production‑сборка

```bash
npm run build:ts        # компиляция TypeScript в dist/
npm start               # запуск fastify-cli на dist/app.js
```

## Docker

В репозитории есть `Dockerfile` и `docker-compose.yml`, которые поднимут Postgres + Redis + бекенд одной командой:

```bash
docker compose up -d --build
```

## Конфигурация

Все настройки читаются из переменных окружения (см. `src/config/index.ts`):

| Переменная | По умолчанию | Описание |
| --- | --- | --- |
| `HOST` / `PORT` | `0.0.0.0` / `3001` | Адрес HTTP‑сервера |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | `localhost` / `5432` / `fresh_donate` / `postgres` / `postgres` | Подключение к PostgreSQL |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | `localhost` / `6379` / *(пусто)* | Подключение к Redis |
| `ADMIN_LOGIN` / `ADMIN_PASSWORD` | `admin` / `admin` | Стартовые учётные данные админа (смени на проде!) |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | `change-me...` / `7d` | Параметры JWT |
| `CORS_ORIGIN` | `http://localhost:3000,http://localhost:3002` | Список разрешённых origin через запятую |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_TIMEWINDOW` | `100` / `60000` | Глобальный rate‑limit |
| `PAYMENT_RETURN_URL` | `http://localhost:3002/payment/success` | Куда редиректит шлюз игрока после оплаты |
| `WEBHOOK_BASE_URL` | `http://localhost:3001` | Публичный URL бекенда для вебхуков шлюзов |
| `SKIP_DB` / `SKIP_REDIS` | `false` | Отключить внешние зависимости (используется тестами) |

## Структура проекта

```
src/
  config/      env и инициализация sequelize
  core/        базовые repository/service/controller, общие ошибки
  gateways/    HTTP‑клиенты для YooKassa, Heleket
  models/      модели Sequelize
  plugins/     плагины Fastify (jwt, cors, redis, rate-limit, error-handler)
  routes/      auth, products, payments, customers, stats, webhooks, plugin
  services/    бизнес‑логика (платежи, доставка, rcon, настройки, ...)
test/          тесты на node:test (unit + route‑level)
```

## Скрипты

| Скрипт | Что делает |
| --- | --- |
| `npm run dev` | Сборка + watch + hot reload |
| `npm start` | Production‑запуск (после `build:ts`) |
| `npm run build:ts` | Компиляция TypeScript в `dist/` |
| `npm run test` | Сборка, компиляция тестов, запуск с покрытием `c8` |
| `npm run lint` / `lint:fix` | ESLint |

## Связанные репозитории

- [fresh-donate-shop](https://github.com/Fresh-Donate/shop) — публичная витрина
- [fresh-donate-panel](https://github.com/Fresh-Donate/panel) — админ‑панель
- [fresh-donate-plugin](https://github.com/Fresh-Donate/fresh-donate-plugin) — плагин доставки для Minecraft

## Лицензия

См. [LICENSE](LICENSE).
