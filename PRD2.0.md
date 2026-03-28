# Product Requirements Document (PRD)
## Workforce-AI-Insights → AI-Driven Workforce Operations Platform

> **Implementation Status**: Phase 3 — Sprint A + Sprint B fully implemented & deployed (2026-03-29)
> - ✅ Sprint A: Dashboard AI summary cards for Worker, Manager, Admin/HR
> - ✅ Sprint B: Productivity trend charts (recharts) on Dashboard and Productivity page
> - ✅ UI/UX fixes: SSR-safe sidebar, skeleton loading, toast notifications
> - Phase 2 (Workflows) fully deployed

### Deployment Record (2026-03-29)

**Deployment Record — Phase 2 (2026-03-29)**

| Component | Target | Status |
|-----------|--------|--------|
| **Database schema** | Neon Postgres (`testonHRdb`) | ✅ Live — `reminderSentAt` column, `mc_expiring_soon`/`mc_expired` alert types |
| **API** | Render (`teston-api`) — `deploy` branch | ✅ Live — commit `f997ec7`, dep `dep-d742bgmuk2gs739u3veg` |
| **Frontend** | Cloudflare Pages (`teston-hr-app`) | ✅ Superseded by Sprint A (see below) |

**Phase 2 new endpoints deployed:**
- `POST /api/medical-certificates/check-expiry` — scan for expiring MCs, create alerts (admin/HR)
- `GET/POST /api/attendance-exceptions` — list/create exceptions
- `GET/PATCH /api/attendance-exceptions/:id` — review exceptions (manager/HR)
- `GET/POST /api/face-verification-attempts` — audit log
- `GET /api/face-verification-attempts/user/:userId` — user-scoped attempts
- `GET/PATCH /api/face-verification-attempts/:id` — single attempt / HR review
- `PATCH /api/alerts/:id` — assignment, status transitions, resolution (updated)

**Phase 2 frontend pages updated:**
- Dashboard: workflow queue card (pending MC reviews, open alerts), assigned alerts, quick actions
- Medical Certificates: expiry badges, Expiring Soon/Expired filters, start/end date upload fields
- Attendance: exception submission per log, review queue for managers/HR
- CheckIn: face verification fallback flow, audit history display
- Alerts: assignment dropdown, status lifecycle, resolution notes

---

**Deployment Record — Phase 3 (Sprint A + Sprint B + UI/UX fixes) (2026-03-29)**

| Component | Target | Status |
|-----------|--------|--------|
| **Frontend** | Cloudflare Pages (`teston-hr-app`) | ✅ Live — `www.testonlandscape.online`, build `index-COm9ISIC.js` |
| **API** | Render (`teston-api`) — `deploy` branch | 🔄 GitHub push sent (commit `7db4e39`), auto-deploy in progress |

**Phase 3 Sprint A changes:** AI summary card with role-specific health scores and narrative signals. No backend changes.

**Phase 3 Sprint B changes:** Recharts productivity trend charts on Dashboard and Productivity page.

**UI/UX fix changes:** SSR-safe sidebar, skeleton loading on Dashboard/Leaves/Attendance, toast notifications for all mutations.

## 1. Product Vision

### Vision
Transform Workforce-AI-Insights from a transactional HR record system into an **AI-driven workforce operations cockpit** that helps workers, managers, and HR teams make faster, better, and more compliant decisions.

The future product should feel:
- **Intelligent**: surfaces insights, anomalies, and recommendations automatically
- **Operational**: drives daily decisions, not just historical reporting
- **Actionable**: converts alerts and insights into workflows with ownership and status
- **Trusted**: explains biometric decisions and supports fair exception handling
- **Premium**: polished dashboards, guided setup, and role-aware experiences

### How it differs from a standard attendance/leave platform
A standard attendance platform primarily:
- stores records
- tracks leave balances
- shows basic dashboards
- logs exceptions after the fact

The target platform will:
- detect operational risks early
- recommend actions to managers and HR
- connect attendance, leave, productivity, compliance, and biometric signals
- provide role-specific decision support
- turn passive alerts into managed workflows
- improve adoption with guided onboarding and go-live support

---

## 2. Problem Statement

