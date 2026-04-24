# Rebuild Task List

Work through these tasks in order. Do not start a task until its prerequisites are complete.
Mark each item `[x]` when done. Each task includes a **Done when** condition — do not move on until it is met.

---

## 🔴 Human setup (complete before running Claude Code)

These steps require manual action and cannot be done by Claude Code.

- [ ] **Confirm Supabase project credentials** — gather `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, and the direct Postgres connection string (`SUPABASE_DB_URL`). You will need these for `.env` files.
- [ ] **Create a Vercel account** and connect this GitHub repo. Note the Vercel project URL.
- [ ] **Create a Render account** and connect this GitHub repo for the backend service. Note the Render service URL.
- [ ] **Set environment variables in Vercel** (frontend vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`).
- [ ] **Set environment variables in Render** (backend vars: all `SUPABASE_*` vars, `ALLOWED_ORIGINS`, `PORT`).

---

## Phase 1 — Discovery (start here)

### Task 1 — Read the existing codebase ✅
Read and summarize:
- `docs/index.html` and `docs/portfolio.html` (current UI, workflows, and data shapes in use)
- `generate_report.py` and `config.yaml` (current Python logic and field names)
- Any JSON files in `data/` or `docs/data/` (import/export contract)
- Any existing Supabase client calls in the `docs/` JS (table names, column names, query patterns)

Write a brief summary to `docs/discovery-notes.md` covering:
- All Supabase table names referenced in the current code
- All field names used in the current import/export JSON
- Any scoring or ranking calculations found
- Any workflows that need to be preserved

**Done when:** `docs/discovery-notes.md` exists and covers the four points above.
**Prerequisite:** none.

---

## Phase 2 — Backend skeleton

### Task 2 — Scaffold FastAPI backend ✅
Create the full `backend/` directory structure as specified in @docs/rebuild-plan.md (Backend components section).

Include:
- `backend/app/main.py` with FastAPI app init, CORS middleware (allow origins from env), and router registration stubs
- `backend/app/core/config.py` with a Pydantic Settings class loading all env vars
- `backend/app/core/auth.py` with a FastAPI dependency that verifies Supabase JWTs and returns `user_id`
- `backend/app/core/logging.py` with structured JSON logging and request ID middleware
- `backend/app/core/cache.py` with ETag generation helper
- `backend/pyproject.toml` with dependencies: `fastapi`, `uvicorn`, `pydantic`, `pydantic-settings`, `psycopg[binary]`, `python-jose`, `httpx`, `pytest`, `pytest-asyncio`
- `backend/Dockerfile` (Python 3.12 slim, non-root user)
- `backend/.env.example` with all required variable names (no real values)

**Done when:** `cd backend && pip install -e ".[dev]" && uvicorn app.main:app` starts with no import errors.
**Prerequisite:** Task 1.

### Task 3 — Build Pydantic models ✅
Create `backend/app/models/domain.py`, `api.py`, and `export.py` using the domain model tables in @docs/rebuild-plan.md.

Key constraints:
- `sport` enum: `football`, `basketball` only (soccer is out of scope)
- `category` enum: `graded`, `raw`, `bounce_back`
- `Target.trend_pct` is a `float | None`, not a formatted string
- Export envelope includes `schema_version`, `generated_at`, `last_updated`, `user`, `data`

**Done when:** `from app.models.domain import Target, PortfolioEntry, EbaySearch` imports cleanly with no errors.
**Prerequisite:** Task 2.

### Task 4 — Implement DB connection and query layer ✅
Create `backend/app/db/connection.py` using direct Postgres access (psycopg) with `SUPABASE_DB_URL` from settings.

Then implement query modules using table names and column names discovered in Task 1:
- `backend/app/db/queries/targets.py`
- `backend/app/db/queries/portfolio.py`
- `backend/app/db/queries/trends.py`
- `backend/app/db/queries/ebay.py`

If table names are ambiguous from the discovery notes, add a comment and use a reasonable default name — do not block on this.

**Done when:** A standalone test script (`backend/scripts/test_db.py`) connects to Supabase and returns at least one row from each table without error. (This script is for verification only — delete it after.)
**Prerequisite:** Task 3. Human setup must be complete (env vars available).

