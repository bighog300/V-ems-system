#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
SCRIPT_DIR="$ROOT_DIR/infra/services/openemr/init-scripts"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

mkdir -p "$TEMP_DIR/init-scripts"
cp "$SCRIPT_DIR/create-test-users.sql" "$SCRIPT_DIR/seed-data.sql" "$TEMP_DIR/init-scripts/"
sed "s#/opt/vems/init-scripts#$TEMP_DIR/init-scripts#g" "$SCRIPT_DIR/init-openemr.sh" > "$TEMP_DIR/init-scripts/init-openemr.sh"
chmod +x "$TEMP_DIR/init-scripts/init-openemr.sh"

cat > "$TEMP_DIR/mysqladmin" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

cat > "$TEMP_DIR/mysql" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ " $* " == *" -N -s "* ]]; then
  printf '1\n'
else
  printf '%s\n' "$*" >> "$OPENEMR_TEST_MYSQL_CALLS"
fi
EOF

chmod +x "$TEMP_DIR/mysqladmin" "$TEMP_DIR/mysql"

OPENEMR_TEST_MYSQL_CALLS="$TEMP_DIR/mysql-calls" \
PATH="$TEMP_DIR:$PATH" \
MYSQL_HOST=test-mysql \
MYSQL_PORT=3306 \
MYSQL_USER=test-user \
MYSQL_PASSWORD=test-password \
MYSQL_DATABASE=openemr \
  "$TEMP_DIR/init-scripts/init-openemr.sh" >/dev/null

grep -F -- '-e CREATE DATABASE IF NOT EXISTS `openemr`;' "$TEMP_DIR/mysql-calls" >/dev/null
grep -F -- "-e GRANT ALL PRIVILEGES ON \`openemr\`.* TO 'test-user'@'%'; FLUSH PRIVILEGES;" "$TEMP_DIR/mysql-calls" >/dev/null
if grep -F -- '\\`' "$SCRIPT_DIR/init-openemr.sh" >/dev/null; then
  echo 'invalid double-escaped MySQL identifier delimiter remains' >&2
  exit 1
fi

echo 'OpenEMR initializer delimiter regression passed.'
