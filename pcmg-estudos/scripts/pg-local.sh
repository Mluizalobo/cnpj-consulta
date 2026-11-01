#!/usr/bin/env bash
# Sobe um PostgreSQL temporário para os testes de banco (tests/db).
set -e
BIN=/usr/lib/postgresql/16/bin
DIR=${PGTEST_DIR:-/tmp/pcmg-pgtest}
PORT=${PGTEST_PORT:-54329}
if [ ! -d "$DIR" ]; then
  mkdir -p "$DIR"; chown postgres "$DIR" 2>/dev/null || true
  su postgres -c "$BIN/initdb -D $DIR -A trust -U postgres" >/dev/null
fi
su postgres -c "$BIN/pg_ctl -D $DIR -o '-p $PORT -k /tmp' -l $DIR/log.txt start" >/dev/null || true
sleep 1
echo "postgres://postgres@localhost:$PORT/postgres"
