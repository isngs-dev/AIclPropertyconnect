# One container runs BOTH the website (Next.js) and the API (FastAPI) - used by Render.
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Python dependencies (cached layer)
COPY backend/requirements.txt backend/requirements.txt
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r backend/requirements.txt

# Node dependencies (cached layer)
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci

COPY . .

# The website proxies /api/* to the API running in the same container.
ENV API_URL=http://127.0.0.1:8110
ENV NODE_OPTIONS=--max-old-space-size=1536
RUN cd frontend && npm run build

ENV PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1 SEED_LITE=1
CMD ["sh", "/app/start-render.sh"]
