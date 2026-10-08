# AICL Portal — Abuja Investments Company Limited

Ground Rent, Service Charge and Grievance management for AICL shop owners in Abuja, Nigeria (amounts in Naira ₦, times in WAT).

- **Frontend** – Next.js (App Router) · TypeScript · Tailwind · Radix primitives (shadcn-style) · Framer Motion · React Three Fiber · Recharts
- **Backend** – FastAPI · SQLAlchemy 2 · Alembic · JWT (access + rotating refresh) · bcrypt · ReportLab (PDF) · openpyxl (Excel) · APScheduler
- **Database** – SQLite "dummy database" out of the box, PostgreSQL by changing one env variable
- **Payments** – gateway abstraction; a built-in **mock gateway** (default) and **Paystack** (Nigeria, test mode)

```
aicl-portal/
  backend/    FastAPI app (app/), Alembic migrations (migrations/), tests (tests/)
  frontend/   Next.js app (src/app, src/components, src/lib)
```

## Quick start (Windows / macOS / Linux)

Requirements: Python 3.11+ and Node 20+.

### 1. Backend (port 8110)

```bash
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate      macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # defaults work as-is
alembic upgrade head            # creates the schema
python -m app.seed              # dummy data, FY 2023-24 onward (--reset rebuilds; --keep-signups keeps website registrations; --no-history skips history)
uvicorn app.main:app --port 8110 --reload
```

OpenAPI docs: <http://localhost:8110/docs> (Swagger) and `/redoc`.

### 2. Frontend (port 3120)

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:3120>. The Next.js server proxies `/api/*` to the backend (`API_URL`, default `http://localhost:8110`), so there is no CORS setup to do.

### Demo logins (seeded, development only)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@example.com` | `Admin@123` |
| Admin (accounts) | `accounts@example.com` | `Admin@123` |
| Shop owner 1 (pays on time) | `owner1@example.com` | `Owner@123` |
| 12 more owners (e.g. `amina.bello@example.com`) | firstname.lastname@example.com | `Owner@123` |

New people can simply **Register** — their account appears in the admin console immediately and their shop is billed for the current period straight away.

The login page has one-click buttons for these. Remove them and change the seed before any real deployment.

The seed (plus `app/seed_history.py`) creates one market (Garki Market), ~45 shops, 14 owners, four financial years of billing (FY 2023-24 onward), versioned Ground Rent and Service Charge rates (including a market override and a shop-type override), ~190 charges over two financial years, ~160 payments with PDF receipts (plus failed/cancelled attempts), shop documents in every review status, 5 grievances with threads, notifications and audit entries.

## Environment variables

### `backend/.env`

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./aicl.db` | Use `postgresql+psycopg://user:pass@host:5432/db` for PostgreSQL |
| `SECRET_KEY` | dev value | JWT signing key – **change in production** |
| `ACCESS_TOKEN_MINUTES` / `REFRESH_TOKEN_DAYS` | 30 / 7 | Token lifetimes |
| `FRONTEND_URL`, `CORS_ORIGINS` | `http://localhost:3120` | Reset-password links, CORS |
| `STORAGE_DIR`, `MAX_UPLOAD_MB` | `./storage`, 10 | Local file storage and upload limit |
| `ENABLE_SCHEDULER` | `true` | Run the scheduled jobs in-process |
| `PAYMENT_PROVIDER` | `mock` | `mock` or `paystack` |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` | – | Paystack **test** keys |
| `MOCK_WEBHOOK_SECRET` | dev value | HMAC secret used by the mock gateway |
| `SMTP_HOST/PORT/USER/PASSWORD/FROM` | empty | Leave `SMTP_HOST` empty to log emails to the console |

### `frontend/.env.local`

| Variable | Default | Purpose |
|---|---|---|
| `API_URL` | `http://localhost:8110` | Backend the Next.js server proxies `/api` to |

## Payments

Flow: login → select shop → select charge → view amount (with calculation basis) → pay online → confirmation → PDF receipt.

