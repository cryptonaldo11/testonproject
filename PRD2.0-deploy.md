# PRD2.0 Deployment Record and Compile Runbook

> Reference for future compile, build, deploy, and production verification work.
> Agents should read this file before changing deployment settings, compiling production builds, or troubleshooting production login/build issues.

## 1. Current successful production deployment

### Production targets
- **Frontend:** Cloudflare Pages
- **Frontend Pages project:** `teston-hr-app`
- **Frontend custom domain:** `https://www.testonlandscape.online`
- **Frontend Pages domain:** `https://teston-hr-app.pages.dev`
- **API platform:** Render
- **API service:** `teston-api`
- **Render service id:** `srv-d73d7dp5pdvs738it780`
- **API custom domain:** `https://api.testonlandscape.online`
- **API Render origin:** `https://teston-api.onrender.com`
- **Database:** Neon Postgres

### Production topology
- Frontend is built from `artifacts/hr-app`.
- Frontend static output is `artifacts/hr-app/dist/public`.
- API is mounted under `/api`.
- Production frontend should be built with `VITE_API_BASE_URL=https://api.testonlandscape.online`.
- `artifacts/hr-app/src/main.tsx` uses `VITE_API_BASE_URL` for the generated API client.
- `artifacts/hr-app/src/pages/MedicalCertificates.tsx` also depends on `VITE_API_BASE_URL` for storage/document URLs.

## 2. Verified successful live checks

### Deployment Record (2026-03-30)

**Deployment summary — Operations cockpit + Phase 4A / PRD2.1 rollout**

| Component | Target | Status |
|-----------|--------|--------|
| **GitHub frontend branch** | `master` | ✅ Pushed — commit `c191be42e4908f0771017c60176572bd93311e22` |
| **GitHub backend branch** | `deploy` | ✅ Pushed — commit `c191be42e4908f0771017c60176572bd93311e22` |
| **Frontend Pages deploy** | Cloudflare Pages (`teston-hr-app`) | ✅ Deployed — `https://79f43989.teston-hr-app.pages.dev` |
| **API deploy** | Render (`teston-api`) | ✅ Live — deploy `dep-d750eg9r0fns73d5a370` |
| **Database schema** | Neon Postgres (`testonHRdb`) | ✅ Production schema push applied via `pnpm --filter @workspace/db run push` |

**Deployed commit:**
- `c191be42e4908f0771017c60176572bd93311e22`
- Commit message: `feat: ship operations cockpit and phase 4A workflows`

**Deployment actions performed:**
- verified production build with `VITE_API_BASE_URL=https://api.testonlandscape.online`
- pushed deployable code to `master` and `deploy`
- deployed frontend explicitly to Cloudflare Pages from `artifacts/hr-app/dist/public`
- triggered new Render deploy for `teston-api`
- confirmed Render service env keys were present: `PORT`, `NODE_ENV`, `JWT_SECRET`, `DATABASE_URL`
- applied production DB schema changes directly against Neon using the Render `DATABASE_URL`

**Production issue found and fixed during rollout:**
1. **Split-origin frontend API bug**
   - Some frontend pages still used raw relative `/api/...` fetches, which would fail against Cloudflare Pages in production.
   - Fixed before release in:
     - `artifacts/hr-app/src/pages/Attendance.tsx`
     - `artifacts/hr-app/src/pages/CheckIn.tsx`
     - `artifacts/hr-app/src/pages/Interventions.tsx`
2. **Interventions endpoint returned HTTP 500 after backend deploy**
   - Root cause: production database schema had not yet been updated for the new interventions-related tables/shape.
   - Fix: ran `pnpm --filter @workspace/db run push` against production Neon.
   - Result: `GET /api/interventions` returned valid JSON afterward.

**Live checks completed successfully after deployment:**
- `https://www.testonlandscape.online` returned HTTP 200
- `https://teston-hr-app.pages.dev` returned HTTP 200
- `https://api.testonlandscape.online/api/healthz` returned HTTP 200 with `{"status":"ok"}`
- seeded admin production login worked against:
  - `https://api.testonlandscape.online`
  - `https://teston-api.onrender.com`
- authenticated `GET /api/auth/me` worked
- authenticated `GET /api/leaves` worked
- authenticated paginated `GET /api/users?page=1&pageSize=5` worked
- authenticated `GET /api/anomalies` worked
- authenticated `GET /api/interventions` worked after production schema push
- `GET /api/operational-control/summary` returned auth JSON (`401 Unauthorized`) when unauthenticated, confirming the route is mounted in the deployed backend

**Deployment note:**
- The base path `/api/operational-control` is **not** the implemented route. The deployed route is `/api/operational-control/summary`.

The following production checks succeeded during the working deployment session:

- `https://www.testonlandscape.online` returned HTTP 200
- `https://teston-hr-app.pages.dev` returned HTTP 200
- `https://api.testonlandscape.online/api/healthz` returned HTTP 200 with `{\"status\":\"ok\"}`
- seeded production login worked against the production API
- authenticated `GET /api/auth/me` worked
- authenticated `GET /api/leaves` worked
- SPA route `/dashboard` served correctly
- anomaly route was confirmed deployed because `/api/anomalies` returned auth JSON instead of a 404 HTML page

