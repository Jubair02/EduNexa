# EduNexa — LMS

A Learning Management System by Tulip Tech.
**Completed phases:** 1 (Foundation & Authentication), 2 (User Management & Admin Dashboard), 3 (Course Management), 4 (Modules & Lessons), 5 (Enrollment & Student Learning), 6 (Progress Tracking & Quizzes), 7 (Certificates & Course Completion).

## Stack

- **Client** ([client/](client/)): React 19, TypeScript (strict), Vite, Tailwind CSS v4, shadcn-style UI components, React Router 7, Axios
- **Server** ([server/](server/)): Node.js, Express 5, TypeScript (strict), MongoDB, Mongoose, JWT, bcrypt, Zod
- **Tests**: Vitest + Supertest + mongodb-memory-server (no local MongoDB needed for tests)

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

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs server and client together |
| `npm run build` | Builds server (`tsc`) and client (`tsc && vite build`) |
| `npm run test` | Runs the backend test suite (in-memory MongoDB) |
| `npm run typecheck` | Type-checks both apps |

## API

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | — | Register (always as `student`) |
| POST | `/api/auth/login` | — | Log in, returns user + JWT |
| GET | `/api/auth/me` | Bearer | Current user's safe profile |
| POST | `/api/auth/logout` | Bearer | Stateless logout (client discards token) |
| GET | `/api/users` | admin | List users — `page`, `limit`, `search`, `role`, `status`, `sortBy`, `sortOrder` |
| GET | `/api/users/:id` | admin | User details |
| POST | `/api/users` | admin | Create a user with any role |
| PUT | `/api/users/:id` | admin | Edit profile, role, status (never the password) |
| PATCH | `/api/users/:id/status` | admin | Activate / deactivate |
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

Self-registration always creates a `student`; admins and instructors are
provisioned directly in the database (an admin UI arrives in a later phase).

## Environment variables

See [server/.env.example](server/.env.example) and [client/.env.example](client/.env.example).
Never commit real `.env` files — they are gitignored.

## Phase status

Phase 1 only: project foundation, User model, JWT auth, RBAC, auth UI, role
dashboards, tests. Course management, enrollment, quizzes, and the rest arrive
in later phases.
