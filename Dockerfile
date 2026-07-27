# syntax=docker/dockerfile:1

# ---- base: pin the exact pnpm version, matching your local 11.4.0 ----
FROM node:22-slim AS base
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.4.0 --activate
WORKDIR /app

# ---- deps: only reinstalls when the lockfile actually changes ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---- build: prisma generate + next build run here ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG DATABASE_URL
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_DSN
ENV DATABASE_URL=${DATABASE_URL} \
    SENTRY_ORG=${SENTRY_ORG} \
    SENTRY_PROJECT=${SENTRY_PROJECT} \
    SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN} \
    SENTRY_DSN=${SENTRY_DSN}
RUN pnpm build

# ---- runner: what actually ships and runs in production ----
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["pnpm", "start"]