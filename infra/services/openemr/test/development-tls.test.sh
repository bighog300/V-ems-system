#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

VEMS_DEV_TLS_DIR="$TEMP_DIR/tls" "$ROOT_DIR/scripts/generate-development-mysql-tls.sh" >/dev/null
TLS_DIR="$TEMP_DIR/tls"

openssl verify -CAfile "$TLS_DIR/ca.pem" -verify_hostname mysql "$TLS_DIR/server-cert.pem" >/dev/null
if openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt -verify_hostname mysql "$TLS_DIR/server-cert.pem" >/dev/null 2>&1; then
  echo 'untrusted CA unexpectedly verified the development server certificate' >&2
  exit 1
fi
if openssl verify -CAfile "$TLS_DIR/ca.pem" -verify_hostname not-mysql "$TLS_DIR/server-cert.pem" >/dev/null 2>&1; then
  echo 'hostname verification unexpectedly accepted the wrong hostname' >&2
  exit 1
fi

if grep -RniE --exclude='development-tls.test.sh' --exclude='init-openemr.test.sh' \
  -e 'skip-ssl' -e 'rejectUnauthorized' -e 'NODE_TLS_REJECT_UNAUTHORIZED' -e 'verify[[:space:]]*=[[:space:]]*false' \
  "$ROOT_DIR/infra/docker-compose.dev.yml" "$ROOT_DIR/infra/services/openemr" "$ROOT_DIR/scripts/generate-development-mysql-tls.sh" >/dev/null; then
  echo 'insecure TLS bypass found in development OpenEMR configuration' >&2
  exit 1
fi

echo 'Development TLS trust and hostname-verification regression passed.'
