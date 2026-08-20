# EduNexa API reference

Base URL: `/api` (development: `http://localhost:5000/api`).

Every endpoint listed here exists in the code. Nothing is aspirational.

---

## Conventions

### Response envelope

Success:

```json
{ "success": true, "message": "Course created", "data": { "course": { "…": "…" } } }
```

List endpoints add pagination alongside `data`:

```json
{
  "success": true,
  "message": "Users retrieved",
  "data": [],
  "pagination": { "page": 1, "limit": 20, "total": 137, "totalPages": 7 }
}
```

Failure:

```json
{ "success": false, "message": "Course not found" }
```

Validation failures add a per-field list:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "field": "email", "message": "Please provide a valid email address" }]
}
```

### Authentication

Send the JWT from login or registration as a bearer token:

```
Authorization: Bearer <token>
```

Tokens are stateless and expire after `JWT_EXPIRES_IN` (default 7 days). Logout
is client-side — the server has no token blacklist, so the client discards it.
A token stops working immediately if the account is deleted or deactivated,
because every request re-loads the user.

### Status codes

| Code | When |
| --- | --- |
| `200` | Read or update succeeded |
| `201` | Resource created (including a quiz submission) |
| `400` | Validation failed, malformed id, or a broken JSON body |
| `401` | No token, or a token that is invalid or expired |
| `403` | Authenticated but not allowed — wrong role, not enrolled, deactivated |
| `404` | Not found, **or** hidden from this caller so ids cannot be probed |
| `409` | Conflict — duplicate email, duplicate enrollment, deleting an attempted quiz |
| `413` | Body larger than `JSON_BODY_LIMIT` |
| `429` | Rate limit exceeded |
| `500` | Unexpected server error (message is generic in production) |
| `503` | Uploads requested while no storage provider is configured |

`404` is deliberately used in place of `403` for another user's certificate and
for a foreign instructor's quiz: confirming that an id exists is itself a leak.

### Pagination and sorting

Every list endpoint accepts `page` (≥ 1, default 1) and `limit` (1–100,
default varies). Values outside those bounds are **rejected with 400** rather
than silently clamped. `sortBy` is a per-endpoint allowlist and `sortOrder` is
`asc` or `desc`; anything else is a 400. `search` is capped at 100 characters
and matched literally — regex metacharacters are escaped, so `(a+)+$` finds
nothing instead of hanging the server.

### Rate limits

| Bucket | Applies to | Default | Keyed by |
| --- | --- | --- | --- |
| `auth` | `POST /auth/login`, `POST /auth/register` | 20 / 15 min | IP **+** submitted email; successful logins are not counted |
| `account` | `PATCH /auth/me/password` | 20 / 15 min | User account; successful changes are not counted |
| `write` | `POST /quizzes/:id/submit` | 300 / 15 min | User account |
| `api` | Everything under `/api` | 1000 / 15 min | IP |

Configurable via `RATE_LIMIT_*` env vars. Responses carry `RateLimit-*` headers.

---

## Authentication

### `POST /auth/register`

Public. Always creates a `student` — a `role` in the body is ignored, so
privilege cannot be self-assigned.

```json
{
  "firstName": "Sam",
  "lastName": "Student",
  "email": "sam@example.com",
  "password": "at-least-8-characters"
}
```

`201` → `{ "data": { "user": SafeUser, "token": "…" } }`.
Errors: `400` invalid input, `409` email already registered, `429` too many attempts.

### `POST /auth/login`

Public. `{ "email": "…", "password": "…" }` → `200` with `{ user, token }`.

Errors: `401 "Invalid credentials"` for both an unknown email and a wrong
password (identical message *and* comparable timing, so accounts cannot be
enumerated); `403` if the account is deactivated; `429` when rate limited.

### `GET /auth/me`

Bearer. Returns the caller's `SafeUser`.

### `POST /auth/logout`

Bearer. Confirms the client should discard the token. Stateless — nothing is
invalidated server-side.

### `PATCH /auth/me`

Bearer. Updates the caller's own profile. There is no id in the path, so it can
only ever modify the caller.

```json
{ "firstName": "Sam", "lastName": "Student", "email": "sam@example.com" }
```

All three fields are optional; at least one is required. `role` and `isActive`
are **not** part of the schema, so posting them changes nothing — a user cannot
promote or reactivate themselves.

`200` → `{ "data": { "user": SafeUser } }`. Errors: `400` invalid or empty body,
`409` the email belongs to another account.

### `PATCH /auth/me/password`

Bearer, rate limited (`auth` tier, keyed by account). Changes the caller's own
password.

```json
{ "currentPassword": "…", "newPassword": "at-least-8-characters" }
```

The current password is required so a stolen token alone cannot lock the real
owner out. The session is **not** invalidated — stateless JWTs have nothing to
revoke, and the caller stays signed in.

`200` → `{ "success": true, "message": "Password changed" }`. Errors: `400` the
new password is too short or matches the current one, `401` the current password
is wrong, `429` too many attempts.

**`SafeUser`** is the only user shape the API ever emits. It has
`id, firstName, lastName, email, role, isActive, createdAt, updatedAt` — never
`password`, which is `select: false` on the model and stripped again on
serialization.

---

## Users — admin only

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/users` | `page`, `limit`, `search` (name or email), `role`, `status`, `sortBy` (`createdAt`\|`firstName`\|`lastName`\|`email`\|`role`), `sortOrder` |
| `GET` | `/users/statistics` | Dashboard counts by role and status |
| `GET` | `/users/recent` | Most recently registered users |
| `GET` | `/users/:id` | One user |
| `POST` | `/users` | Create with **any** role — this is how instructors and admins are provisioned |
| `PUT` | `/users/:id` | Edit name, email, role, status. Never the password |
| `PATCH` | `/users/:id/status` | `{ "isActive": boolean }` |
| `PATCH` | `/users/:id/password` | `{ "password": "…" }` — admin-issued reset; see below |
| `DELETE` | `/users/:id` | Deleting yourself is refused (`400`) |

