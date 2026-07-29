#!/usr/bin/env bash
# Start the Attention Hub on macOS or Linux.
#
#   ./start.sh          production (the default: fast and quiet, and it builds
#                       itself once if it has never been built)
#   ./start.sh dev      development mode, for working on the hub itself
#
# Everything else, including which address and port it listens on, comes from
# hub.config.json. Nothing is configured in here.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "[hub] Installing dependencies (first run only)..."
  npm install
fi

# Next.js collects anonymous usage telemetry unless this is set. This hub sends
# nothing, so it is off here as well as in scripts/next-run.mjs: belt and braces
# on the one promise the product cannot afford to break quietly.
export NEXT_TELEMETRY_DISABLED=1

exec node scripts/serve.mjs "${1:-start}"
