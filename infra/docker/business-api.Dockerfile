FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY services/business-api/package.json services/business-api/package.json
COPY services/workers/package.json services/workers/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/env/package.json packages/env/package.json
COPY packages/events/package.json packages/events/package.json
COPY packages/logger/package.json packages/logger/package.json
COPY packages/mcp/package.json packages/mcp/package.json
COPY packages/memory-vector/package.json packages/memory-vector/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/security/package.json packages/security/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY tooling/eslint-config/package.json tooling/eslint-config/package.json
COPY tooling/prettier-config/package.json tooling/prettier-config/package.json
COPY tooling/typescript-config/package.json tooling/typescript-config/package.json
RUN pnpm config set fetch-timeout 600000 \
  && pnpm config set fetch-retries 5 \
  && pnpm install --filter @faios/business-api... --frozen-lockfile
COPY services/business-api services/business-api
COPY packages packages
COPY tooling tooling
RUN pnpm --filter @faios/database prisma:generate

FROM deps AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN useradd --create-home --uid 10001 faios
USER faios
EXPOSE 4000
CMD ["node", "--import", "tsx", "services/business-api/src/main.ts"]
