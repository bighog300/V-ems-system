#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TLS_DIR="${VEMS_DEV_TLS_DIR:-$ROOT_DIR/infra/.tls/mysql}"
CA_KEY="$TLS_DIR/ca-key.pem"
CA_CERT="$TLS_DIR/ca.pem"
SERVER_KEY="$TLS_DIR/server-key.pem"
SERVER_CSR="$TLS_DIR/server.csr.pem"
SERVER_CERT="$TLS_DIR/server-cert.pem"
CONFIG="$TLS_DIR/server-cert.cnf"

mkdir -p "$TLS_DIR"
chmod 755 "$TLS_DIR"

if [[ -s "$CA_CERT" && -s "$SERVER_CERT" && -s "$SERVER_KEY" ]] && \
  openssl x509 -in "$SERVER_CERT" -noout -text 2>/dev/null | grep -q 'TLS Web Server Authentication' && \
  openssl x509 -in "$SERVER_CERT" -noout -text 2>/dev/null | grep -q 'TLS Web Client Authentication'; then
  openssl verify -CAfile "$CA_CERT" -verify_hostname mysql "$SERVER_CERT" >/dev/null
  exit 0
fi

umask 077
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 \
  -keyout "$CA_KEY" -out "$CA_CERT" \
  -subj "/CN=V-EMS Development MySQL CA" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" \
  -addext "subjectKeyIdentifier=hash" >/dev/null 2>&1

cat > "$CONFIG" <<'EOF'
[req]
distinguished_name = req_distinguished_name
req_extensions = req_ext
prompt = no

[req_distinguished_name]
CN = V-EMS Development MySQL Server

[req_ext]
subjectAltName = @alt_names
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth,clientAuth

[alt_names]
DNS.1 = mysql
DNS.2 = vems-mysql-dev
DNS.3 = localhost
IP.1 = 127.0.0.1
EOF

openssl req -new -newkey rsa:2048 -nodes \
  -keyout "$SERVER_KEY" -out "$SERVER_CSR" \
  -config "$CONFIG" >/dev/null 2>&1
openssl x509 -req -sha256 -days 3650 \
  -in "$SERVER_CSR" -CA "$CA_CERT" -CAkey "$CA_KEY" \
  -CAcreateserial -out "$SERVER_CERT" \
  -extfile "$CONFIG" -extensions req_ext >/dev/null 2>&1

rm -f "$SERVER_CSR" "$TLS_DIR/ca-cert.srl" "$CONFIG"
chmod 644 "$CA_CERT" "$SERVER_CERT" "$SERVER_KEY"
openssl verify -CAfile "$CA_CERT" -verify_hostname mysql "$SERVER_CERT" >/dev/null
echo "Generated development MySQL CA and server certificate in $TLS_DIR (private keys remain local and ignored)."