## 3. Production build and deploy commands

### Frontend build
```bash
VITE_API_BASE_URL=https://api.testonlandscape.online pnpm --filter @workspace/hr-app run build
```

### Frontend Pages deploy
```bash
CLOUDFLARE_API_TOKEN=<fresh-pages-token> \
CLOUDFLARE_ACCOUNT_ID=5ae57a6f2c39b68b73411c25d4320aec \
npx wrangler@4.43.0 pages deploy artifacts/hr-app/dist/public --project-name teston-hr-app --branch master
```

### API health verification
```bash
curl -i https://api.testonlandscape.online/api/healthz
```

### Production login verification
```bash
curl -X POST https://api.testonlandscape.online/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@teston.com","password":"<admin-password>"}'
```

### Authenticated verification examples
```bash
curl https://api.testonlandscape.online/api/auth/me \
  -H 'Authorization: Bearer <token>'

curl https://api.testonlandscape.online/api/leaves \
  -H 'Authorization: Bearer <token>'
```

## 4. Required environment variables

### Frontend
- `VITE_API_BASE_URL=https://api.testonlandscape.online`

### API
- `DATABASE_URL`
- `JWT_SECRET`
- `PORT`
- `NODE_ENV`

### CI
Current CI file: `.github/workflows/ci.yml`

Important CI detail:
- CI currently builds with `VITE_API_BASE_URL=https://teston-api.onrender.com`
- Production frontend deploys should still use `https://api.testonlandscape.online` unless the API host changes

## 5. Known compile/deploy pitfalls to avoid

### 1. Wrong Pages project name
Use **`teston-hr-app`**, not `hr-app`.

Confirmed in:
- `artifacts/hr-app/wrangler.toml`

### 2. Missing `VITE_API_BASE_URL`
If the frontend is built without the correct API base URL:
- login can fail even when backend credentials are correct
- the frontend may call the wrong origin
- Medical Certificates document links can break

### 3. Wrong output directory
Cloudflare Pages deploy target must be:
- `artifacts/hr-app/dist/public`

### 4. Do not assume same-origin `/api` in production
Production frontend is split from the API. The build must explicitly point to the live API base URL.

### 5. Custom domain vs origin confusion
For production checks, prefer verifying both:
- custom domain: `https://api.testonlandscape.online`
- Render origin: `https://teston-api.onrender.com`

### 6. Deployment verification rule
If a newly added API route returns framework/auth JSON instead of a static HTML 404 page, that is evidence the backend deployment includes the route.

## 6. Production seed credentials that were validated

Seed data comes from `scripts/src/seed-base.ts`.
Validated seeded accounts include:
- `admin@teston.com`
- `hr@teston.com`
- `manager@teston.com`
- `worker1@teston.com`
- `driver1@teston.com`

Do not store plaintext passwords in docs or memory.
If credentials are needed again, retrieve them from the seed source or rotate/reseed appropriately.

## 7. Recovery checklist for future agents

1. Read this file before compiling or deploying.
2. Confirm production targets:
   - Pages project = `teston-hr-app`
   - Render service id = `srv-d73d7dp5pdvs738it780`
   - Database = Neon Postgres
3. Verify API health first:
   - `https://api.testonlandscape.online/api/healthz`
4. Confirm API env vars on Render:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `PORT`
   - `NODE_ENV`
5. Rebuild frontend with:
   - `VITE_API_BASE_URL=https://api.testonlandscape.online`
6. Deploy Pages from:
   - `artifacts/hr-app/dist/public`
7. Re-run live checks:
   - frontend root 200
   - `/dashboard` works
   - API health 200
   - login works
   - `auth/me` works
   - one authenticated workflow route works
8. Re-check known risk areas:
   - object storage / medical certificate file access
   - custom domain propagation
   - split-origin assumptions

## 8. Known follow-up risks

- Object storage remains a production risk area because backend object storage behavior is still tied to `artifacts/api-server/src/lib/objectStorage.ts`.
- Full browser QA was not completed end-to-end in-session; live reachability and authenticated API checks were the confirmed validations.
- If Cloudflare Pages domain validation stalls again, DNS/proxy state may need to be reviewed.

## 9. File references for future troubleshooting

- `artifacts/hr-app/wrangler.toml`
- `.github/workflows/ci.yml`
- `artifacts/hr-app/package.json`
- `artifacts/hr-app/src/main.tsx`
- `artifacts/hr-app/src/pages/MedicalCertificates.tsx`
- `artifacts/api-server/src/routes/auth.ts`
- `scripts/src/seed-base.ts`

## 10. Agent instruction

For any future compile, build, deployment, or production login issue:
- read `PRD2.0-deploy.md` first
- verify `VITE_API_BASE_URL`
- verify Pages project name
- verify deploy output directory
- verify API health before changing frontend code
