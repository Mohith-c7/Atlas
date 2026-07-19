install:
	pnpm install

dev:
	pnpm dev

check:
	pnpm format:check
	pnpm lint
	pnpm typecheck
	pnpm test

infra-up:
	docker compose -f infra/docker/docker-compose.yml up -d

infra-down:
	docker compose -f infra/docker/docker-compose.yml down