Every route is `authenticate` + `authorize(admin)`. Students and instructors get
`403`, anonymous callers `401`.

**`PATCH /users/:id/password`** is the recovery path for a locked-out account —
without it a forgotten password could only be fixed in the database. It is
deliberately separate from `PUT /users/:id` so a password is only ever set by a
request that exists to do exactly that, and never as a field riding along with
an ordinary profile edit.

The admin does not need to know the old password. The response contains the
updated `SafeUser` and never the password. Existing tokens for that account keep
working until they expire — the reset restores access rather than evicting
sessions. A deactivated account still cannot log in afterwards.

There is no password-reset email yet, so the new password has to be handed to
the person out of band; the admin UI shows it once and offers a copy button for
that reason.

---

## Courses

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/courses` | optional | `view=catalog` (default, published only) or `view=manage` (admin: all; instructor: own). Filters: `search`, `category`, `level`, `status`, `instructor` |
| `GET` | `/courses/:idOrSlug` | optional | By id **or** slug. Unpublished courses are visible only to an admin or the owning instructor |
| `POST` | `/courses` | admin, instructor | Instructors are auto-assigned as owner; admins must pass `instructor` |
| `PUT` | `/courses/:id` | admin, owner | The slug never changes after creation. Only admins can reassign `instructor` |
| `PATCH` | `/courses/:id/status` | admin, owner | `{ "status": "draft" \| "published" \| "archived" }` |
| `DELETE` | `/courses/:id` | admin, owner | Refused (`409`) while the course still has modules |
| `GET` | `/courses/statistics` | admin, instructor | Admin: platform-wide. Instructor: their own courses |

Create/update body:

```json
{
  "title": "Test-Driven TypeScript",
  "description": "At least 10 characters, at most 5000.",
  "shortDescription": "Optional, ≤ 300 chars.",
  "category": "programming",
  "level": "beginner",
  "duration": 240,
  "instructor": "<userId, admin only>",
  "thumbnail": "https://…",
  "thumbnailPublicId": "…"
}
```

`category` is one of `programming`, `web-development`, `design`, `business`,
`marketing`, `data-science`, `devops`, `other`. `level` is `beginner`,
`intermediate`, or `advanced`.

`thumbnail` must be an **http(s)** URL — a `javascript:` or `data:` URL is a
`400`, because the client renders this value into an `img src`. An empty string
clears it.

---

## Modules

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/courses/:courseId/modules` | optional | In `order`, with lesson counts. Students see published modules and published lesson counts only |
| `POST` | `/courses/:courseId/modules` | admin, owner | `{ title, description? }` — auto-ordered, starts unpublished |
| `PATCH` | `/courses/:courseId/modules/reorder` | admin, owner | `{ "moduleIds": ["…"] }` — must list every module exactly once |
| `GET` | `/modules/:id` | optional | Module details |
| `PUT` | `/modules/:id` | admin, owner | Edit title/description |
| `DELETE` | `/modules/:id` | admin, owner | Refused (`409`) while it contains lessons |
| `PATCH` | `/modules/:id/status` | admin, owner | `{ "isPublished": boolean }` |