The current platform works, but it is too basic and admin-heavy for an operations-focused workforce product.

### Current gaps
1. **Dashboard is too basic**
   - Current dashboards present data, but not priorities, anomalies, or decisions.
   - Users must interpret raw information themselves.

2. **Alerts are informational, not actionable**
   - Alerts are not clearly assigned, prioritized, or resolved through workflow.
   - There is limited operational follow-through.

3. **Manager workflows are underdeveloped**
   - Managers/supervisors lack dedicated views for team health, exceptions, coaching needs, and workforce planning.
   - The product feels centered on admin maintenance rather than line management.

4. **Medical certificates are not a full compliance workflow**
   - Upload and review exist, but the platform does not fully support expiration, pending review queues, document completeness, and linkage to attendance/leave implications.

5. **Check-in/out exception handling is weak**
   - Edge cases like missed checkout, failed face match, unavailable camera, and retroactive correction are not first-class workflows.

6. **Facial recognition lacks trust/transparency UX**
   - Users need clarity on why a verification failed, what confidence means, what fallback path exists, and how decisions are audited.

7. **Productivity is reporting, not decision support**
   - Current productivity features show results but do not explain drivers, anomalies, team-level trends, or recommended actions.

8. **Onboarding and adoption experience is weak**
   - Setup and go-live require too much admin knowledge.
   - The product lacks guided onboarding, contextual empty states, and role-based activation.

---

## 3. Goals and Non-Goals

### Goals
1. **Guided onboarding and adoption**
   - Reduce setup friction and improve go-live confidence.

2. **AI-driven dashboards and analytics**
   - Provide role-specific operational summaries, trends, risks, and next actions.

3. **Manager-focused workflows**
   - Make the platform genuinely useful for supervisors managing teams day-to-day.

4. **Productivity intelligence**
   - Turn productivity into a diagnostic and decision-support capability.

5. **Medical certificate compliance workflows**
   - Support review, follow-up, expiry, and compliance monitoring.

6. **Attendance exception workflows**
   - Provide clear operational paths for attendance issues and disputes.

7. **Smart alerts and alert actioning**
   - Generate operationally relevant alerts and support resolution lifecycle management.

8. **Trust and transparency for biometric attendance**
   - Improve fairness, explainability, and fallback handling.

### Non-Goals
1. **No unnecessary rewrite**
   - Reuse working modules and existing flows where possible.

2. **Do not replace working functionality without clear benefit**
   - Existing attendance, leave, auth, and role-based flows should be extended, not discarded by default.

3. **No speculative AI features without business value**
   - Avoid generic “AI chat” or novelty features that do not improve workforce operations.

4. **No premature multi-product expansion**
   - Stay focused on workforce operations, compliance, and operational intelligence.

5. **No major architecture change unless needed**
   - Prefer incremental changes that fit the current monorepo, API, and frontend structure.

---

## 4. Personas

## 4.1 Worker

### Primary jobs to be done
- Check in/out reliably
- View attendance, leave balance, and schedule-related issues
- Upload medical certificates and supporting documents
- Resolve attendance problems quickly
- Understand biometric verification outcomes

### Pain points
- Unclear why face verification failed
- Little guidance when something goes wrong
- Limited sense of what action is needed next
- Weak onboarding and feature discoverability

### Ideal outcomes
- Fast, trusted check-in/out
- Clear status of attendance, leave, and required actions
- Easy exception submission and follow-up
- Confidence that biometric decisions are fair and explainable

---

## 4.2 Manager / Supervisor

### Primary jobs to be done
- Monitor team attendance and reliability
- Identify staffing risks and operational issues early
- Resolve exceptions and approve/correct issues
- Understand team productivity and performance drivers
- Follow up on patterns such as lateness, absenteeism, and overtime

### Pain points
- No strong manager-centric dashboard
- Weak team-level exception and alert handling
- Productivity data lacks actionable context
- Hard to know where intervention is needed

### Ideal outcomes
- A team operations dashboard showing risks, anomalies, and priorities
- Clear queue of actions requiring manager attention
- Insight into workforce health, attendance, and productivity drivers
- Faster resolution of team issues

---

## 4.3 HR / Admin

