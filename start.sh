#!/bin/bash

# Start script for Shorty - runs frontend and backend services

set -e

echo "🚀 Starting Shorty..."

# Cleanup function to kill background processes
cleanup() {
  echo ""
  echo "🛑 Shutting down services..."
  if [ ! -z "$VITE_PID" ] && kill -0 $VITE_PID 2>/dev/null; then
    kill $VITE_PID
  fi
  if [ ! -z "$VERCEL_PID" ] && kill -0 $VERCEL_PID 2>/dev/null; then
    kill $VERCEL_PID
  fi
  exit 0
}

trap cleanup SIGINT SIGTERM

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
  echo "⚠️  Vercel CLI not found. Installing globally..."
  echo "   (API routes need Vercel CLI to run locally)"
  npm install -g vercel
fi

# Start Vite dev server (frontend)
echo "🎨 Starting frontend (Vite) on http://localhost:5173..."
npm run dev &
VITE_PID=$!

# Wait a moment for Vite to start
sleep 2

# Start Vercel dev server (backend API routes)
echo "⚙️  Starting backend (Vercel Dev) on http://localhost:3000..."
vercel dev --listen 3000 --yes &
VERCEL_PID=$!

echo ""
echo "✅ Services running:"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for background processes
wait
