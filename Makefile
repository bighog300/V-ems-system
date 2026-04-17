SHELL := /bin/bash

ENV ?= development

.PHONY: help bootstrap init-db start-api start-web start-worker start-env stop-env smoke validate-connectivity test clean setup-containers health-check test-connections docker-logs docker-clean

help:
	@echo "Targets:"
	@echo "  make bootstrap               Install deps and initialize Docker + local scaffolding"
	@echo "  make init-db ENV=development Initialize sqlite schema for an environment"
	@echo "  make start-api ENV=...       Start api-gateway"
	@echo "  make start-web ENV=...       Start web-control"
	@echo "  make start-worker ENV=...    Start sync worker"
	@echo "  make start-env ENV=...       Start docker + api + web-control + worker in background"
	@echo "  make stop-env                Stop background environment services"
	@echo "  make smoke ENV=...           Run API smoke test against started environment"
	@echo "  make validate-connectivity   Run optional env-driven upstream connectivity checks"
	@echo "  make setup-containers        Build development Docker containers"
	@echo "  make health-check            Verify Docker service health"
	@echo "  make test-connections        Verify adapter endpoint connectivity"
	@echo "  make docker-logs             Tail development Docker logs"
	@echo "  make docker-clean            Stop and remove dev containers and volumes"
	@echo "  make test                    Run workspace tests"

bootstrap:
	./scripts/bootstrap.sh

init-db:
	./scripts/init-db.sh $(ENV)

start-api:
	./scripts/start-api.sh $(ENV)

start-web:
	./scripts/start-web-control.sh $(ENV)

start-worker:
	./scripts/start-sync-worker.sh $(ENV)

start-env:
	./scripts/start-env.sh $(ENV)

stop-env:
	./scripts/stop-env.sh

smoke:
	./scripts/smoke.sh $(ENV)

validate-connectivity:
	./scripts/validate-connectivity.sh $(ENV)

setup-containers:
	@echo "🔨 Building Docker containers..."
	docker-compose -f infra/docker-compose.dev.yml build

health-check:
	./scripts/health-check.sh

test-connections:
	./scripts/test-adapter-connections.sh

docker-logs:
	docker-compose -f infra/docker-compose.dev.yml logs -f

docker-clean:
	docker-compose -f infra/docker-compose.dev.yml down -v
	rm -f infra/.env

test:
	npm test

clean:
	rm -rf .pids .logs
