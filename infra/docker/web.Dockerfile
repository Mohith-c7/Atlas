FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
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
  && pnpm install --filter @faios/web... --frozen-lockfile

FROM deps AS build
ENV NEXT_OUTPUT_STANDALONE=true
COPY apps/web apps/web
COPY packages packages
COPY tooling tooling
RUN pnpm --filter @faios/web build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN useradd --create-home --uid 10001 faios
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static apps/web/.next/static
USER faios
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
