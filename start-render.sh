#!/bin/sh
# Starts website + API together inside one Render web service.
PORT="${PORT:-10000}"

# 1) The website binds Render's public port immediately, so the deploy is marked healthy.
cd /app/frontend
./node_modules/.bin/next start -p "$PORT" &

# 2) Database schema (fast).
cd /app/backend
alembic upgrade head || { echo "alembic failed"; exit 1; }

# 3) The API comes up right away on the private loopback port the website proxies to...
uvicorn app.main:app --host 127.0.0.1 --port 8110 &

# 4) ...while the demo data loads in the background (first start only; later boots skip it in seconds).
python -m app.seed || echo "seed finished with an error (see log above)"
echo "demo data step finished"

# keep the container alive as long as the website / API run
wait
