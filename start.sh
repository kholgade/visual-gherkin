#!/usr/bin/env bash
# Start Visual Gherkin (production mode)
# Reads PORT and UI_PORT from .env; defaults: server=17771, ui=18881
# UI is served by the Express server on PORT — UI_PORT is only used in dev mode.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Auto-create .env from .env.example if missing
if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

# Load .env
if [ -f .env ]; then
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
    export "$key=${value}"
  done < .env
fi

SERVER_PORT="${PORT:-17771}"

echo ""
echo "Building Visual Gherkin..."
npm run build

echo ""
echo "Starting server on http://localhost:${SERVER_PORT}"
PORT="${SERVER_PORT}" node dist/server/index.js
