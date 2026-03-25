# Workspace

## Project: Teston HR System

HR management system for **TESTON LANDSCAPE & CONTRACTOR PTE. LTD.** (51 Tannery Lane, Singapore 347798).

### Features
- JWT-based authentication with role-based access control (admin, hr, worker, driver)
- Employee management (departments, users)
- Attendance tracking with check-in/out
- Leave management (21 annual + 14 medical days per year, Singapore policy)
- Medical certificate upload
- Man-hours and cost reporting
- AI-driven: absence classification, ghost worker detection, productivity scoring
- Automated alerts system

### Demo Accounts
- Admin: admin@teston.com / Admin@123
- HR: hr@teston.com / HR@12345
- Worker: worker1@teston.com / Worker@123, worker2@teston.com / Worker@123
- Driver: driver1@teston.com / Driver@123, driver2@teston.com / Driver@123

### Design
- Green and white corporate theme (Teston Landscape & Contractor)
- Left sidebar navigation, responsive layout

---

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Frontend**: React + Vite (artifact: hr-app)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM bundle)
- **Auth**: JWT (jsonwebtoken + bcryptjs)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server (port 8080)
│   └── hr-app/             # React+Vite frontend (root path /)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
│   └── src/seed.ts         # Database seeder (run: pnpm --filter @workspace/scripts run seed)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Database Schema (7 Tables)

1. **departments** — id, name, description, timestamps
2. **users** — id, employee_id, name, email, password_hash, role, department_id, phone, position, hourly_rate, is_active, has_face_registered, timestamps
3. **attendance_logs** — id, user_id, check_in, check_out, check_in_location, check_out_location, check_in_face_verified, check_out_face_verified, notes, timestamps
4. **leave_applications** — id, user_id, leave_type, start_date, end_date, reason, status, approved_by, timestamps
5. **medical_certificates** — id, user_id, leave_application_id, doctor_name, clinic_name, diagnosis, mc_date, mc_days, file_url, timestamps
6. **alerts** — id, type, severity, title, message, user_id, is_read, resolved_at, timestamps
7. **productivity_scores** — id, user_id, period_start, period_end, attendance_score, punctuality_score, leave_score, overall_score, ai_classification, notes, timestamps

## API Routes

All routes prefixed with `/api`:

- `POST /api/auth/login` — Login with email/password, returns JWT
- `GET /api/auth/me` — Get current user (requires auth)
- `POST /api/auth/logout` — Logout
- `GET/POST /api/users` — List/create users (admin/hr)
- `GET/PUT/DELETE /api/users/:id` — Get/update/delete user
- `GET/POST /api/departments` — List/create departments
- `GET/PUT/DELETE /api/departments/:id`
- `GET/POST /api/attendance` — List attendance / check-in
- `PUT /api/attendance/:id/checkout` — Check out
- `DELETE /api/attendance/:id`
- `GET/POST /api/leaves` — List/create leave applications
- `PUT /api/leaves/:id` — Update leave (approve/reject by HR/admin)
- `GET/POST /api/medical-certificates` — MC management
- `GET/PUT/DELETE /api/medical-certificates/:id`
- `GET/POST /api/alerts` — Alerts management
- `PUT /api/alerts/:id/read` — Mark alert as read
- `GET/POST /api/productivity` — Productivity scores
- `GET /api/productivity/report` — Man-hours & cost report

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — only `.d.ts` files during typecheck; JS bundling by esbuild/vite
- **Project references** — when A depends on B, A's `tsconfig.json` must list B in `references`

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly`

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes in `src/routes/`, auth middleware in `src/lib/auth.ts`.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App: `src/app.ts` — CORS, JSON parsing, routes at `/api`
- Auth: JWT sign/verify, `requireAuth`, `requireRole` middleware
- `pnpm --filter @workspace/api-server run dev` — dev server

### `artifacts/hr-app` (`@workspace/hr-app`)

React + Vite frontend SPA. Green corporate theme.

- Entry: `src/main.tsx`
- Router: wouter (SPA routing)
- Auth: `src/lib/auth.tsx` — AuthProvider, token in localStorage, fetch interceptor
- Pages: Login, Dashboard, Attendance, CheckIn, Leaves, MedicalCertificates, Users, Departments, Alerts, ManHours, Productivity
- UI: shadcn/ui components (`src/components/ui/`)
- Layout: `src/components/layout/DashboardLayout.tsx`

### `lib/db` (`@workspace/db`)

Drizzle ORM with PostgreSQL.

- `src/index.ts` — Pool + Drizzle instance
- `src/schema/index.ts` — barrel re-export of all models
- `drizzle.config.ts` — Drizzle Kit config
- Migrations: `pnpm --filter @workspace/db run push`

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI 3.1 spec (`openapi.yaml`) + Orval config. Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `scripts` (`@workspace/scripts`)

Utility scripts. Run: `pnpm --filter @workspace/scripts run seed`
