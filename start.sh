#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: ./start.sh {start|check|development|production|worker}"
}

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_dir="${RUNTIME_PROJECT_SOURCE:-$project_dir}"
runtime_port="${PORT:-${BACKEND_PORT:-}}"
CHIP_DB_PATH="${CHIP_DB_PATH:-${DB_PATH:-}}"
export CHIP_DB_PATH

command -v node >/dev/null || { echo "Node.js is required" >&2; exit 69; }
command -v npm >/dev/null || { echo "npm is required" >&2; exit 69; }
test -f "$app_dir/package-lock.json" || { echo "package-lock.json is required" >&2; exit 78; }
test -d "$app_dir/node_modules" || { echo "Run npm ci explicitly before startup" >&2; exit 78; }

case "${1:-start}" in
  check)
    (cd "$app_dir" && npm run typecheck)
    (cd "$app_dir" && npm run check:production)
    ;;
  start)
    test -n "$runtime_port" || { echo "PORT or BACKEND_PORT is required" >&2; exit 78; }
    [[ "$runtime_port" =~ ^[0-9]+$ ]] || { echo "runtime port must be numeric" >&2; exit 78; }
    if lsof -tiTCP:"$runtime_port" -sTCP:LISTEN >/dev/null 2>&1; then echo "runtime port $runtime_port is occupied" >&2; exit 78; fi
    cd "$app_dir"
    exec npm run dev -- -H 127.0.0.1 -p "$runtime_port"
    ;;
  development)
    test "${NODE_ENV:-development}" != "production" || { echo "Refusing development mode under NODE_ENV=production" >&2; exit 78; }
    cd "$app_dir"
    exec npm run dev -- -H 127.0.0.1 ${runtime_port:+-p "$runtime_port"}
    ;;
  production)
    test "${NODE_ENV:-}" = "production" || { echo "NODE_ENV=production is required" >&2; exit 78; }
    (cd "$app_dir" && npm run check:production)
    cd "$app_dir"
    exec npm run start -- -H 127.0.0.1 ${runtime_port:+-p "$runtime_port"}
    ;;
  worker)
    test "${NODE_ENV:-}" = "production" || { echo "NODE_ENV=production is required" >&2; exit 78; }
    (cd "$app_dir" && npm run check:production)
    cd "$app_dir"
    exec npm run eda:worker
    ;;
  *)
    usage >&2
    exit 64
    ;;
esac
