# EduNexa — LMS

A Learning Management System by Tulip Tech: courses, modules and lessons;
enrolment and progress tracking; quizzes scored on the server; and verifiable
completion certificates.

**Status:** Phases 1–8 complete. Phase 8 (testing, security and production
readiness) closed out the MVP — see [Security](#security) and
[Deployment](#deployment).

## Stack

- **Client** ([client/](client/)): React 19, TypeScript (strict), Vite, Tailwind CSS v4, shadcn-style UI components, React Router 7 (code-split routes), Axios
- **Server** ([server/](server/)): Node.js, Express 5, TypeScript (strict), MongoDB, Mongoose, JWT, bcrypt, Zod, Helmet, express-rate-limit
- **Storage**: Cloudinary for lesson files and thumbnails (optional — uploads disable cleanly without it)
- **Tests**: Vitest + Supertest + mongodb-memory-server on the server; Vitest + Testing Library on the client (no local MongoDB needed for either)

## Getting started

Prerequisites: Node.js 20+, a MongoDB instance for local development (tests do not need one).

```bash
# Install
npm install                 # root helper scripts (concurrently)
npm --prefix server install
npm --prefix client install

# Configure
#   server/.env  — copy from server/.env.example and fill in values
#   client/.env  — copy from client/.env.example

# Run both apps
npm run dev
# server: http://localhost:5000   client: http://localhost:5173
```

## Project structure

```text
LMS/
├── client/                     React 19 + Vite SPA
│   ├── src/
│   │   ├── components/         UI primitives, layout shell, feature widgets
│   │   ├── context/            AuthContext, ToastContext
│   │   ├── layouts/            Auth / catalog / dashboard shells
│   │   ├── pages/              One folder per role, plus account, help and shared course pages
│   │   ├── routes/             AppRoutes (lazy-loaded), route guards
│   │   ├── services/           Axios client + one module per API resource
│   │   ├── types/              Shared API types
│   │   └── utils/              token, safeUrl, videoEmbed, formatting
│   └── tests/                  Vitest + Testing Library
├── server/                     Express 5 + Mongoose API
│   ├── src/
│   │   ├── config/             env validation, database connection
│   │   ├── controllers/        HTTP in, HTTP out — no business logic
│   │   ├── middleware/         auth, validation, rate limiting, error handler
│   │   ├── models/             Mongoose schemas, indexes, hooks
│   │   ├── routes/             Route tables and role guards
│   │   ├── services/           All business rules live here
│   │   ├── utils/              ApiError, jwt, logger, safeUrl, fileType
│   │   └── validators/         Zod schemas for every body and query
│   └── tests/                  Vitest + Supertest + in-memory MongoDB
└── docs/API.md                 Full API reference
```

The layering rule: **controllers never contain business logic and services never
touch `req`/`res`.** Authorization is decided in services (which own the data)
and enforced again by route middleware, so no single mistake opens a hole.

## Scripts

Run from the repository root:

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs server and client together |
| `npm run verify` | The full gate: typecheck → lint → tests → builds |
| `npm run typecheck` | Type-checks both apps |
| `npm run lint` | Lints both apps |
| `npm test` | Runs both test suites |
| `npm run test:server` | Backend only (in-memory MongoDB, no local Mongo needed) |
| `npm run test:client` | Frontend only |
| `npm run build` | Production build of both apps |
| `npm run seed:admin -- <email> <password> <first> <last>` | Creates the first admin |

## Testing

The backend runs against a real MongoDB via `mongodb-memory-server`, so indexes,
unique constraints and duplicate-key races behave as they do in production.

| Suite | Covers |
| --- | --- |
| `auth`, `rbac` | Registration, login, JWT, role guards |
| `account` | Self-service profile and password change, admin password reset |
| `teaching` | Instructor overview aggregate — scoping and progress arithmetic |
| `roster` | Student roster — scoping, filters, sorting, pagination, progress |
| `help` | Help content accuracy (no invented support channels) and role filtering |
| `users` | Admin CRUD, filters, permissions |
| `courses`, `modules`, `lessons` | Content CRUD, ordering, publish chains, ownership |
| `enrollments` | Enrol, duplicate protection, cancel, re-enrol, access |
| `progress` | Lesson and course progress, completion arithmetic |
| `quizzes` | Quiz CRUD, attempts, scoring, answer-key confidentiality |
| `certificates` | Issuing, PDF content, verification, revocation |
| `uploads` | Upload guards |
| `security` | Token forgery, RBAC, IDOR, injection, hostile queries |
| `hardening` | Security headers, URL schemes, upload sniffing, body limits |
| `journey` | The whole product end to end through HTTP only |

`journey.test.ts` is the one to read first: it drives admin → instructor →
student → certificate → public verification using nothing but the public API,
seeding only the first admin.

## API

Full reference — request bodies, query parameters, responses and error cases —
in [docs/API.md](docs/API.md). Summary:

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | — | Register (always as `student`) |
| POST | `/api/auth/login` | — | Log in, returns user + JWT |
| GET | `/api/auth/me` | Bearer | Current user's safe profile |
| PATCH | `/api/auth/me` | Bearer | Edit your own name and email (never role or status) |
| PATCH | `/api/auth/me/password` | Bearer | Change your own password (current password required) |
| POST | `/api/auth/logout` | Bearer | Stateless logout (client discards token) |
| GET | `/api/users` | admin | List users — `page`, `limit`, `search`, `role`, `status`, `sortBy`, `sortOrder` |
| GET | `/api/users/:id` | admin | User details |
| POST | `/api/users` | admin | Create a user with any role |
| PUT | `/api/users/:id` | admin | Edit profile, role, status (never the password) |
| PATCH | `/api/users/:id/status` | admin | Activate / deactivate |
| PATCH | `/api/users/:id/password` | admin | Reset a user's password — the locked-out recovery path |
| DELETE | `/api/users/:id` | admin | Delete (self-delete blocked) |
| GET | `/api/users/statistics` | admin | Dashboard KPI counts |
| GET | `/api/users/recent` | admin | Recently registered users |
| GET | `/api/courses` | public* | List courses — `view=catalog` (published only, default) or `view=manage` (admin: all, instructor: own); `search`, `category`, `level`, `status`, `instructor`, sorting, pagination |
| GET | `/api/courses/:idOrSlug` | public* | Course details by id or slug (unpublished courses visible only to admin/owner) |
| POST | `/api/courses` | admin, instructor | Create (instructors are auto-assigned; admins must assign an instructor) |
| PUT | `/api/courses/:id` | admin, owner | Edit (slug stays stable; only admins can reassign instructors) |
| PATCH | `/api/courses/:id/status` | admin, owner | draft / published / archived |
| DELETE | `/api/courses/:id` | admin, owner | Admin: any; instructor: own non-published courses |
| GET | `/api/courses/statistics` | admin, instructor | Admin: platform-wide; instructor: own courses |
| GET | `/api/teaching/overview` | admin, instructor | Instructor dashboard aggregate — students, progress, completion, quiz performance, per-course breakdown, students needing a nudge |
| GET | `/api/teaching/students` | admin, instructor | Student roster — one row per enrolment, with search, course/status filters, sorting and pagination |
| GET | `/api/courses/:courseId/modules` | public* | Modules in order (with lesson counts) |
| POST | `/api/courses/:courseId/modules` | admin, owner | Create module (auto-ordered, unpublished) |
| PATCH | `/api/courses/:courseId/modules/reorder` | admin, owner | Reorder all modules by id list |
| GET / PUT / DELETE | `/api/modules/:id` | public* / admin, owner | Module details / edit / delete (blocked while it has lessons) |
| PATCH | `/api/modules/:id/status` | admin, owner | Publish / unpublish module |
| GET | `/api/modules/:moduleId/lessons` | public* | Lessons in order |
| POST | `/api/modules/:moduleId/lessons` | admin, owner | Create lesson (video/text/pdf/document, auto-ordered) |
| PATCH | `/api/modules/:moduleId/lessons/reorder` | admin, owner | Reorder all lessons by id list |
| GET | `/api/lessons/:id` | public* | Full lesson + course/module context + prev/next navigation |
| PUT / DELETE | `/api/lessons/:id` | admin, owner | Edit / delete (remaining orders are compacted) |
| PATCH | `/api/lessons/:id/status` | admin, owner | Publish / unpublish lesson |
| POST | `/api/courses/:courseId/enroll` | student | Enroll (published courses only; reactivates a cancelled enrollment) |
| GET | `/api/courses/:courseId/enrollment` | student | The caller's enrollment state for one course |
| GET | `/api/courses/:courseId/enrollments` | admin, owner | Enrolled students — pagination, search, status filter |
| GET | `/api/enrollments/my-courses` | student | The caller's enrollments — pagination, search, status filter |
| GET | `/api/enrollments` | admin | All enrollments — search, course + status filters |
| GET | `/api/enrollments/statistics` | admin | Total / active / completed / cancelled counts |
| GET | `/api/enrollments/:id` | owner student, course owner, admin | Enrollment details |
| DELETE | `/api/enrollments/:id` | owner student, admin | Cancel (soft: active → cancelled, record kept) |
| POST | `/api/lessons/:lessonId/complete` | student | Mark a lesson complete (idempotent) |
| PATCH | `/api/lessons/:lessonId/progress` | student | Mark complete or incomplete |
| GET | `/api/lessons/:lessonId/progress` | student | Own completion state for a lesson |
| GET | `/api/courses/:courseId/progress` | student | Derived course progress |
| GET | `/api/progress/my-courses` | student | Progress per course + dashboard summary |
| GET | `/api/courses/:courseId/quizzes` | admin, owner, enrolled student | Staff see all; students see published only, without answers |
| POST | `/api/courses/:courseId/quizzes` | admin, owner | Create quiz (starts unpublished) |
| GET | `/api/quizzes/:id` | admin, owner, enrolled student | Quiz detail (answer key for staff only) |
| PUT / DELETE | `/api/quizzes/:id` | admin, owner | Edit / delete (blocked once attempted) |
| PATCH | `/api/quizzes/:id/status` | admin, owner | Publish / unpublish |
| POST | `/api/quizzes/:id/submit` | enrolled student | Submit answers — scored server-side |
| GET | `/api/quizzes/my-quizzes` | student | Every quiz across the caller's courses, with their own attempt summary |
| GET | `/api/quizzes/:id/my-results` | enrolled student | Own attempt history and best score |
| GET | `/api/quizzes/:id/results` | admin, owner | All attempts + summary (paginated) |
| GET | `/api/quiz-attempts` | admin | Platform-wide attempt log (filters + pagination) |
| GET | `/api/certificates` | student, admin | Students see their own; admins see all (search, filters, pagination) |
| GET | `/api/certificates/:id` | owner, admin | Certificate details |
| GET | `/api/certificates/:id/download` | owner, admin | PDF certificate, generated per request |
| GET | `/api/certificates/verify/:code` | **public** | Verification by code or certificate number |
| PATCH | `/api/certificates/:id/status` | admin | Revoke or restore (never deletes) |
| GET | `/api/courses/:courseId/completion-statistics` | admin, owner | Completions and certificates issued |
| GET | `/api/health` | — | Health check |

## Progress and quiz rules

```text
required items = published lessons + required published quizzes
progress       = (completed lessons + passed required quizzes) / required items × 100
```

A course counts as complete only when every published lesson is finished **and**
every required quiz has at least one passing attempt. Content in an unpublished
module is excluded from both sides of the fraction. Quiz scores, percentages and
pass/fail are always recomputed on the server from the stored answer key —
`correctAnswer` is never included in a student-facing response.

## Completion and certificates

`course-completion.service.ts` is the only place a course becomes completed. It
reads the progress above, flips the enrollment `active → completed`, stamps
`completedAt` once, and issues the certificate. A client can never assert
completion, and every value printed on a certificate is read from the database.

Certificates carry a human-readable number (`LMS-2026-000001`) plus an
unguessable 16-character verification code used for the public check. Names are
snapshotted at issue time so a certificate stays historically accurate. One
certificate exists per student and course, enforced by a unique index, so
issuing is idempotent. Revoking keeps the record, keeps it visible to its owner,
and makes public verification report it as invalid. Completing a course never
withdraws access to it.

Protected (non-preview) lesson content requires an **active enrollment**; preview
lessons stay public. Admins and owning instructors always have access.

\* public course endpoints only ever expose published courses to students/anonymous visitors.

All responses use the envelope `{ "success": boolean, "message": string, "data"?: {} }`
(list endpoints add a `pagination` object).

## Seeding the first admin

Self-registration only creates students. Bootstrap an admin with:

```bash
cd server
npm run seed:admin -- admin@example.com your-password FirstName LastName
```

## Roles

`admin`, `instructor`, `student` — enforced by the reusable `authenticate` and
`authorize(...roles)` middleware ([auth.middleware.ts](server/src/middleware/auth.middleware.ts))
and by role-aware protected routes on the client
([ProtectedRoute.tsx](client/src/routes/ProtectedRoute.tsx)).

Self-registration always creates a `student` — a `role` in the register body is
ignored, so privilege cannot be self-assigned. Admins and instructors are
provisioned by an admin through `POST /api/users` (Users screen), or for the very
first admin with `npm run seed:admin`.

## Environment variables

Documented inline in [server/.env.example](server/.env.example) and
[client/.env.example](client/.env.example). Real `.env` files are gitignored and
must never be committed.

**Server** — required: `MONGODB_URI`, `JWT_SECRET`. Everything else has a
working default.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | HTTP port |
| `NODE_ENV` | `development` | `development` \| `production` \| `test` |
| `MONGODB_URI` | — | **Required.** Connection string |
| `JWT_SECRET` | — | **Required.** ≥ 32 chars in production, or startup aborts |
| `JWT_EXPIRES_IN` | `7d` | Access-token lifetime |
| `CLIENT_URL` | `http://localhost:5173` | CORS allowlist; comma-separate several origins |
| `TRUST_PROXY_HOPS` | `0` | Set to `1` behind a TLS-terminating proxy, or rate limiting sees one client |
| `JSON_BODY_LIMIT` | `1mb` | Must stay above the 50 000-character lesson ceiling |
| `RATE_LIMIT_WINDOW_MINUTES` | `15` | Window for all buckets |
| `RATE_LIMIT_AUTH_MAX` | `20` | Login/register attempts per IP + email |
| `RATE_LIMIT_WRITE_MAX` | `300` | Quiz submissions per account |
| `RATE_LIMIT_API_MAX` | `1000` | Whole-API backstop per IP |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | empty | Uploads; leave blank to disable (endpoint answers `503`) |

**Client**

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `/api` | In development Vite proxies `/api` to the server. For a deployed client, set the full API origin |

## Public surfaces

Four things work without a session, on purpose:

| Path | Why it is public |
| --- | --- |
| `/courses`, `/courses/:slug` | The catalogue is how someone decides to sign up. Only published courses appear |
| `/courses/:slug/lessons/:id` | Only lessons the instructor marked as previews; everything else needs an enrolment |
| `/verify/certificate/:code` | An employer checking a certificate has no account. Returns only what is printed on it |
| `/help` | Someone locked out of their account cannot sign in to read how to get a password reset |
| `/` | The landing page: what the product is, a catalogue preview, and a box to check a certificate code |

Everything else requires authentication, and the role rules below.

## Security

What the API guarantees, and where it is enforced:

- **Authentication.** Bearer JWT, verified on every request, with the user
  re-loaded from the database each time — so deleting or deactivating an account
  invalidates its existing tokens immediately. Tampered, unsigned (`alg: none`),
  foreign-signed and expired tokens are all rejected.
- **Passwords.** bcrypt, cost 12, `select: false` on the model and stripped again
  on serialization. Never returned, never logged. An unknown email and a wrong
  password produce the same message *and* comparable timing, so accounts cannot
  be enumerated. Changing your own password requires the current one; an admin
  reset is a separate single-purpose endpoint and is logged as an audit event.
- **Authorization.** `authenticate` + `authorize(...roles)` on routes, plus an
  ownership check inside the service that owns the data. Client-side route guards
  are convenience only — every rule is enforced server-side.
- **Resource ownership.** An id in the URL never grants access. Another student's
  certificate, enrollment or progress is unreachable; another instructor's course
  tree is unreachable. Where confirming existence would itself leak, the answer
  is `404` rather than `403`.
- **Derived state.** Progress, quiz scores and course completion are computed
  from stored data on read. Zod strips unknown keys, so a client that posts
  `progressPercentage`, `score` or `passed` is simply ignored.
- **Input validation.** Every body and query is parsed by a Zod schema before a
  controller sees it. Pagination is bounded, `sortBy` is an allowlist, and search
  text is regex-escaped.
- **Injection.** Operator objects (`{"$ne": null}`) fail schema validation, so the
  classic NoSQL auth bypass never reaches the driver.
- **XSS.** Lesson bodies render as text, never as HTML. Stored URLs are
  restricted to http(s) at the API boundary and re-checked before rendering, so a
  `javascript:` or `data:` URL cannot reach an `href`, `iframe src` or `img src`.
- **Uploads.** Declared MIME type *and* the file's own header bytes must agree;
  filenames are stripped of paths and control characters. Size limits are
  per-kind.
- **Transport.** Helmet security headers with a locked-down CSP, an explicit CORS
  allowlist (never a wildcard), HSTS in production, and a bounded JSON body.
- **Rate limiting.** Tightest on credentials, per-account on quiz submission, with
  a whole-API backstop.
- **Concurrency.** Unique indexes on `student + course` (enrollment),
  `student + lesson` (progress) and `student + course` (certificate) make the
  critical operations idempotent under races — application checks alone are not
  relied on.
- **Errors and logs.** One `{ success, message }` envelope everywhere. Stack
  traces and driver internals never reach a production client. The logger redacts
  passwords, tokens, secrets and answer keys by key name.

Race conditions, IDOR, privilege escalation and injection are all covered by
[server/tests/security.test.ts](server/tests/security.test.ts); the transport and
input protections by
[server/tests/hardening.test.ts](server/tests/hardening.test.ts).

## Deployment

### Backend

```bash
cd server
npm ci
npm run build          # tsc → dist/
npm start              # node dist/server.js
```

Requirements: Node 20+, a MongoDB instance (Atlas or self-hosted).

Before going live, set `NODE_ENV=production` and:

- `JWT_SECRET` — 32+ random characters (`openssl rand -base64 48`)
- `MONGODB_URI` — production cluster
- `CLIENT_URL` — the real browser origin(s), no localhost
- `TRUST_PROXY_HOPS=1` if the host terminates TLS for you

Startup validates all four and **refuses to boot** on a weak secret, a
placeholder value or a localhost `CLIENT_URL`, rather than silently issuing
forgeable tokens.

### Frontend

```bash
cd client
npm ci
npm run build          # → dist/ (static files)
```

Deploy `client/dist` to any static host or CDN. Set `VITE_API_URL` to the API
origin at build time, and add a SPA rewrite so unknown paths serve
`index.html` — the app uses client-side routing, so deep links 404 without it.

Routes are code-split, so a visitor downloads the shell plus only the screens
their role actually opens.

## Phase status

All eight phases are complete:

| Phase | Delivered |
| --- | --- |
| 1 | Foundation, JWT auth, RBAC, auth UI, role dashboards |
| 2 | User management and the admin dashboard |
| 3 | Course management, slugs, role-scoped visibility, catalog |
| 4 | Modules and lessons, ordering, publish chains, uploads |
| 5 | Enrollment, access gating, the student learning page |
| 6 | Lesson and course progress, quizzes, server-side scoring |
| 7 | Course completion, certificates, PDF, public verification, revocation |
| 8 | Security hardening, rate limiting, E2E tests, accessibility, documentation |
