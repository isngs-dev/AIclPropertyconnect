# Deploy AICL on Render (website + API together)

`render.yaml` creates two things:

| Piece | Render resource | Notes |
|---|---|---|
| Database | `aicl-db` (PostgreSQL, free) | free databases are deleted after ~30 days |
| Website + API | `aicl-portal` (one Docker web service) | the website serves the pages and forwards `/api/*` to the API running in the same container, so there is no cross-service networking to break |

## Steps
1. https://dashboard.render.com -> sign in with GitHub.
2. **New -> Blueprint** -> repository `isngs-dev/AIclPropertyconnect` -> **Apply**.
3. Wait for the build (~8-12 minutes the first time). Open the `aicl-portal` URL.
4. **First start only:** the demo data is loaded for ~3-6 minutes after the website is up. During that time login may show an error - wait and retry. Later restarts take seconds.
5. Login: `admin@example.com` / `Admin@123`.

If you deployed an earlier version of this blueprint (`aicl-api` + `aicl-web`), delete those two services in Render and keep `aicl-db`.

## Good to know
- Free services sleep after ~15 minutes without visitors; the next visit takes 30-60 s.
- Uploaded documents and receipts live on the container disk and are wiped on each deploy/restart (free plan). Receipts are regenerated on download. For real use add a persistent disk or S3 (`backend/app/storage.py`).
- Payments use the built-in mock gateway. For Paystack test payments set `PAYMENT_PROVIDER=paystack` and `PAYSTACK_SECRET_KEY=sk_test_...` in the service's Environment tab.
- Logs: Render dashboard -> `aicl-portal` -> Logs (look for `alembic` / `Seeded:` lines).
