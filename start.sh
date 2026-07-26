#!/bin/bash
# Runs the Python FastAPI service and the Next.js server side by side in one
# container, and makes sure the whole container exits (so the platform
# restarts it) if either process dies — otherwise a crashed backend would
# leave a "half alive" container silently serving a broken app.
set -e

PY_PID=""
NEXT_PID=""

cleanup() {
  echo "Shutting down..."
  [ -n "$PY_PID" ] && kill -TERM "$PY_PID" 2>/dev/null
  [ -n "$NEXT_PID" ] && kill -TERM "$NEXT_PID" 2>/dev/null
  wait "$PY_PID" "$NEXT_PID" 2>/dev/null
}
trap cleanup TERM INT

python3 -m uvicorn api.main:app --host 0.0.0.0 --port 8002 &
PY_PID=$!

# Invoke the next binary directly (NOT `npm run start`) — npm forks a child
# to run the script and that child execs into next-server, so a plain `kill`
# on npm's PID leaves next-server running as an orphan. Calling the binary
# directly means the process we background IS next-server, so signals reach
# it immediately.
./node_modules/.bin/next start -p "${PORT:-3000}" &
NEXT_PID=$!

# Block until whichever process exits first, then propagate its exit code.
wait -n "$PY_PID" "$NEXT_PID"
EXIT_CODE=$?
cleanup
exit "$EXIT_CODE"