### Primary jobs to be done
- Configure the platform and onboard workforce data
- Maintain compliance and workforce records
- Monitor attendance and leave policy adherence
- Review medical certificates and escalations
- Oversee alerts, exceptions, and system-wide operational health

### Pain points
- Too many manual administrative steps
- Weak go-live guidance
- Compliance workflows are incomplete
- Alerts create work but not structured resolution
- Limited executive-quality operational view

### Ideal outcomes
- Guided setup and rollout
- Central command view of compliance and workforce risk
- Reliable workflows for attendance, medical certificates, and exceptions
- Better visibility into action ownership and operational outcomes

---

## 5. Feature Requirements

## A. Guided Onboarding and Go-Live

### Requirements
1. **Setup wizard**
   - Guide admins through departments, roles, workers, and core policy setup.
   - Support progressive completion rather than requiring full setup upfront.

2. **Guided face registration rollout**
   - Provide a rollout checklist for biometric registration.
   - Show registration progress by department/team/role.
   - Surface unregistered workers and recommended follow-up.

3. **Empty-state coaching / demo data**
   - Provide contextual empty states explaining what to do next.
   - Offer optional seeded sample/demo views for early evaluation.

4. **Go-live checklist**
   - Track readiness items such as:
     - departments configured
     - workers imported
     - roles assigned
     - face registration started
     - check-in tested
     - alert thresholds reviewed
     - medical certificate workflow enabled

5. **First-run guidance**
   - Tailor onboarding guidance by role:
     - worker
     - manager
     - HR/admin

---

## B. AI-Driven Dashboards

### Worker dashboard
- Today’s attendance status
- Next expected action
- Leave balance and pending requests
- Personal alerts and exceptions
- Face verification status/history summary
- AI summary: “What you need to do today”

### Manager dashboard
- Team attendance status today
- Missing check-ins/check-outs
- Repeated lateness/no-shows
- Team productivity trend
- Open exceptions requiring action
- High-risk workers or teams
- AI summary and recommended next actions

### HR/Admin dashboard
- Workforce health overview
- Open alerts by category and priority
- Compliance queues
- Face registration coverage
- Medical certificate pending review / expiring soon
- Attendance correction backlog
- AI summary with operational recommendations

### Analytics modules
- Daily operations overview
- Weekly trend summary
- Team comparison
- Workforce risk indicators
- Compliance status overview

### AI narrative summary
- Present concise human-readable summaries:
  - “3 workers have repeated lateness this week”
  - “1 department has rising missed check-outs”
  - “Medical certificate reviews are delayed beyond target SLA”

### Recommended next actions
- Generated per role and linked to workflows
- Examples:
  - “Review 4 attendance exceptions”
  - “Follow up on expiring medical certificates”
  - “Complete face registration for 12 workers”
  - “Investigate low productivity trend in Team B”

---

## C. Productivity Intelligence

### Requirements
1. **Trend views**
   - By worker
   - By team
   - By department
   - By month/week/day where applicable

2. **Anomaly detection**
   - Detect unusual drops or spikes in productivity
   - Highlight outliers versus baseline/team average

3. **Low-productivity driver analysis**
   - Correlate productivity with:
     - attendance irregularity
     - lateness
     - missed check-outs
     - leave frequency
     - overtime
     - recent compliance issues

4. **Combined insights**
   - Combine attendance + leave + productivity + alerts into a single operational view.

5. **Recommendations**
   - Suggest follow-up actions such as:
     - schedule review
     - supervisor intervention
     - attendance correction
     - leave/compliance review

---

## D. Medical Certificate Compliance Workflow

> **Status**: ✅ Fully Implemented (2026-03-29)
> - Schema extended with `verifiedBy`, `verifiedAt` for reviewer attribution
> - API automatically stamps reviewer on verification status change
> - Pending review queue supported via `verificationStatus` filter
> - Dashboard card shows pending certificate reviews count for HR
> - Expiry tracking: `reminderSentAt` column prevents duplicate alerts
> - `mc_expiring_soon` and `mc_expired` alert types with `checkMcExpiry` service
> - `POST /medical-certificates/check-expiry` endpoint for cron/scheduled invocation
> - Upload form collects `mcStartDate`/`mcEndDate`; cards display coverage period and expiry badges
> - MC page filter bar: Expiring Soon / Expired filters alongside status filters

