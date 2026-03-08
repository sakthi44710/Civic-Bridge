#!/bin/bash
set -e

echo "=== CivicBridge Container Starting ==="
mkdir -p /var/log/supervisor
export DISPLAY=:99

echo "[1/4] Starting Xvfb virtual display..."
Xvfb :99 -screen 0 1280x720x24 -ac +extension GLX +render -noreset &
XVFB_PID=$!
sleep 2
if ! kill -0 $XVFB_PID 2>/dev/null; then echo "ERROR: Xvfb failed"; exit 1; fi
echo "      Xvfb :99 running ✓"

echo "[2/4] Starting x11vnc VNC server..."
x11vnc -display :99 -forever -nopw -shared -quiet -noxdamage -bg
sleep 2
echo "      x11vnc port 5900 running ✓"

echo "[3/4] Starting noVNC websockify on port 6080..."
websockify --web /usr/share/novnc --heartbeat=30 --daemon 6080 localhost:5900
sleep 1
echo "      noVNC port 6080 running ✓"

echo "[4/4] Starting FastAPI on port 8000..."
echo ""
echo "  FastAPI → http://0.0.0.0:8000"
echo "  noVNC   → http://0.0.0.0:6080/vnc.html"
echo ""

exec uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --workers 1 --log-level info
