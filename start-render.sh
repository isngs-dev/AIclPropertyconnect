#!/bin/sh
# Starts website + API together inside one Render web service.
PORT="${PORT:-10000}"

# 1) The website binds Render's public port immediately, so the deploy is marked healthy.
cd /app/frontend
./node_modules/.bin/next start -p "$PORT" &

# 2) Database schema, then demo data (only the very first time; later boots skip it in seconds).
cd /app/backend
alembic upgrade head || { echo "alembic failed"; exit 1; }
python -m app.seed || echo "seed finished with an error (see log above)"

# 3) The API on the private loopback port the website proxies to.
exec uvicorn app.main:app --host 127.0.0.1 --port 8110