### Requirements
1. **Approval/rejection workflow**
   - Add structured review decision states beyond upload.
   - Support notes, reviewer, timestamp, and audit history.

2. **Expiry reminders**
   - Track certificate validity/expiry where applicable.
   - Generate reminders before expiry.

3. **Missing document alerts**
   - Flag missing or overdue supporting documents tied to attendance/leave events.

4. **Linking with leave/attendance**
   - Connect medical certificates to relevant leave records and attendance exceptions.

5. **Operational views**
   - Pending review
   - Expiring soon
   - Missing information
   - Rejected / resubmission needed

6. **Compliance drill-down**
   - Provide worker-level compliance history and document status.

---

## E. Attendance Exception Workflows

> **Status**: ✅ Implemented (2026-03-28)
> - New `attendance_exceptions` table with types: `missed_checkout`, `camera_unavailable`, `face_mismatch`, `manual_correction`, `dispute`
> - Status lifecycle: `open`, `under_review`, `approved`, `rejected`, `escalated`
> - Worker submission endpoint with self-service permissions
> - Manager/HR review endpoints with `exceptions:review` permission
> - Backend permission: `exceptions:review` for managers and HR

### Requirements
1. **Forgot to check out**
   - Detect probable missed checkout
   - Prompt worker confirmation or correction request
   - Route for manager/HR review if needed

2. **Camera unavailable**
   - Provide structured fallback flow
   - Capture reason, timestamp, device context if available

3. **Manual override request**
   - Allow worker or manager to request manual attendance adjustment
   - Capture reason and supporting notes

4. **Retroactive correction**
   - Support correcting past records within policy rules
   - Include approval path and audit trail

5. **Dispute flow for failed face match**
   - Let worker dispute failed verification
   - Show decision path, fallback status, and final resolution

6. **Exception queue**
   - Manager and HR queues by priority, team, type, age, and status

---

## F. Facial Recognition Trust and Transparency

> **Status**: ✅ Fully Implemented (2026-03-29)
> - New `face_verification_attempts` table with audit logging
> - Failure reasons: `no_face`, `low_lighting`, `mismatch`, `camera_unavailable`, `quality_insufficient`
> - Outcome tracking: `success`, `failure`, `fallback_used`
> - API endpoints for querying and logging attempts
> - Frontend UX: fallback review dialog, audit history display, human-readable failure labels

### Requirements
1. **Clear failure reasons**
   - Indicate likely cause, such as:
     - no face detected
     - low lighting
     - face mismatch
     - camera unavailable
     - image quality insufficient

2. **Confidence bands**
   - Present simple confidence ranges in understandable language
   - Avoid overly technical labels for most users

3. **Fallback flow**
   - Show what happens when verification fails
   - Explain next steps clearly

4. **Face verification audit history**
   - Log outcome, timestamp, reason, fallback action, and reviewer if manually resolved

5. **Privacy messaging**
   - Explain what biometric data is used for
   - Explain who can access what
   - Explain retention and purpose at a high level

6. **Trust UX**
   - Avoid “black box” interactions
   - Include reassurance and fairness messaging

---

## G. Smart Alerts

### Auto-generated alerts should include
- repeated lateness
- no-shows
- excessive overtime
- unusual leave patterns
- expiring medical certificates
- missing medical documents
- failed face verification spikes
- repeated missed check-outs
- productivity anomalies
- unregistered face verification for required users

### Requirements
- Alert generation should be configurable where practical
- Thresholds should support admin control for selected categories
- Alerts should avoid duplicative noise
- Alerts should be grouped or deduplicated when repeated

---

## H. Actionable Alerts

> **Status**: ✅ Implemented (2026-03-28)
> - Alert schema extended with `assignedTo`, `assignedBy`, `assignedAt`, `resolutionNotes`, `dismissedBy`, `dismissedAt`
> - Status lifecycle: `new`, `acknowledged`, `in_progress`, `resolved`, `dismissed`
> - Backend permissions: `alerts:resolve`, `alerts:assign`
> - API supports assignment, status transitions, and resolution notes

