# syntax=docker/dockerfile:1

# ---- base: Node + the one system library Prisma needs (openssl) ----
FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# ---- deps: ALL dependencies (dev too), needed to build ----
# Only the two package files are copied, so this layer is rebuilt
# only when dependencies change, NOT when source code changes.
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ---- build: generate the Prisma client, compile TypeScript ----
FROM deps AS build
COPY . .
# prisma.config.ts reads DATABASE_URL, so give it a dummy one. "generate"
# never connects to a database. (Not a secret, and not saved in the image.)
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate
RUN npm run build
# tsc only copies .ts -> .js. The generated client also has non-TS files
# (the query engine), so copy those next to the compiled code.
RUN cd src && find generated -type f ! -name '*.ts' -exec cp --parents {} ../dist/ \;

# ---- prod-deps: production dependencies only (no eslint, vitest, ...) ----
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# ---- runtime: the small final image ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
