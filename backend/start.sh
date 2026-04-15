#!/bin/bash
set -e

echo "==> Starting Tor..."
mkdir -p /tmp/tor_data
tor --RunAsDaemon 1 --SocksPort 9050 --DataDirectory /tmp/tor_data --Log "notice stdout"

echo "==> Waiting for Tor to bootstrap (30s)..."
for i in $(seq 1 30); do
  if nc -z 127.0.0.1 9050 2>/dev/null; then
    echo "==> Tor is ready on port 9050"
    break
  fi
  sleep 1
done

echo "==> Starting uvicorn on port $PORT..."
exec uvicorn main:app --host 0.0.0.0 --port $PORT
