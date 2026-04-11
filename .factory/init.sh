#!/bin/bash
set -e

cd /Users/brojbean/code/personal-projects/oxox-new

# Install dependencies if node_modules missing or package.json changed
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules/.modules.yaml" ]; then
  echo "Installing dependencies..."
  pnpm install
fi

# Verify droid CLI is available
if ! command -v droid &> /dev/null; then
  echo "WARNING: droid CLI not found on PATH. Some features will be unavailable."
fi

# Ensure SQLite native bindings are built
if [ -d "node_modules/better-sqlite3" ]; then
  echo "Checking better-sqlite3 native bindings..."
  pnpm exec electron-rebuild -f -w better-sqlite3 2>/dev/null || true
fi

echo "OXOX environment ready."
