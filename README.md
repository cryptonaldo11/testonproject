# Teston HR Management System

[![CI](https://github.com/<OWNER>/<REPO>/actions/workflows/ci.yml/badge.svg)](https://github.com/<OWNER>/<REPO>/actions/workflows/ci.yml)

HR management system for **TESTON LANDSCAPE & CONTRACTOR PTE. LTD.** (51 Tannery Lane, Singapore 347798).

## CI / PR Status

All pull requests and pushes are validated by the GitHub Actions CI workflow in [.github/workflows/ci.yml](.github/workflows/ci.yml).

CI currently runs:
- dependency install with pnpm
- workspace typecheck
- workspace build
- API integration tests with a PostgreSQL service

Before merging a PR, confirm:
- the **CI check is green**
- any API test changes still pass against the CI PostgreSQL service
- no required environment or schema changes are missing from the PR

> Replace `<OWNER>` and `<REPO>` in the badge URL above with your actual GitHub repository path.

## Features

- JWT-based authentication with role-based access control (admin, hr, worker, driver)
- Employee management (departments, users)
- Attendance tracking with face recognition check-in/out
- Leave management (21 annual + 14 medical days per year, Singapore policy)
- Medical certificate upload
- Man-hours and cost reporting
- AI-driven: absence classification, ghost worker detection, productivity scoring
- Automated alerts system

## Demo Accounts

- Admin: `admin@teston.com` / `Admin@123`
- HR: `hr@teston.com` / `HR@12345`
- Worker: `worker1@teston.com` / `Worker@123`
- Driver: `driver1@teston.com` / `Driver@123`

## Quick Start (Local Development)

### Prerequisites

- Node.js 20+ (or 24+ recommended)
- pnpm 9+
- Docker (recommended for the fastest local Postgres setup)

### Copy-paste local setup

#### 1. Install dependencies
```bash
pnpm install
```

#### 2. Start PostgreSQL with Docker
```bash
docker run --name workforce-ai-insights-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=teston_hr \
  -p 5432:5432 \
  -d postgres:16
```

#### 3. Create your local env file
```bash
cp .env.example .env
```

Then make sure `.env` contains at least:
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/teston_hr
JWT_SECRET=local-dev-secret
PORT=8080
NODE_ENV=development
```

#### 4. Load your env into the current shell

The current scripts expect these variables to already exist in your shell.

```bash
set -a && source .env && set +a
```

#### 5. Push schema and seed demo data
```bash
pnpm db:push
pnpm db:seed
```

#### 6. Start the API server
```bash
set -a && source .env && set +a
pnpm run dev:api
```

#### 7. Start the frontend
Open a second terminal and run:
```bash
set -a && source .env && set +a
pnpm run dev:app
```

#### 8. Open the app
- Frontend: `http://localhost:5173`
- API (via dev proxy): `http://localhost:5173/api/...`
- Direct API base: `http://localhost:8080/api/...`

#### 8. Log in with a demo account
- Admin: `admin@teston.com` / `Admin@123`
- HR: `hr@teston.com` / `HR@12345`
- Worker: `worker1@teston.com` / `Worker@123`
- Driver: `driver1@teston.com` / `Driver@123`

### Notes for local development

- The frontend dev server proxies `/api` to `API_URL` or defaults to `http://localhost:8080`.
- You do **not** need extra frontend env vars for the normal local run path.
- Medical certificate upload / object storage may still require extra environment-specific setup beyond the minimal local flow.

## Deployment Notes

### Runtime expectations

- The **API server** requires:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `PORT` is optional in code and defaults to `8080`
- The **frontend build** is a static artifact generated at:
  - `artifacts/hr-app/dist/public`
- The **API build** artifact is:
  - `artifacts/api-server/dist/index.mjs`
- The current frontend production build expects the API to be reachable on the **same origin** under `/api`.
  - `API_URL` is only used by the Vite development proxy.
  - If frontend and API are deployed on different origins, you need a reverse proxy or equivalent routing setup.

### Object storage note

The current object-storage implementation is still tied to a Replit-sidecar flow in `artifacts/api-server/src/lib/objectStorage.ts`. Generic cloud-storage environment variables in `.env.example` are not sufficient on their own unless that storage implementation is replaced or adapted.

### Medical certificate real-environment validation

Before production use, validate the medical certificate flow end-to-end in the target environment:

1. Log in as a worker or driver.
2. Upload a PDF or image medical certificate.
3. Confirm the upload request succeeds and the record appears in the Medical Certificates page.
4. Open **View Document** and confirm the file streams successfully through `/api/storage/objects/...`.
5. Log in as admin or HR and confirm the same certificate can be reviewed and its verification status updated.
6. Confirm the saved record uses a normalized object path and not a raw third-party storage URL.
7. Confirm one worker cannot open another worker’s certificate URL directly.

If any of those checks fail, review:
- object storage environment setup
- `/api/storage/uploads/request-url`
- `/api/storage/objects/*`
- `PRIVATE_OBJECT_DIR` / related storage configuration

### Fresh server deployment steps

#### 1. Install system requirements
- Node.js 20+
- pnpm 9+
- PostgreSQL 14+

#### 2. Install dependencies
```bash
pnpm install --frozen-lockfile
```

#### 3. Configure environment
Create an environment file or inject these variables in your process manager:
```bash
DATABASE_URL=postgresql://username:password@host:5432/teston_hr
JWT_SECRET=replace-with-a-long-random-secret
PORT=8080
NODE_ENV=production
```

#### 4. Prepare the database
```bash
pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run seed
```

#### 5. Build artifacts
```bash
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/hr-app run build
```

#### 6. Start the API server
```bash
pnpm --filter @workspace/api-server run start
```

#### 7. Serve the frontend
Serve the static files from:
```text
artifacts/hr-app/dist/public
```
using your web server or static hosting layer, and ensure `/api` routes are forwarded to the Node API server.

## Project Structure

```
├── artifacts/
│   ├── api-server/         # Express API server (port 8080)
│   └── hr-app/             # React + Vite frontend
├── lib/
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-spec/           # OpenAPI spec + Orval codegen
│   ├── api-zod/            # Generated Zod schemas
│   ├── db/                 # Drizzle ORM schema + connection
│   └── object-storage-web/ # File upload components
├── scripts/                # Utility scripts (seeding)
└── package.json            # Root workspace configuration
```

## Available Scripts

### Root

- `pnpm install` - Install all dependencies
- `pnpm run build` - Build all packages
- `pnpm run typecheck` - Type-check all packages

### API Server

- `pnpm --filter @workspace/api-server run dev` - Start dev server with hot reload
- `pnpm --filter @workspace/api-server run build` - Build for production
- `pnpm --filter @workspace/api-server run start` - Start production server

### Frontend (hr-app)

- `pnpm --filter @workspace/hr-app run dev` - Start Vite dev server
- `pnpm --filter @workspace/hr-app run build` - Build for production
- `pnpm --filter @workspace/hr-app run serve` - Preview production build

### Database

- `pnpm --filter @workspace/db run push` - Push schema changes to database
- `pnpm --filter @workspace/db run push-force` - Force push schema (destructive)
- `pnpm --filter @workspace/scripts run seed` - Seed database with demo data

### API Codegen

- `pnpm --filter @workspace/api-spec run codegen` - Regenerate API client from OpenAPI spec

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string for API runtime and DB commands |
| `JWT_SECRET` | Yes | Secret key for JWT signing |
| `PORT` | No | API server port; defaults to `8080` in runtime code |
| `NODE_ENV` | No | Environment (`development` / `production`) |
| `LOG_LEVEL` | No | Optional API log level; defaults to `info` |
| `API_URL` | Dev only | Vite dev-server proxy target only; does not change built production API calls |
| `BASE_PATH` | No | Optional Vite build base path; defaults to `/` |

## Stack

- **Monorepo**: pnpm workspaces
- **API**: Express 5 + Drizzle ORM + PostgreSQL
- **Frontend**: React 19 + Vite + Tailwind CSS 4
- **Validation**: Zod
- **API Client**: Orval-generated React Query hooks
- **Auth**: JWT (jsonwebtoken + bcryptjs)

## License

MIT
