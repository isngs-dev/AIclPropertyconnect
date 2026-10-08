# Deploying AICL with Netlify

The portal has two parts:

| Part | Where it runs | Why |
|---|---|---|
| `frontend/` (Next.js website) | **Netlify** | Netlify hosts Next.js sites |
| `backend/` (FastAPI API + database) | **Render** (or Railway/Fly) | Netlify cannot run Python servers |

Netlify alone is not enough: the website needs the API for login, charges, payments and so on.

## 1. Backend on Render (free tier works for a demo)
1. Push this folder to a GitHub repository.
2. Render -> New -> **PostgreSQL** (free). Copy its *Internal Database URL* and change the beginning from `postgres://` to `postgresql+psycopg://`.
3. Render -> New -> **Blueprint** -> pick the repo. It reads `render.yaml`. Fill the asked variables:
   - `DATABASE_URL` = the URL from step 2
   - `FRONTEND_URL` and `CORS_ORIGINS` = your Netlify URL (you can set these after step 2 below)
4. After deploy, open `https://<your-api>.onrender.com/api/health` -> should say `{"status":"ok"}`. API docs: `/docs`.
   The first start builds the schema and loads the demo data (admin@example.com / Admin@123, owner1@example.com / Owner@123).

## 2. Website on Netlify
1. Netlify -> Add new site -> Import from GitHub -> choose the repo.
2. **Base directory:** `frontend` (the `netlify.toml` there sets the rest).
3. Site settings -> Environment variables -> add `API_URL` = `https://<your-api>.onrender.com` (no trailing slash).
4. Deploy. The website forwards `/api/*` to that backend.
5. Put the Netlify URL into the backend's `FRONTEND_URL` and `CORS_ORIGINS` on Render, then redeploy the API.

## Notes
- **Uploads** (documents, receipts) are stored on the server disk. Render's free disk is wiped on every deploy; for real use attach a persistent disk or move storage to S3 (see `backend/app/storage.py`).
- Free Render services sleep after inactivity, so the first request can take ~30 s.
- Before real use: change `SECRET_KEY`, remove the demo accounts/buttons, and add Paystack live keys.
- Drag-and-drop of this zip into Netlify only works for static sites; for this Next.js app use the Git-based flow above.
