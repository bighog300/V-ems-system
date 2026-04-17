#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for bootstrap." >&2
  exit 1
fi

if ! command -v docker-compose >/dev/null 2>&1; then
  echo "docker-compose is required for bootstrap." >&2
  exit 1
fi

echo "📦 Installing Node dependencies..."
npm install

mkdir -p .pids .logs .data

if [[ ! -f "$ROOT_DIR/infra/.env" ]]; then
  echo "📝 Creating infra/.env from template..."
  cp "$ROOT_DIR/infra/.env.example" "$ROOT_DIR/infra/.env"
fi

echo "🔨 Building Docker images (this can take 5-10 minutes)..."
docker-compose -f "$ROOT_DIR/infra/docker-compose.dev.yml" --env-file "$ROOT_DIR/infra/.env" build --no-cache

echo "🚀 Starting MySQL..."
docker-compose -f "$ROOT_DIR/infra/docker-compose.dev.yml" --env-file "$ROOT_DIR/infra/.env" up -d mysql
sleep 5

echo "🚀 Starting Redis, VtigerCRM, and OpenEMR..."
docker-compose -f "$ROOT_DIR/infra/docker-compose.dev.yml" --env-file "$ROOT_DIR/infra/.env" up -d redis vtiger openemr

echo "🩺 Running health checks..."
"$ROOT_DIR/scripts/health-check.sh"

echo
echo "✅ Bootstrap complete"
echo "Next steps:"
echo "  make start-env"
echo "Service URLs:"
echo "  - VtigerCRM: http://localhost:8080"
echo "  - OpenEMR:   http://localhost:8081"
echo "  - API:       http://localhost:3000"