* **Never trust the client.** A payment becomes `PAID` only inside `process_payment_result()` (`backend/app/gateway.py`), reached from a **signature-verified webhook** (HMAC over the raw body), de-duplicated by event id, and only if the paid amount equals the stored amount. Paystack's redirect back to `/pay/callback` is re-verified server-to-server (`/api/payments/verify`).
* **Mock gateway (default):** the checkout step shows a simulated hosted page. Its buttons make the *server* sign and deliver a webhook to our own webhook handler, exactly like a real gateway. Disabled unless `PAYMENT_PROVIDER=mock`.
* **Paystack test mode:** set `PAYMENT_PROVIDER=paystack` and `PAYSTACK_SECRET_KEY=sk_test_...` (+ `PAYSTACK_PUBLIC_KEY`). The owner is sent to Paystack's hosted page and returns to `/pay/callback`, where the **server re-verifies the transaction with Paystack** before marking it paid. In the Paystack dashboard (Settings → API Keys & Webhooks) set the webhook URL to `https://<public-host>/api/payments/webhook/paystack` (use a tunnel such as ngrok locally); signatures (`x-paystack-signature`, HMAC-SHA512) are verified on the raw body. Amounts are sent in kobo, which is exactly our integer unit.
* Money is stored as **integer paise** everywhere; Service Charge = `area × rate` computed with integer maths.

## Business rules implemented

* **Rates are versioned** by `effective_from`; the most specific scope wins (shop › shop type › market › all), then the latest effective date not after the period start. A new rate never changes existing charges.
* **Ground Rent** – one charge per shop per financial year (April–March), generated 1 April, due 30 June (configurable under *Settings & Jobs*).
* **Service Charge** – one per shop per month, generated on the 1st, due on the 10th (configurable).
* **Overdue** – a daily job marks `PENDING` charges past their due date as `OVERDUE`.
* A shop registered **after** a period starts is billed from the **next full period** (no pro-rating). Admins can override this when generating manually.
* The model is ready for penalties/interest/discounts/exemptions/partial payments **without a rewrite**: `charge_adjustments` (signed amounts per charge) and `payment_allocations` (payment ↔ charge join) already exist but are unused.

## Scheduled jobs

APScheduler (in-process, WAT): annual Ground Rent (1 Apr 00:10), monthly Service Charge (1st 00:20), overdue sweep (daily 01:00). Each run is recorded in `job_runs`, all jobs are idempotent, and each can be run manually from **Admin → Settings & Jobs**. For multi-instance deployments run the scheduler in exactly one process (`ENABLE_SCHEDULER=false` elsewhere) or move the jobs to a worker/cron.

## Tests

```bash
cd backend
pytest -q
```

67 tests cover charge calculation and rate versioning, Naira formatting, payment webhook verification (bad signature, duplicates, amount mismatch, failure), receipts, role-based access control and cross-owner isolation, upload rules, grievance workflow, audit logging, and a smoke test of every list endpoint and each Excel/PDF export.

## Security notes

* bcrypt password hashing; refresh tokens are random, stored only as SHA-256 hashes, and rotated on every use.
* Owners can only see their own shops, charges, payments, documents and grievances (others return 404); admin routes require the `ADMIN` role.
* Uploads: PDF/JPG/PNG/DOC/DOCX only, 10 MB max, content signature checked, stored under random names, served only through authenticated endpoints.
* The audit log (`audit_logs`) is append-only from the application.
* The frontend keeps tokens in `localStorage` for simplicity. For production, prefer httpOnly, same-site cookies.

## Visual design & accessibility

Navy / sky-blue (from the AICL logo) with green and pink on neutral surfaces, light and dark themes. Pink call-to-action buttons use dark text (white on `#EC4899` would be only ≈ 3.5:1), and navy/green/pink *text* uses darker light-mode variants so it meets WCAG AA. Status colour is always paired with an icon and label. Red is only used for Failed payments and form errors. Currency is Nigerian Naira (₦1,250,000) with tabular numerals.

The landing/login hero uses real photos of **Garki Market, Abuja** (Wikimedia Commons, CC BY-SA 4.0 – credits in `frontend/public/garki/CREDITS.txt`). 3D (React Three Fiber) appears only in the dashboard donut and the payment-success coin. Each scene is lazy-loaded, caps the device pixel ratio at 1.5, pauses when off-screen, and falls back to a static SVG on low-end devices, when WebGL is unavailable, or when `prefers-reduced-motion` is set. Forms, tables and reports contain no 3D.

## Moving to PostgreSQL

```bash
docker run -d --name aicl-pg -e POSTGRES_USER=aicl -e POSTGRES_PASSWORD=aicl -e POSTGRES_DB=aicl -p 5432:5432 postgres:16
# backend/.env
DATABASE_URL=postgresql+psycopg://aicl:aicl@localhost:5432/aicl
alembic upgrade head && python -m app.seed
```

## Assumptions to confirm

Registration needs no approval; one admin role; English/INR only; no GST; one charge per payment (the schema supports more); logo/branding are text placeholders; email goes to the console until SMTP is configured; SMS is a stub.
