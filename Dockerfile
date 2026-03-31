ARG NODE_VERSION=22.21.0

# --- Base ---
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# --- Dependencies ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Build ---
FROM base AS build
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:ts

# --- Production ---
FROM base
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./

EXPOSE 3001

CMD ["node", "node_modules/.bin/fastify", "start", "-l", "info", "-a", "0.0.0.0", "dist/app.js"]
