SHELL := /bin/bash

ENV ?= development

.PHONY: help bootstrap init-db start-api start-web start-worker start-env stop-env smoke test clean

help:
	@echo "Targets:"
	@echo "  make bootstrap               Install deps and initialize local scaffolding"
	@echo "  make init-db ENV=development Initialize sqlite schema for an environment"
	@echo "  make start-api ENV=...       Start api-gateway"
	@echo "  make start-web ENV=...       Start web-control"
	@echo "  make start-worker ENV=...    Start sync worker"
	@echo "  make start-env ENV=...       Start api, web-control, and worker in background"
	@echo "  make stop-env                Stop background environment services"
	@echo "  make smoke ENV=...           Run API smoke test against started environment"
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

test:
	npm test

clean:
	rm -rf .pids .logs
