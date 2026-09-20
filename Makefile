.PHONY: setup dev build test test-e2e lint typecheck db-reset db-seed db-studio diagrams docs ci up down logs

setup:
	pnpm setup

dev:
	pnpm dev

build:
	pnpm build

test:
	pnpm test

test-e2e:
	pnpm test:e2e

lint:
	pnpm lint

typecheck:
	pnpm typecheck

db-reset:
	pnpm db:reset

db-seed:
	pnpm db:seed

db-studio:
	pnpm db:studio

diagrams:
	pnpm diagrams

docs:
	pnpm docs

ci:
	pnpm ci

up:
	docker compose up --build

down:
	docker compose down -v

logs:
	docker compose logs -f