### Task 5 — Implement service layer ✅
Create service modules in `backend/app/services/` that call the query layer and return typed domain objects:
- `targets.py` — fetch, filter, and rank targets
- `portfolio.py` — fetch portfolio allocations
- `trends.py` — search and detail lookups
- `imports.py` — accept current JSON import format, map to domain objects, write to DB
- `exports.py` — build the full versioned snapshot

The import service must accept the current JSON format (`football_graded`, `basketball_graded`, `football_raw_to_grade`, `basketball_raw_to_grade`, `portfolios`, `ebay_searches`) via a compatibility adapter. Destructive import behavior is preserved (importing a section replaces that section).

**Done when:** `pytest backend/tests/test_services.py` passes with at least one test per service. Use mock DB fixtures — do not require a live DB connection in tests.
**Prerequisite:** Task 4.

### Task 6 — Implement read API routers ✅
Create routers and wire them to services for all read endpoints listed in @docs/rebuild-plan.md (API design table):

- `GET /api/v1/healthz` — no auth, returns `{"status": "ok"}`
- `GET /api/v1/readyz` — no auth, checks DB connection
- `GET /api/v1/bootstrap` — auth required, returns full snapshot payload
- `GET /api/v1/targets` — auth required, optional cursor pagination, ETag
- `GET /api/v1/targets/{id}` — auth required, ETag
- `GET /api/v1/portfolios` — auth required, ETag
- `GET /api/v1/ebay-searches` — auth required, optional cursor pagination, ETag
- `GET /api/v1/trends/search` — auth required, cursor pagination, short cache
- `GET /api/v1/trends/detail` — auth required, short cache
- `GET /api/v1/exports/snapshot` — auth required, ETag

Use the error envelope format from @docs/rebuild-plan.md for all error responses. Include `request_id` in every response.

**Done when:** `pytest backend/tests/test_routers.py` passes. `GET /api/v1/healthz` returns 200. `GET /api/v1/targets` with a valid auth header returns a correctly shaped response.
**Prerequisite:** Task 5.

### Task 7 — Implement write API routers ✅
Add CRUD for portfolio entries and the import endpoint:

- `GET /api/v1/portfolio-entries` — auth required, cursor pagination
- `POST /api/v1/portfolio-entries` — auth required
- `PATCH /api/v1/portfolio-entries/{id}` — auth required, must verify `user_id` ownership
- `DELETE /api/v1/portfolio-entries/{id}` — auth required, must verify `user_id` ownership
- `POST /api/v1/imports/targets` — auth required, accepts current JSON format

Ownership check: if `portfolio_entry.user_id !== request_user_id`, return 403.

**Done when:** `pytest backend/tests/test_routers.py` covers CRUD and ownership enforcement. A POST to `/api/v1/portfolio-entries` followed by a GET returns the created entry.
**Prerequisite:** Task 6.

---

## Phase 3 — Frontend

### Task 8 — Scaffold React frontend ✅
Create the full `frontend/` structure from @docs/rebuild-plan.md (Frontend structure section).

Requirements:
- Vite + React + TypeScript
- `tsconfig.json` must have `"strict": true` — this is non-negotiable
- Install: `react-router-dom`, `@tanstack/react-query`, `@supabase/supabase-js`
- `src/app/providers.tsx` wraps `QueryClientProvider`
- `src/lib/api.ts` is the central API client. It must:
  - Read `VITE_API_BASE_URL` from env for the base URL
  - Attach the Supabase Bearer token to every request
  - On a 401 response: call `supabase.auth.getSession()` to get a refreshed token, then retry the request once with the new token
  - If the retry also returns 401 (refresh failed), redirect to sign-in
- `frontend/.env.example` with all required variable names

**Done when:** `cd frontend && npm run build` completes with no TypeScript errors. `npx tsc --noEmit` exits 0.
**Prerequisite:** Task 7 (API must exist so the client has real endpoints to target).

### Task 9 — Build targets/dashboard screen ✅
Implement `src/pages/DashboardPage.tsx` and `src/features/targets/`.

- Fetch from `/api/v1/bootstrap` on load using TanStack Query
- Display targets grouped by category (graded / raw / bounce-back) and sport (football / basketball)
- Show: `card_name`, `grade`, `target_price`, `max_price`, `sell_at`, `trend_pct`, `is_new` badge
- Support filtering by sport and category
- Loading and error states required

**Done when:** Dashboard renders the targets list from the live API with no console errors. Filtering works.
**Prerequisite:** Task 8.