### Requirements
Each alert should support:
- owner
- status
- priority
- due date
- assignment
- category
- linked worker/team/record
- comments/notes
- resolution outcome

### Drill-down behavior
- From an alert, users should navigate directly to:
  - worker profile
  - attendance record
  - leave request
  - certificate
  - verification attempt
  - productivity insight detail

### Status lifecycle
Suggested statuses:
- new
- acknowledged
- in progress
- resolved
- dismissed

---

## 6. Functional Requirements

## 6.1 Onboarding Module
- Admin can complete guided setup steps in sequence
- System tracks onboarding completion state
- Empty-state guidance is role-aware
- Sample/demo data mode is supported in non-production environments

## 6.2 Dashboard Module
- Role-based dashboard content is served per authenticated user role
- Dashboards show summaries, trends, anomalies, and actions
- Dashboards support filtering by date/team/department where relevant
- Dashboard cards link to deeper workflows

## 6.3 Alerts Module

> **Status**: ✅ Fully Implemented (2026-03-29)

- System computes alerts from operational rules and analytics
- Alerts are assignable and trackable
- Alerts can be filtered, sorted, and resolved
- Users only see alerts allowed by their role/scope

## 6.4 Attendance Module

> **Status**: ✅ Fully Implemented (2026-03-29)

- Attendance exceptions are first-class records
- Manual corrections support review and audit trail
- Workers can raise disputes or fallback requests
- Managers/HR can review, approve, or reject corrections

## 6.5 Facial Verification Module

> **Status**: ✅ Fully Implemented (2026-03-29)

- Verification attempts capture detailed outcome metadata
- Failure reasons are available to the user in clear language
- Confidence bands are available in the UI
- Fallback and dispute flows are supported
- Audit history is retained

## 6.6 Productivity Module
- Productivity reports support team and worker trends
- System computes anomaly indicators
- System generates explanatory drivers where available
- Recommendations are generated from combined signals

## 6.7 Medical Certificate Module

> **Status**: ✅ Fully Implemented (2026-03-29)

- Certificates support review states and audit history
- Expiry and missing-document logic can generate alerts
- Certificates can link to related leave/attendance records
- Pending review and expiring soon queues are available

## 6.8 Permissions / Roles
- Worker sees personal workflows and status
- Manager sees direct team insights and actions
- HR/Admin sees cross-workforce operations and configuration
- All role access must be enforced in UI and API

---

## 7. UX Requirements

### Role-aware navigation
- Navigation should reflect user role and responsibilities
- Avoid showing admin-heavy navigation to workers
- Add dedicated manager navigation and dashboard entry points

### Premium analytics dashboard behavior
- Clear hierarchy: summary → insight → action
- Trend cards, status indicators, and drill-down panels
- AI summaries should be concise, scannable, and trustworthy

### Empty states
- Every core module should explain:
  - why the state is empty
  - what to do next
  - what good setup looks like

### Loading and error states
- All dashboards and workflows should have meaningful loading skeletons
- Error states should include recovery guidance, not generic failures

### Trust messaging for biometrics
- Explain failures clearly
- Explain fallback options
- Explain privacy and auditability

### Actionable workflows instead of passive reporting
- Analytics and alerts should lead to next steps
- Avoid dead-end reports without actions

---

## 8. Data and Analytics Requirements

### Metrics needed
- attendance rate
- punctuality rate
- missed check-in/check-out rate
- no-show rate
- overtime hours/frequency
- leave utilization and patterns
- medical certificate pending/review/expiry counts
- face registration coverage
- face verification success/failure rate
- manual override volume
- exception resolution time
- productivity score and trend
- alert creation/resolution volume

### Aggregations needed
- by worker
- by team
- by department
- by role
- by day/week/month
- by site/location if applicable in future

### Trend views needed
- attendance trend over time
- lateness trend
- no-show trend
- productivity trend
- overtime trend
- compliance review backlog trend
- biometric verification success trend

### Alerts/anomalies to compute
- repeated lateness
- unusual absenteeism
- missed checkout spikes
- overtime outliers
- leave pattern anomalies
- productivity dips and outliers
- repeated biometric failures
- medical certificate review backlog or expiry risk