---

## Lessons

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/modules/:moduleId/lessons` | optional | In `order` |
| `POST` | `/modules/:moduleId/lessons` | admin, owner | Auto-ordered, starts unpublished |
| `PATCH` | `/modules/:moduleId/lessons/reorder` | admin, owner | `{ "lessonIds": ["…"] }` |
| `GET` | `/lessons/:id` | optional | Full body + course/module context + previous/next ids |
| `PUT` | `/lessons/:id` | admin, owner | Partial update |
| `DELETE` | `/lessons/:id` | admin, owner | Remaining `order` values are compacted |
| `PATCH` | `/lessons/:id/status` | admin, owner | `{ "isPublished": boolean }` |

```json
{
  "title": "Why Types",
  "description": "Optional, ≤ 1000 chars.",
  "type": "text",
  "content": "Up to 50 000 characters (text lessons).",
  "videoUrl": "https://…",
  "fileUrl": "https://…",
  "fileName": "notes.pdf",
  "duration": 12,
  "isPreview": false
}
```

`type` is `video`, `text`, `pdf`, or `document`, and the service enforces the
matching field: video → `videoUrl`, text → `content`, pdf/document → `fileUrl`.
Both URL fields must be **http(s)**; `javascript:` and `data:` are rejected with
`400` because the client renders them into an `href` and an `iframe src`.

**Access:** a non-preview lesson body requires an active *or completed*
enrollment. A non-enrolled student gets `403` and no content. Anything
unpublished — the lesson, its module, or its course — reads as `404` to a
student. Admins and the owning instructor always have access.

---

## Enrollments

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `POST` | `/courses/:courseId/enroll` | student | Published courses only. Re-enrolling reactivates a cancelled record rather than creating a second one; an active enrollment returns `409` |
| `GET` | `/courses/:courseId/enrollment` | student | The caller's own state for one course |
| `GET` | `/courses/:courseId/enrollments` | admin, owner | Enrolled students — `search`, `status`, pagination |
| `GET` | `/enrollments/my-courses` | student | The caller's enrollments |
| `GET` | `/enrollments` | admin | All enrollments — `search`, `course`, `status` |
| `GET` | `/enrollments/statistics` | admin | Total / active / completed / cancelled |
| `GET` | `/enrollments/:id` | owner student, course owner, admin | Details |
| `DELETE` | `/enrollments/:id` | owner student, admin | Soft cancel: `active → cancelled`, record kept |

One enrollment exists per student and course, enforced by a unique index — two
simultaneous enrol requests cannot produce two records.

---

## Progress — student only

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/lessons/:lessonId/complete` | Idempotent |
| `PATCH` | `/lessons/:lessonId/progress` | `{ "isCompleted": boolean }` |
| `GET` | `/lessons/:lessonId/progress` | Own state for one lesson |
| `GET` | `/courses/:courseId/progress` | Derived course progress |
| `GET` | `/progress/my-courses` | Per-course progress plus a dashboard summary |

The student is always taken from the JWT. A `student` or `studentId` in the body
is ignored, so progress cannot be written onto someone else's account.

```text
required items = published lessons + required published quizzes
completed      = completed published lessons + passed required quizzes
progress %     = round(completed / required × 100)      (0 when required = 0)
```

Response `data.progress`:

```json
{
  "courseId": "…",
  "totalLessons": 2,
  "completedLessons": 1,
  "totalRequiredQuizzes": 1,
  "passedRequiredQuizzes": 0,
  "totalRequiredItems": 3,
  "completedRequiredItems": 1,
  "progressPercentage": 33,
  "isCompleted": false,
  "certificateAvailable": false,
  "completedLessonIds": ["…"],
  "passedQuizIds": []
}
```

`progressPercentage`, `completedLessons` and `isCompleted` are **computed on
read** — they are not stored and cannot be set by a client. Content inside an
unpublished module counts on neither side of the fraction.

---

