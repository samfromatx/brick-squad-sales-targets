# Brick Squad Sales Targets — Rebuild

## Project overview

This repo contains a sports card buy/sell tracking app. The current state is a hybrid:
- Legacy Python CLI (`generate_report.py`, `config.yaml`, `update.sh`) that generates static HTML reports
- A live app surface in `docs/` (served via GitHub Pages) with sign-in, portfolio tracking, trend analysis, eBay search, and JSON import/export backed by Supabase

**Goal:** Separate the app into a proper Python backend API and a React frontend. Do not change databases. Do not rewrite domain logic. Preserve all existing user-facing workflows.

Full architecture details: @docs/rebuild-plan.md
Task list with checkboxes: @docs/tasks.md

## Decided architecture

| Layer | Decision |
|---|---|
| Backend | FastAPI + Pydantic + direct Postgres (psycopg / SQLAlchemy) |
| Database | Supabase Postgres (existing — do not migrate) |
| Auth | Supabase Auth — JWTs, verified on backend |
| Frontend | React + Vite + React Router + TanStack Query |
| Frontend deploy | Vercel (free Hobby tier) |
| Backend deploy | Render (persistent Python web service) |

## Non-negotiable rules

- **Soccer is out of scope.** Do not add soccer to any model, endpoint, or UI screen.
- **TypeScript strict mode is required.** `tsconfig.json` must include `"strict": true`. Type checks must pass before any PR or commit.
- **The `sport` enum contains only `football` and `basketball`.**
- **Do not re-platform away from Supabase** — not the DB, not the auth.
- **Do not rewrite domain math.** Port scoring, targeting, and ranking logic as-is; refine later.
- **Preserve import/export compatibility.** The current JSON import format must still work via a compatibility adapter.
- **Never expose Supabase service-role keys to the browser.** They belong in backend env vars only.

## Auth — token refresh requirement

The React API client (`src/lib/api.ts`) must intercept 401 responses and:
1. Call `supabase.auth.getSession()` or `supabase.auth.refreshSession()` to get a fresh token
2. Retry the original request with the new token
3. If refresh fails, redirect to sign-in

## Environment variables

See `backend/.env.example` and `frontend/.env.example` for required variables.
Never commit `.env` files with real values.

## Commands

### Backend
```bash
cd backend
pip install -e ".[dev]"
pytest                     # run all tests
uvicorn app.main:app --reload  # local dev server
```

### Frontend
```bash
cd frontend
npm install
npm run dev                # local dev server
npm run build              # production build
npx tsc --noEmit           # type check only
npx playwright test        # e2e tests
```

## Before writing any code

Read [`README.md`](README.md) first — it is the authoritative reference for the current app architecture, all features, DB schema, API endpoints, and operational runbooks (including how to trigger a Card Targets recalculation).

For task tracking, check @docs/tasks.md and pick up at the first unchecked item.
