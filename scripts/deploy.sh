#!/bin/bash
set -euo pipefail

# AgentHub Deploy Script
# Usage: ./scripts/deploy.sh [up|down|restart|logs|build]

COMPOSE_FILE="docker-compose.yml"
PROJECT_NAME="agenthub"

# Check for .env
if [ ! -f ".env" ]; then
  echo "Error: .env file not found. Create one with ANTHROPIC_API_KEY."
  echo "Example: echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env"
  exit 1
fi

# Check for Docker
if ! command -v docker &> /dev/null; then
  echo "Error: Docker is not installed."
  exit 1
fi

CMD="${1:-up}"

case "$CMD" in
  up)
    echo "Building and starting AgentHub..."
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d --build
    echo ""
    echo "AgentHub is running!"
    echo "  Web UI: http://localhost"
    echo "  API:    http://localhost:3001"
    ;;
  down)
    echo "Stopping AgentHub..."
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down
    ;;
  restart)
    echo "Restarting AgentHub..."
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" restart
    ;;
  logs)
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs -f
    ;;
  build)
    echo "Building AgentHub images..."
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" build
    ;;
  *)
    echo "Usage: $0 [up|down|restart|logs|build]"
    exit 1
    ;;
esac
