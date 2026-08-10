#!/usr/bin/env bash
#
# Regenerate the hosted demo and publish it.
#
# The demo at https://analytics.ryansansbury.com is a static snapshot of this
# application, taken against a real PostgreSQL database with real models. It
# does not break, but it does age: its data is frozen at the date it was taken,
# and the sidebar says so. This script re-takes it.
#
# The seeder is deterministic (seed 42 across Faker, random, and numpy) but
# anchors its window to now minus two years, so a refresh reproduces the same
# dashboard re-dated to today rather than a different-looking one.
#
#   ./scripts/refresh-demo.sh                 reseed, snapshot, test, build, deploy
#   ./scripts/refresh-demo.sh --no-deploy     everything except publishing
#   ./scripts/refresh-demo.sh --skip-reseed   re-snapshot the database as it stands
#   ./scripts/refresh-demo.sh --yes           do not pause for confirmation
#
# The coverage test runs before the deploy, not after. It mounts every page
# under every date preset against the freshly written snapshot, so an endpoint
# the snapshot missed stops the release here rather than becoming a blank chart
# in production.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$REPO/backend"
FRONTEND="$REPO/frontend"

# This project's database, deliberately NOT read from an ambient DATABASE_URL.
#
# A global DATABASE_URL is a common thing to have exported in a shell profile,
# and it will belong to whatever project put it there. Inheriting it would point
# a reseed at somebody else's database, which drops and recreates tables. Set
# ANALYTICS_DATABASE_URL to override this one on purpose.
: "${ANALYTICS_DATABASE_URL:=postgresql://localhost:5432/analytics_dashboard}"
export DATABASE_URL="$ANALYTICS_DATABASE_URL"

PROJECT="analytics-dashboard"
DEMO_URL="https://analytics.ryansansbury.com"

RESEED=1
DEPLOY=1
CONFIRM=1

for arg in "$@"; do
  case "$arg" in
    --skip-reseed) RESEED=0 ;;
    --no-deploy)   DEPLOY=0 ;;
    --yes|-y)      CONFIRM=0 ;;
    # Prints the header block above, stopping at the first line that is not a
    # comment, so editing the header cannot desync the help text.
    -h|--help)     awk 'NR>2 && /^#/ {sub(/^# ?/,""); print; next} NR>2 {exit}' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
die()  { printf '\033[31merror: %s\033[0m\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------- preflight
# Checked up front so a missing tool fails in two seconds rather than after a
# four minute reseed.
step "Checking prerequisites"

PY="$BACKEND/venv/bin/python"
[ -x "$PY" ] || die "no virtualenv at $PY. Run: python3 -m venv backend/venv && backend/venv/bin/pip install -r backend/requirements.txt"
command -v node >/dev/null    || die "node is not installed"
[ "$DEPLOY" -eq 1 ] && { command -v wrangler >/dev/null || die "wrangler is not installed (brew install cloudflare-wrangler2)"; }
[ -d "$FRONTEND/node_modules" ] || die "frontend dependencies are missing. Run: (cd frontend && npm ci)"

"$PY" - <<'PY' || die "cannot reach the database. Is PostgreSQL running?"
import os, sys
import psycopg2
try:
    psycopg2.connect(os.environ["DATABASE_URL"]).close()
except Exception as exc:
    print(f"  {exc}".rstrip(), file=sys.stderr)
    sys.exit(1)
PY
echo "  database reachable"
echo "  toolchain present"

# ------------------------------------------------------------------- reseed
if [ "$RESEED" -eq 1 ]; then
  step "Reseeding the database (this is the slow part, a few minutes)"
  (cd "$BACKEND" && "$PY" reseed.py)
else
  step "Skipping reseed, snapshotting the database as it stands"
fi

# ----------------------------------------------------------------- snapshot
step "Snapshotting every endpoint"
(cd "$BACKEND" && "$PY" scripts/snapshot.py)

# --------------------------------------------------------------------- gate
# The release gate. A snapshot that does not cover the app must not ship.
step "Verifying the snapshot covers every request the pages make"
(cd "$FRONTEND" && npx vitest run src/services/staticData.test.tsx --reporter=dot) \
  || die "the snapshot does not cover the app. Nothing was deployed. Add the missing paths to endpoints_for() in backend/scripts/snapshot.py"

# -------------------------------------------------------------------- build
step "Building the static bundle"
(cd "$FRONTEND" && npm run build:static)

SNAPSHOT_DATE=$("$PY" -c "import json;print(json.load(open('$FRONTEND/public/data/manifest.json'))['snapshotDate'])")
FILES=$(find "$FRONTEND/dist/data" -name '*.json' | wc -l | tr -d ' ')
echo "  snapshot date : $SNAPSHOT_DATE"
echo "  data files    : $FILES"

if [ "$DEPLOY" -eq 0 ]; then
  step "Done, not deployed"
  echo "  Preview it with: (cd frontend && npx vite preview --port 4455)"
  exit 0
fi

# ------------------------------------------------------------------- deploy
if [ "$CONFIRM" -eq 1 ] && [ -t 0 ]; then
  printf '\nAbout to publish to %s (Cloudflare Pages project "%s").\nContinue? [y/N] ' "$DEMO_URL" "$PROJECT"
  read -r reply
  case "$reply" in [yY]*) ;; *) echo "Cancelled. Nothing was deployed."; exit 0 ;; esac
fi

step "Deploying to Cloudflare Pages"
(cd "$FRONTEND" && wrangler pages deploy dist --project-name "$PROJECT" --branch main --commit-dirty=true)

# ------------------------------------------------------------------- verify
# A deploy that reports success and serves the previous snapshot is the failure
# worth catching, so this checks the date rather than only the status code.
step "Verifying the live site"
for path in / /revenue /customers /operations /forecasting; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$DEMO_URL$path" || echo 000)
  printf '  %-14s %s\n' "$path" "$code"
  [ "$code" = "200" ] || die "$DEMO_URL$path returned $code"
done

# Cache-busted on purpose. /data/* is served with a five minute edge cache, so
# a plain request here can return the previous deploy's snapshot and make this
# check either pass on stale data or fail on a deploy that actually worked.
# A unique query string is a different cache key, so this reads the origin.
#
# Note what this does not prove: visitors during those five minutes may still be
# served the previous snapshot from the edge. That is acceptable for a demo and
# it is why the cache is short rather than immutable.
live=$(curl -s -m 20 "$DEMO_URL/data/manifest.json?deploy=$RANDOM$RANDOM" \
       | "$PY" -c "import json,sys;print(json.load(sys.stdin)['snapshotDate'])")
[ "$live" = "$SNAPSHOT_DATE" ] || die "origin reports $live but this build is $SNAPSHOT_DATE"

step "Live at $DEMO_URL, data as of $live"
echo "  Edge cache on /data/* is 5 minutes, so a browser may lag the origin by that much."
