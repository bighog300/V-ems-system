#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

failures=0

check() {
  local name="$1"
  local cmd="$2"

  if eval "$cmd" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ ${name}: healthy${NC}"
  else
    echo -e "${RED}❌ ${name}: unhealthy${NC}"
    failures=$((failures + 1))
  fi
}

check "MySQL (vems-mysql-dev)" "docker exec vems-mysql-dev mysqladmin ping -h localhost --silent"
check "Redis (vems-redis-dev)" "docker exec vems-redis-dev redis-cli ping | grep -q PONG"
check "VtigerCRM (http://localhost:8080/)" "curl -fsS http://localhost:8080/"
check "OpenEMR (http://localhost:8081/)" "curl -fsS http://localhost:8081/"

echo
if [[ "$failures" -eq 0 ]]; then
  echo -e "${GREEN}All services are healthy.${NC}"
  exit 0
fi

echo -e "${RED}${failures} service check(s) failed.${NC}"
exit 1