## Quizzes

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/courses/:courseId/quizzes` | admin, owner, enrolled student | Staff see every quiz with the answer key; students see published ones without it |
| `POST` | `/courses/:courseId/quizzes` | admin, owner | Starts unpublished. A `module` must belong to the same course |
| `GET` | `/quizzes/my-quizzes` | student | Every quiz across the caller's accessible courses, with their own attempt summary |
| `GET` | `/quizzes/:id` | admin, owner, enrolled student | Answer key for staff only |
| `PUT` | `/quizzes/:id` | admin, owner | Sending `questions` replaces the whole set |
| `DELETE` | `/quizzes/:id` | admin, owner | Refused (`409`) once the quiz has been attempted |
| `PATCH` | `/quizzes/:id/status` | admin, owner | `{ "isPublished": boolean }` |
| `POST` | `/quizzes/:id/submit` | enrolled student | Scored server-side |
| `GET` | `/quizzes/:id/my-results` | enrolled student | Own attempts, best score, pass state |
| `GET` | `/quizzes/:id/results` | admin, owner | Every attempt + summary, paginated |
| `GET` | `/quiz-attempts` | admin | Platform-wide attempt log — `search`, `quiz`, `passed`, pagination |

Create body:

```json
{
  "title": "Foundations Check",
  "description": "Optional, ≤ 2000 chars.",
  "module": "<moduleId, optional>",
  "passingScore": 70,
  "isRequired": true,
  "questions": [
    {
      "questionText": "TypeScript compiles to which language?",
      "type": "multiple-choice",
      "options": ["JavaScript", "WebAssembly", "Python"],
      "correctAnswer": "JavaScript",
      "points": 10
    },
    {
      "questionText": "Strict mode catches more errors.",
      "type": "true-false",
      "correctAnswer": "true",
      "points": 10
    }
  ]
}
```

1–100 questions. `multiple-choice` needs 2+ distinct options and a
`correctAnswer` among them; `true-false` options are normalized to
`["true", "false"]`. `points` ≥ 1, `passingScore` 0–100.

Submission:

```json
{ "answers": [{ "questionId": "…", "selectedAnswer": "JavaScript" }] }
```

`201` → `{ "data": { "result": { … }, "courseProgress": { … }, "completion": { … } } }`.

Everything about the outcome is derived server-side:

- `score`, `totalPoints`, `percentage` and `passed` in the request body are **ignored**.
- Unanswered questions count as incorrect.
- An unknown question id, a duplicate question id, or a question belonging to a
  different quiz is a `400`, and no attempt is stored.
- Unlimited attempts are allowed and every one is kept; the best attempt decides
  whether the requirement is met, and a later failure never revokes an earlier pass.
- `correctAnswer` never appears in any student-facing response.

---

## Certificates

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/certificates` | student, admin | Students always get their own — a `student` filter is ignored for them. Instructors get `403` |
| `GET` | `/certificates/:id` | owner, admin | `404` for anyone else, including instructors |
| `GET` | `/certificates/:id/download` | owner, admin | `application/pdf`, generated per request |
| `GET` | `/certificates/verify/:code` | **public** | Verification code or certificate number |
| `PATCH` | `/certificates/:id/status` | admin | `{ "status": "active" \| "revoked" }` |
| `GET` | `/courses/:courseId/completion-statistics` | admin, owner | Completions and certificates issued |

Certificates are **never created through the API**. `course-completion.service`
issues one when, and only when, derived progress first reaches 100 %. One exists
per student and course (unique index), so issuing is idempotent under
concurrency. Revoking keeps the record and keeps it visible to its owner.

Public verification returns only what is printed on the certificate:

```json
{
  "success": true,
  "message": "Certificate verified",
  "data": {
    "valid": true,
    "certificateNumber": "LMS-2026-000001",
    "studentName": "Sam Student",
    "courseTitle": "Test-Driven TypeScript",
    "instructorName": "Ivan Instructor",
    "completionDate": "2026-08-14T09:12:44.000Z",
    "issuedAt": "2026-08-14T09:12:44.000Z",
    "status": "active"
  }
}
```

No student id, course id, enrollment id or email is included. An unknown code
returns `200` with exactly `{ "valid": false }` — the same shape whether the code
never existed or was mistyped. A revoked certificate is reported with
`valid: false` and `status: "revoked"`.

---

## Teaching overview

### `GET /teaching/overview`

`admin`, `instructor`. The instructor dashboard aggregate. An instructor gets
the courses they own; an admin gets the whole platform. Students get `403`.

