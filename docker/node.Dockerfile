# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY services ./services
COPY packages ./packages
COPY tooling ./tooling
RUN pnpm install --frozen-lockfile

FROM deps AS builder
ARG SERVICE
RUN pnpm turbo run build --filter=${SERVICE}

FROM base AS runner
ARG SERVICE
ENV NODE_ENV=production
ENV SERVICE=${SERVICE}
COPY --from=builder /app /app
CMD pnpm --filter "${SERVICE}" start