### Recommendation summaries to generate
- operational summary by role
- workforce risk summary
- team-level intervention suggestions
- compliance follow-up summary
- likely root-cause suggestions for productivity decline

---

## 9. Technical Implications

### Database schema
Expected additions/changes:
- alert ownership/status/priority fields
- alert categories and due dates
- exception workflow records
- attendance correction/dispute records
- biometric verification outcome details and audit trail
- medical certificate review states, reviewer metadata, expiry fields, related record links
- onboarding progress / go-live checklist state
- dashboard summary materialization or aggregation support if needed
- recommendation/anomaly result storage or caching if required

### Backend APIs
Expected additions:
- manager dashboard endpoints
- HR/admin analytics endpoints
- alert actioning endpoints
- attendance exception workflow endpoints
- biometric audit/detail endpoints
- medical certificate compliance workflow endpoints
- onboarding/go-live endpoints
- productivity insight/recommendation endpoints

### OpenAPI spec
- Must be updated for all new workflow and analytics endpoints
- Must reflect new enums/statuses and relationship models

### Generated API clients
- Regenerate React Query hooks and typed schemas after spec updates
- Ensure new role-based flows are supported in generated clients

### Frontend flows
- New dashboards per role
- New alert detail/action views
- New attendance exception flows
- Expanded certificate review flows
- New onboarding/go-live experience
- Improved biometric messaging and audit views

### Dashboards
- Likely requires new aggregation services and optimized summary endpoints
- Avoid heavy client-only computation for operational dashboards

### Tests
- Add integration tests for alert generation and actioning
- Add workflow tests for exception handling
- Add auth/role tests for manager-only and HR-only access
- Add biometric fallback/dispute workflow tests
- Add medical certificate compliance tests
- Add dashboard summary contract tests

### Seed data
- Seed realistic workers, managers, departments, alerts, anomalies, exceptions, and compliance states
- Seed sample patterns for demos and empty-state previews

### Deployment readiness
- Ensure analytics and alert computation are production-safe
- Validate performance of dashboard endpoints
- Validate migration safety for new workflow tables/fields
- Validate monitoring for alert generation jobs and summary computations

---

## 10. Success Metrics

### Adoption and onboarding
- onboarding completion rate
- admin go-live completion rate
- time-to-first-successful setup
- face registration rollout completion rate

### Engagement
- manager weekly active usage
- HR/admin weekly active usage
- worker monthly active usage for self-service actions

### Operational effectiveness
- alert resolution rate
- average alert time to acknowledgment
- average alert time to resolution
- reduction in manual attendance corrections outside system
- reduction in unresolved attendance exceptions

### Compliance
- medical certificate review turnaround time
- expiring certificate follow-up rate
- percentage of required documents reviewed within SLA

### Attendance and biometric performance
- check-in success rate
- failed face verification rate
- exception resolution time
- fallback flow completion rate

### Intelligence quality
- percentage of recommended actions acted upon
- manager satisfaction with dashboard usefulness
- reduction in time spent identifying workforce issues manually

---

## 11. Risks and Constraints

### Risks
1. **Biometric trust/compliance concerns**
   - Users may distrust facial verification without clear transparency and controls.

2. **False positives / false negatives in face verification**
   - Incorrect outcomes can create operational and employee relations issues.

3. **Dashboard complexity**
   - Risk of clutter if too much intelligence is shown at once.

4. **Alert fatigue**
   - Too many low-value alerts can reduce trust and engagement.

5. **Role/permission complexity**
   - Introducing a stronger manager layer increases access-control complexity.

6. **Migration risk**
   - New workflows and states may complicate existing data and user behavior.

7. **Analytics correctness risk**
   - Poor anomaly detection or weak recommendations can reduce confidence.

### Constraints
- Must build on existing working platform
- Should minimize disruption to current production flows
- Must preserve role-based access integrity
- Must remain practical for phased delivery

---

## 12. Release Phases

## Phase 1: Foundation
Focus:
- role-aware navigation
- onboarding/go-live wizard
- empty states
- improved dashboard structure
- data model foundations for alerts, exceptions, and compliance workflows