```json
{
  "courses": { "total": 3, "published": 2, "draft": 1, "archived": 0 },
  "students": { "total": 12, "active": 9, "completed": 3, "cancelled": 2 },
  "engagement": {
    "averageProgress": 64,
    "completions": 3,
    "completionRate": 25,
    "certificatesIssued": 3
  },
  "quizzes": { "published": 4, "attempts": 40, "averageScore": 78, "passRate": 70 },
  "courseBreakdown": [
    {
      "courseId": "…",
      "title": "Test-Driven TypeScript",
      "slug": "test-driven-typescript",
      "status": "published",
      "publishedLessons": 8,
      "requiredQuizzes": 2,
      "students": 10,
      "completions": 3,
      "completionRate": 30,
      "averageProgress": 70,
      "certificatesIssued": 3
    }
  ],
  "nudges": [
    {
      "enrollmentId": "…",
      "studentName": "Sam Student",
      "courseId": "…",
      "courseTitle": "Test-Driven TypeScript",
      "progressPercentage": 0,
      "enrolledAt": "2026-07-01T10:00:00.000Z",
      "lastAccessedAt": null
    }
  ]
}
```

How the figures are defined:

- `students.total` counts **distinct people** with an access-granting
  enrollment, so someone in two of your courses counts once. The `active` /
  `completed` / `cancelled` figures count enrollments, not people.
- `averageProgress` uses the same formula as a student's own progress —
  `(completed lessons + passed required quizzes) / required items` — averaged
  over engaged enrollments. Because every student in a course shares the same
  denominator, this is the summed numerators over `requiredItems × students`.
  Cancelled students are excluded, and content in an unpublished module counts
  on neither side.
- `completions` and `completionRate` come from enrollments the completion
  service has marked completed, not from a re-derived percentage.
- `quizzes.averageScore` and `passRate` are over **every attempt**, so repeated
  attempts pull the average down — that is the intent, since a low pass rate is
  the signal worth seeing.
- `nudges` lists at most six still-active students, least advanced first, and
  only those enrolled more than 7 days ago so a fresh sign-up is not mistaken
  for someone stuck. It is empty for courses with nothing to complete.

The whole payload is assembled from a fixed number of aggregations rather than a
per-student walk, and its size does not grow with enrollment count.

### `GET /teaching/students`

`admin`, `instructor`. The student roster — **one row per enrolment**, because
the same person in two of your courses is two different stories. An instructor
sees only their own courses; an admin sees the platform.

Query: `page`, `limit` (1–100, default 20), `search` (name or email),
`course`, `status` (`active` | `completed` | `cancelled`),
`sortBy` (`name` | `progress` | `enrolledAt` | `lastAccessedAt`), `sortOrder`.

```json
{
  "success": true,
  "message": "Students retrieved",
  "data": [
    {
      "enrollmentId": "…",
      "studentId": "…",
      "firstName": "Sam",
      "lastName": "Student",
      "email": "sam@example.com",
      "courseId": "…",
      "courseTitle": "Test-Driven TypeScript",
      "status": "active",
      "progressPercentage": 60,
      "completedLessons": 3,
      "totalLessons": 5,
      "passedRequiredQuizzes": 0,
      "totalRequiredQuizzes": 1,
      "enrolledAt": "2026-07-01T10:00:00.000Z",
      "lastAccessedAt": "2026-08-10T10:00:00.000Z",
      "completedAt": null,
      "certificateIssued": false
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 45, "totalPages": 3 }
}
```

Notes:

- Passing a `course` the caller does not own returns an empty page, not
  somebody else's roster.
- Unlike the dashboard averages, cancelled enrolments **are** listed — an
  instructor needs to see who left. Filter them out with `status=active`.
- `progressPercentage` uses the same formula as everywhere else, and agrees with
  what that student's own `/progress` endpoint reports.
- Enrolments are paginated **first**, then progress is aggregated for just that
  page, so a roster of ten thousand costs the same as a roster of ten.
- `name` and `progress` are derived rather than stored, so those two sorts order
  the returned page; `enrolledAt` and `lastAccessedAt` sort in the database.
- A deleted account still yields a row, named "Deleted user".

---

## Uploads

### `POST /uploads?kind=image|pdf|document`

`admin`, `instructor`. Multipart with the file in the `file` field.

| `kind` | Accepted content | Max |
| --- | --- | --- |
| `image` | JPEG, PNG, WEBP | 5 MB |
| `pdf` | PDF | 20 MB |
| `document` | DOC, DOCX | 20 MB |

`201` → `{ "data": { "url": "…", "publicId": "…", "fileName": "…" } }`.

The declared `Content-Type` is checked *and* the file's own header bytes are
verified against it, so an HTML page or an executable renamed to `.png` is
rejected with `400`. Empty files are rejected. The client-supplied filename is
stripped of directory separators, traversal sequences and control characters
before it reaches storage.

`503` when no Cloudinary credentials are configured — the rest of the app keeps
working.

---

## Health

### `GET /api/health`

Public. `200` → `{ "success": true, "message": "OK" }`.
