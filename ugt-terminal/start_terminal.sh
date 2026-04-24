#!/bin/bash

echo "🚀 U.G.T. Terminal Bootstrapper"
echo "-------------------------------"

# Try to find docker
DOCKER_BIN=$(which docker 2>/dev/null)

if [ -z "$DOCKER_BIN" ]; then
    echo "🔍 Docker not in PATH. Searching in common locations..."
    PATHS=(
        "/usr/local/bin/docker"
        "/opt/homebrew/bin/docker"
        "/Applications/Docker.app/Contents/Resources/bin/docker"
        "$HOME/.orbstack/bin/docker"
        "/usr/bin/docker"
    )
    
    for p in "${PATHS[@]}"; do
        if [ -f "$p" ]; then
            DOCKER_BIN="$p"
            echo "✅ Found Docker at: $DOCKER_BIN"
            break
        fi
    done
fi

if [ -z "$DOCKER_BIN" ]; then
    echo "❌ CRITICAL ERROR: Docker binary not found."
    echo "Please ensure Docker Desktop or OrbStack is installed and running."
    exit 1
fi

# Try to find docker-compose
COMPOSE_CMD="$DOCKER_BIN compose"
if ! $COMPOSE_CMD version >/dev/null 2>&1; then
    DOCKER_COMPOSE_BIN=$(which docker-compose 2>/dev/null)
    if [ -z "$DOCKER_COMPOSE_BIN" ]; then
         echo "🔍 Searching for docker-compose legacy..."
         if [ -f "/usr/local/bin/docker-compose" ]; then DOCKER_COMPOSE_BIN="/usr/local/bin/docker-compose"; fi
    fi
    if [ -n "$DOCKER_COMPOSE_BIN" ]; then
        COMPOSE_CMD="$DOCKER_COMPOSE_BIN"
    else
        echo "❌ CRITICAL ERROR: Could not find 'docker compose' or 'docker-compose'."
        exit 1
    fi
fi

echo "📦 Starting services via: $COMPOSE_CMD"
$COMPOSE_CMD up -d --build

echo "-------------------------------"
echo "🌐 URL: http://127.0.0.1:3000"
echo "📊 STATUS: http://127.0.0.1:3001/api/system/status"
