#!/bin/bash
# Start Tor in background
tor --RunAsDaemon 1 --SocksPort 9050 --DataDirectory /tmp/tor_data
echo "Waiting for Tor to bootstrap..."
sleep 10
echo "Starting uvicorn..."
uvicorn main:app --host 0.0.0.0 --port $PORT
