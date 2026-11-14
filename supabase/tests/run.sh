#!/usr/bin/env bash
# Draait de databasetests tegen een tijdelijke lokale Postgres (16+).
set -euo pipefail
cd "$(dirname "$0")"
PGBIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
DIR=$(mktemp -d)
PORT=${PGPORT_TEST:-54329}
cleanup() { "$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
if [ "$(id -u)" = "0" ]; then RUN="runuser -u postgres --"; chown -R postgres "$DIR"; else RUN=""; fi
$RUN "$PGBIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
$RUN "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -w start >/dev/null
export PGOPTIONS="-c client_min_messages=warning"
PSQL=("$PGBIN/psql" -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X -o /dev/null)
"${PSQL[@]}" -f stub_supabase.sql
for f in ../migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f ../seed.sql
# Nog een keer: migratie en seed moeten veilig herhaalbaar zijn.
for f in ../migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f ../seed.sql
"${PSQL[@]}" -f tests.sql
echo "Databasetests geslaagd"
