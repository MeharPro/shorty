#!/bin/bash

set -euo pipefail

VITE_PORT="${VITE_PORT:-5173}"
VITE_HOST="${VITE_HOST:-127.0.0.1}"
VERCEL_PORT="${VERCEL_PORT:-3000}"
VERCEL_ENABLED=0

echo "🚀 Starting Shorty..."

cleanup() {
  echo ""
  echo "🛑 Shutting down services..."
  if [ -n "${VITE_PID:-}" ] && kill -0 "$VITE_PID" 2>/dev/null; then
    kill "$VITE_PID"
  fi
  if [ -n "${VERCEL_PID:-}" ] && kill -0 "$VERCEL_PID" 2>/dev/null; then
    kill "$VERCEL_PID"
  fi
  exit 0
}

trap cleanup SIGINT SIGTERM

if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Free ports if already in use
free_port() {
  local port="$1"
  local pid
  pid=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "🔌 Killing process(es) on port $port (PID: $pid)..."
    echo "$pid" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
}

free_port "$VITE_PORT"
free_port "$VERCEL_PORT"

echo "🎨 Starting frontend (Vite) on http://${VITE_HOST}:${VITE_PORT}..."
npm run dev -- --host "$VITE_HOST" --port "$VITE_PORT" --strictPort &
VITE_PID=$!

sleep 2

if ! kill -0 "$VITE_PID" 2>/dev/null; then
  echo "❌ Frontend failed to start on http://${VITE_HOST}:${VITE_PORT}."
  echo "   Free that port or set VITE_PORT to another value."
  exit 1
fi

if [ "${VERCEL_SKIP_DEV:-0}" = "1" ]; then
  echo "⚙️  Skipping Vercel dev because VERCEL_SKIP_DEV=1."
elif ! command -v vercel >/dev/null 2>&1; then
  echo "⚙️  Skipping Vercel dev because the Vercel CLI is not installed."
  echo "   Install it with: npm install -g vercel"
elif ! vercel whoami >/dev/null 2>&1; then
  echo "⚙️  Skipping Vercel dev because Vercel is not authenticated."
  echo "   Run: vercel login"
else
  echo "⚙️  Starting backend (Vercel Dev) on http://127.0.0.1:${VERCEL_PORT}..."
  vercel dev --listen "$VERCEL_PORT" --yes &
  VERCEL_PID=$!
  VERCEL_ENABLED=1
fi

echo ""
echo "✅ Services running:"
echo "   Frontend: http://${VITE_HOST}:${VITE_PORT}"
if [ "$VERCEL_ENABLED" -eq 1 ]; then
  echo "   Backend:  http://127.0.0.1:${VERCEL_PORT}"
else
  echo "   Backend:  skipped"
fi
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

wait
