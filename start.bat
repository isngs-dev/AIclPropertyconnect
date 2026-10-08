@echo off
REM Starts the AICL portal: API on http://localhost:8110 and website on http://localhost:3120
cd /d "%~dp0backend"
if not exist .venv (
  python -m venv .venv
  .venv\Scripts\python -m pip install -r requirements.txt
)
if not exist aicl.db (
  .venv\Scripts\alembic upgrade head
  .venv\Scripts\python -m app.seed
)
start "AICL API (8110)" cmd /k ".venv\Scripts\python -m uvicorn app.main:app --port 8110"
cd /d "%~dp0frontend"
if not exist node_modules call npm install
start "AICL Website (3120)" cmd /k "npm run dev"
timeout /t 12 >nul
start http://localhost:3120