Deliverables:
- onboarding checklist
- manager persona support
- dashboard scaffolding
- core schema/API changes

## Phase 2: Workflows
**Status**: ✅ Completed (2026-03-29)

Focus:
- attendance exception workflows
- actionable alerts
- medical certificate compliance queue
- biometric transparency UX
- assignment and ownership model

Deliverables:
- ✅ alert actioning lifecycle (backend + frontend)
- ✅ exception/dispute handling (backend + frontend)
- ✅ certificate review enhancements (backend + frontend)
- ✅ audit history views (backend + frontend)
- ✅ integration tests (alerts workflow, attendance exceptions, face verification)

## Phase 3: Intelligence
Focus:
- AI narrative summaries
- productivity intelligence
- anomaly detection
- recommendation engine
- trend and combined-signal insights

### Sprint A: Dashboard AI Summaries ✅ (2026-03-29)

Role-specific AI summary cards on the dashboard. Pure frontend computation using existing TanStack Query hooks — no new API endpoints or DB migrations.

**Worker dashboard:** real attendance rate, leave balance, hours worked this month, face verification status, pending leaves, active alerts, health status badge.

**Manager dashboard:** team today attendance (checked in / absent / late), open exceptions, active alerts with critical flagging, pending leave count, overall health score.

**Admin/HR dashboard:** workforce health (open/overdue/critical alerts), queues (pending MCs/leaves/exceptions), MC expiring soon count, productivity outliers (score < 60), top 3 priority items by severity.

**Files:** `artifacts/hr-app/src/lib/aiSummaryService.ts`, `artifacts/hr-app/src/pages/Dashboard.tsx`

### Sprint B: Productivity Intelligence ✅ (2026-03-29)

Recharts-powered productivity trend charts on Dashboard and Productivity page. Uses existing `useListProductivityScores` hook data.

**Dashboard charts (inserted before AI Summary Card per role):**
- Worker: 6-month BarChart of own scores, color-coded (green ≥80, amber 60-79, red <60)
- Manager: team bar chart with individual worker scores + team average line overlay
- Admin/HR: score distribution (0-59/60-79/80-100 buckets) + top 5 / bottom 5 performers ranked lists

**Productivity.tsx enhancements:**
- 12-month trend LineChart (overall score, attendance rate, punctuality rate)
- Team score BarChart for operational roles

**Files:** `artifacts/hr-app/src/pages/Dashboard.tsx`, `artifacts/hr-app/src/pages/Productivity.tsx`

### UI/UX Quality Fixes ✅ (2026-03-29)

**SSR fix:** `DashboardLayout.tsx` — `window.innerWidth` now guarded with `mounted` state + `useEffect`, preventing server-side crash.

**Skeleton loading:** Skeleton shimmer rows added to Dashboard stat cards, Leaves table, and Attendance table using existing `@/components/ui/skeleton`.

**Toast notifications:** Mutation feedback in Leaves.tsx, Attendance.tsx, and Alerts.tsx replaced with Sonner toast notifications (using existing `@/hooks/use-toast`). Inline feedback divs removed from Leaves.

**Files:** `DashboardLayout.tsx`, `Dashboard.tsx`, `Leaves.tsx`, `Attendance.tsx`, `Alerts.tsx`

## Phase 4: Polish / Release
Focus:
- UX refinement
- performance tuning
- analytics quality tuning
- alert threshold calibration
- rollout materials and readiness

Deliverables:
- polished dashboards
- tuned alerting and summaries
- final QA, test coverage, and deployment readiness
- launch playbook

---

## Recommended Delivery Principles
- Start with **actionable workflows**, not abstract AI
- Make **manager value** visible early
- Use AI for **summarization, anomaly detection, and prioritization**
- Preserve working flows and layer intelligence on top
- Optimize every major screen for: **status, insight, action**

---

## Final Product Definition
The upgraded platform should function as a **workforce operations cockpit**:
- Workers use it to complete trusted daily actions
- Managers use it to monitor team health and resolve issues
- HR/Admin use it to control compliance, operations, and workforce risk
- AI elevates the product from recordkeeping to decision support without replacing human judgment
