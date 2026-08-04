# syntax=docker/dockerfile:1

# ---- base: pin the exact pnpm version, matching your local 11.4.0 ----
FROM node:22-slim AS base
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl curl wget \
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
ARG TURNSTILE_SECRET_KEY
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
# NEXT_PUBLIC_* vars are inlined into the client JS bundle at build time —
# .dockerignore excludes .env* from the build context (so secrets never get
# baked into an image layer), so these must come in as explicit build args
# or the browser bundle silently ships with Sentry/PostHog-Sentry disabled.
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ORG
ARG NEXT_PUBLIC_SENTRY_PROJECT_ID
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
# Read client-side by lib/auth-client.ts (Better Auth's baseURL — without this
# it silently falls back to "http://localhost:3000" in the built bundle) and
# by several "use client" admin components (image URLs).
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_R2_PUBLIC_URL
ENV DATABASE_URL=${DATABASE_URL} \
    SENTRY_ORG=${SENTRY_ORG} \
    SENTRY_PROJECT=${SENTRY_PROJECT} \
    SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN} \
    SENTRY_DSN=${SENTRY_DSN} \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
    NEXT_PUBLIC_SENTRY_ORG=${NEXT_PUBLIC_SENTRY_ORG} \
    NEXT_PUBLIC_SENTRY_PROJECT_ID=${NEXT_PUBLIC_SENTRY_PROJECT_ID} \
    NEXT_PUBLIC_POSTHOG_KEY=${NEXT_PUBLIC_POSTHOG_KEY} \
    NEXT_PUBLIC_POSTHOG_HOST=${NEXT_PUBLIC_POSTHOG_HOST} \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_R2_PUBLIC_URL=${NEXT_PUBLIC_R2_PUBLIC_URL} \
    TURNSTILE_SECRET_KEY=${TURNSTILE_SECRET_KEY} \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY}
RUN pnpm build

# ---- runner: what actually ships and runs in production ----
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["pnpm", "start"]