### Task 10 — Build portfolio screen ✅
Implement `src/pages/PortfolioPage.tsx` and `src/features/portfolio/`.

- Fetch from `/api/v1/portfolio-entries` using TanStack Query
- Support: add entry (POST), edit entry (PATCH), delete entry (DELETE), mark as sold
- Invalidate queries on mutation so the list reflects changes without a page reload
- Show portfolio allocations from `/api/v1/portfolios`

**Done when:** A portfolio entry can be created, edited, deleted, and marked sold. Changes reflect immediately in the UI.
**Prerequisite:** Task 9.

### Task 11 — Build trend analysis and eBay search screens ✅
Implement `src/pages/TrendPage.tsx` and `src/features/trends/` and `src/features/ebay/`.

- Trend page: search/autocomplete via `/api/v1/trends/search`, detail view via `/api/v1/trends/detail`
- eBay search page: list from `/api/v1/ebay-searches`, each entry links out to eBay with the `search_text`

**Done when:** Trend search returns results. eBay search list renders with working outbound links.
**Prerequisite:** Task 10.

### Task 12 — Build import screen ✅
Implement `src/features/imports/` with a JSON file import UI.

- File picker for `.json` files
- POST to `/api/v1/imports/targets` with the file content
- Show success/error feedback
- On success, invalidate all TanStack Query caches so the app reflects imported data

**Done when:** Uploading a valid current-format JSON file triggers a successful POST and the dashboard reflects the imported targets.
**Prerequisite:** Task 11.

---

## Phase 4 — Testing and CI

### Task 13 — Add backend tests ✅
Ensure test coverage for the minimum critical test cases in @docs/rebuild-plan.md (Testing plan section):
- Import compatibility (valid format, malformed payload, destructive semantics)
- Targets contract (response shape, ordering, ETag behavior)
- Portfolio CRUD (create/edit/delete/sold, ownership enforcement, derived values)
- Trend endpoints (exact match, fuzzy, missing data, thin-data fallback)

All tests must use mock/fixture DB — no live Supabase dependency in CI.

**Done when:** `pytest` exits 0 with all tests passing.
**Prerequisite:** Task 12.

### Task 14 — Add Playwright e2e tests ✅
Add Playwright tests covering:
- Sign-in flow
- Dashboard loads with targets
- Target filtering (sport, category)
- Portfolio add/edit/delete
- JSON import

Configure Playwright to run against a local dev backend pointed at a test Supabase project or seeded fixtures.

**Done when:** `npx playwright test` exits 0 for all critical flows.
**Prerequisite:** Task 13.

### Task 15 — Add CI workflows ✅
Create `.github/workflows/backend-ci.yml` and `.github/workflows/frontend-ci.yml`.

Backend CI steps: lint → type check → `pytest` → build Docker image.
Frontend CI steps: install → `tsc --noEmit` (must use `strict: true`) → `npm run build` → Playwright smoke tests.

**Done when:** Both workflows run green on a test branch push.
**Prerequisite:** Task 14.

---

## Phase 5 — Deployment and cutover

### Task 16 — Add deployment configs ✅
- Add `vercel.json` to `frontend/` if needed for SPA routing (redirect all routes to `index.html`)
- Confirm Render `Dockerfile` builds and the `/api/v1/healthz` endpoint responds on the Render URL
- Add `ALLOWED_ORIGINS` to backend config that includes the Vercel production URL and localhost

**Done when:** Backend `/api/v1/healthz` returns 200 on the Render URL. Frontend build deploys to a Vercel preview URL and loads without errors.
**Prerequisite:** Task 15. Human setup (Vercel + Render accounts) must be complete.

### Task 17 — Production cutover ✅
- Point the Vercel production domain to the new frontend
- Validate all critical user paths against production backend
- Update `docs/index.html` and `docs/portfolio.html` to redirect to the new Vercel URL (simple meta-refresh or JS redirect)
- Keep `docs/index-archive-2026-03-11.html` as a static rollback snapshot

**Done when:** All five E2E flows (login, dashboard, portfolio CRUD, import) pass against the production Vercel + Render deployment. The `docs/` redirect stubs work.
**Prerequisite:** Task 16.

---

## Rollback

If the new deployment fails at any point:
1. The legacy `docs/` pages remain accessible via GitHub Pages — revert the redirects
2. Use the Vercel dashboard to roll back to the previous frontend deployment
3. On Render, redeploy the previous Docker image tag
