# Deploy AICL on Render (website + API + database)

`render.yaml` in this repository describes everything:

| Piece | Render service | Notes |
|---|---|---|
| Database | `aicl-db` (PostgreSQL, free) | free databases are deleted after ~30 days; upgrade for real use |
| API | `aicl-api` (Python web service) | runs migrations, then loads demo data once in the background |
| Website | `aicl-web` (Node web service) | proxies `/api/*` to the API over Render's private network |

## Steps
1. Sign in at https://dashboard.render.com (use "Sign in with GitHub" so Render can read the repo).
2. **New -> Blueprint**, connect the repository `isngs-dev/AIclPropertyconnect` (authorise Render for it if asked).
3. Render shows the 3 resources from `render.yaml`. Click **Apply**. The first build takes ~5-10 minutes.
4. Open the **aicl-web** URL (`https://aicl-web.onrender.com` or similar). Login: `admin@example.com` / `Admin@123`.
   - The demo data is created a few minutes after the API first starts. Until then login may say "incorrect email or password" - wait and retry.
   - API health: `<aicl-api url>/api/health`, API docs: `<aicl-api url>/docs`.
5. If the website URL is not exactly `https://aicl-web.onrender.com`, update `FRONTEND_URL` and `CORS_ORIGINS` on **aicl-api** (Environment tab) to the real URL.

## Good to know
- Free web services sleep after ~15 minutes without traffic; the next visit takes ~30-60 s to wake up.
- Uploaded documents and receipts are written to the service's disk, which is wiped on each deploy/restart on the free plan. For real use add a persistent disk or move storage to S3 (see `backend/app/storage.py`). Receipts are regenerated on download; demo documents are not.
- Payments run on the built-in **mock gateway**. For Paystack test payments set `PAYMENT_PROVIDER=paystack`, `PAYSTACK_SECRET_KEY=sk_test_...` and add the webhook `https://<aicl-web>/api/payments/webhook/paystack` in the Paystack dashboard.
- Before real use: remove the demo accounts and login buttons, rotate secrets, and use a paid database.
