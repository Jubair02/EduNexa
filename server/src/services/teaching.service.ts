/**
 * The instructor dashboard aggregate.
 *
 * Everything an instructor needs about the courses they teach, assembled from
 * a fixed number of aggregations rather than a walk over enrollments. The
 * expensive question is "how far along is everyone", and it is answered the
 * same way `progress.service` answers it for one student:
 *
 *   required items = published lessons + required published quizzes
 *   progress       = (completed lessons + passed required quizzes) / required items
 *
 * Because every student in a course faces the same `required items`, the mean
 * progress for a course is just the summed numerators over
 * `requiredItems × studentCount` — so course averages need no per-student rows.
 * Per-student rows are still grouped, but only to build the short "needs a
 * nudge" list, and the payload stays a fixed size either way.
 */
import { FilterQuery, Types } from "mongoose";
import { Certificate, CertificateStatus } from "../models/certificate.model";
import { Course, CourseStatus, ICourse } from "../models/course.model";
import { Enrollment, EnrollmentStatus, IEnrollment } from "../models/enrollment.model";
import { Lesson } from "../models/lesson.model";
import { LessonProgress } from "../models/lesson-progress.model";
import { Module } from "../models/module.model";
import { Quiz } from "../models/quiz.model";
import { QuizAttempt } from "../models/quiz-attempt.model";
import { User, UserRole } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { escapeRegex } from "../utils/escapeRegex";
import { TeachingStudentsQuery } from "../validators/enrollments.validators";
import { Viewer } from "./courses.service";
import { PaginationMeta } from "./users.service";

/** Enrollment states that still grant access — cancelled students are excluded. */
const ENGAGED = [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED];

/**
 * A student is only "stuck" once they have had a little time. Enrollments
 * younger than this are excluded from the nudge list so a fresh sign-up does
 * not look like a problem.
 */
const NUDGE_GRACE_DAYS = 7;

export interface TeachingCourseRow {
  courseId: string;
  title: string;
  slug: string;
  status: CourseStatus;
  publishedLessons: number;
  requiredQuizzes: number;
  /** Active + completed. Cancelled enrollments are not counted. */
  students: number;
  completions: number;
  completionRate: number;
  averageProgress: number;
  certificatesIssued: number;
}

export interface NudgeRow {
  enrollmentId: string;
  studentName: string;
  courseId: string;
  courseTitle: string;
  progressPercentage: number;
  enrolledAt: Date;
  lastAccessedAt?: Date;
}

export interface TeachingOverview {
  courses: { total: number; published: number; draft: number; archived: number };
  students: {
    /** Distinct people, so someone in two of your courses counts once. */
    total: number;
    active: number;
    completed: number;
    cancelled: number;
  };
  engagement: {
    /** Mean progress across engaged enrollments, weighted by enrollment. */
    averageProgress: number;
    completions: number;
    completionRate: number;
    certificatesIssued: number;
  };
  quizzes: {
    published: number;
    attempts: number;
    /** Mean percentage across every attempt; null when nothing was attempted. */
    averageScore: number | null;
    /** Share of attempts that passed; null when nothing was attempted. */
    passRate: number | null;
  };
  courseBreakdown: TeachingCourseRow[];
  nudges: NudgeRow[];
}

const percentage = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

/** Key for the per-(course, student) maps the aggregations return. */
const pairKey = (course: unknown, student: unknown): string =>
  `${String(course)}:${String(student)}`;

/**
 * Instructors see the courses they own; admins see the whole platform. Any
 * other role is refused — this is a teaching view, not a student one.
 */
export const getTeachingOverview = async (viewer: Viewer): Promise<TeachingOverview> => {
  if (viewer.role === UserRole.STUDENT) {
    throw ApiError.forbidden("Only instructors and admins have a teaching overview.");
  }

  const courseFilter =
    viewer.role === UserRole.INSTRUCTOR ? { instructor: viewer.id } : {};
  const courses = await Course.find(courseFilter).select("title slug status");

  const empty: TeachingOverview = {
    courses: { total: 0, published: 0, draft: 0, archived: 0 },
    students: { total: 0, active: 0, completed: 0, cancelled: 0 },
    engagement: {
      averageProgress: 0,
      completions: 0,
      completionRate: 0,
      certificatesIssued: 0,
    },
    quizzes: { published: 0, attempts: 0, averageScore: null, passRate: null },
    courseBreakdown: [],
    nudges: [],
  };
  if (courses.length === 0) return empty;

  const courseIds = courses.map((course) => course._id);
  const courseCounts = {
    total: courses.length,
    published: courses.filter((c) => c.status === CourseStatus.PUBLISHED).length,
    draft: courses.filter((c) => c.status === CourseStatus.DRAFT).length,
    archived: courses.filter((c) => c.status === CourseStatus.ARCHIVED).length,
  };

  // Only published modules are in scope, exactly as for a student's progress.
  const publishedModules = await Module.find({
    course: { $in: courseIds },
    isPublished: true,
  }).select("_id");
  const publishedModuleIds = publishedModules.map((module) => module._id);

  const [gradedLessons, requiredQuizzes, publishedQuizCount] = await Promise.all([
    Lesson.find({
      course: { $in: courseIds },
      module: { $in: publishedModuleIds },
      isPublished: true,
    }).select("_id course"),
    Quiz.find({
      course: { $in: courseIds },
      isPublished: true,
      isRequired: true,
      $or: [
        { module: { $in: publishedModuleIds } },
        { module: { $exists: false } },
        { module: null },
      ],
    }).select("_id course"),
    Quiz.countDocuments({ course: { $in: courseIds }, isPublished: true }),
  ]);

  const gradedLessonIds = gradedLessons.map((lesson) => lesson._id);
  const requiredQuizIds = requiredQuizzes.map((quiz) => quiz._id);

  /** requiredItems per course — the denominator of every progress figure. */
  const requiredItems = new Map<string, { lessons: number; quizzes: number }>();
  for (const course of courses) {
    requiredItems.set(course._id.toString(), { lessons: 0, quizzes: 0 });
  }
  for (const lesson of gradedLessons) {
    const row = requiredItems.get(lesson.course.toString());
    if (row) row.lessons += 1;
  }
  for (const quiz of requiredQuizzes) {
    const row = requiredItems.get(quiz.course.toString());
    if (row) row.quizzes += 1;
  }

  const [
    enrollmentRows,
    distinctStudents,
    completedLessonRows,
    passedQuizRows,
    attemptStats,
    certificateRows,
  ] = await Promise.all([
    // Enrollment counts per course and status.
    Enrollment.aggregate<{ _id: { course: Types.ObjectId; status: string }; n: number }>([
      { $match: { course: { $in: courseIds } } },
      { $group: { _id: { course: "$course", status: "$status" }, n: { $sum: 1 } } },
    ]),
    // Headcount of distinct people, so a student in two courses counts once.
    Enrollment.distinct("student", {
      course: { $in: courseIds },
      status: { $in: ENGAGED },
    }),
    // Completed lessons per (course, student), restricted to lessons that are
    // still published and to students who still hold access.
    LessonProgress.aggregate<{
      _id: { course: Types.ObjectId; student: Types.ObjectId };
      n: number;
    }>([
      {
        $match: {
          course: { $in: courseIds },
          lesson: { $in: gradedLessonIds },
          isCompleted: true,
        },
      },
      { $group: { _id: { course: "$course", student: "$student" }, n: { $sum: 1 } } },
    ]),
    // Distinct required quizzes passed per (course, student). A later failure
    // never withdraws an earlier pass, so $addToSet over passed attempts is the
    // right shape.
    QuizAttempt.aggregate<{
      _id: { course: Types.ObjectId; student: Types.ObjectId };
      n: number;
    }>([
      {
        $match: {
          course: { $in: courseIds },
          quiz: { $in: requiredQuizIds },
          passed: true,
        },
      },
      {
        $group: {
          _id: { course: "$course", student: "$student" },
          quizzes: { $addToSet: "$quiz" },
        },
      },
      { $project: { n: { $size: "$quizzes" } } },
    ]),
    // Quiz performance across every attempt on these courses.
    QuizAttempt.aggregate<{ _id: null; attempts: number; avg: number; passed: number }>([
      { $match: { course: { $in: courseIds } } },
      {
        $group: {
          _id: null,
          attempts: { $sum: 1 },
          avg: { $avg: "$percentage" },
          passed: { $sum: { $cond: ["$passed", 1, 0] } },
        },
      },
    ]),
    Certificate.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { course: { $in: courseIds }, status: CertificateStatus.ACTIVE } },
      { $group: { _id: "$course", n: { $sum: 1 } } },
    ]),
  ]);

  const completedLessonsByPair = new Map(
    completedLessonRows.map((row) => [pairKey(row._id.course, row._id.student), row.n])
  );
  const passedQuizzesByPair = new Map(
    passedQuizRows.map((row) => [pairKey(row._id.course, row._id.student), row.n])
  );
  const certificatesByCourse = new Map(
    certificateRows.map((row) => [row._id.toString(), row.n])
  );

  /** Enrollment counts per course, split by status. */
  const enrollmentsByCourse = new Map<
    string,
    { active: number; completed: number; cancelled: number }
  >();
  for (const course of courses) {
    enrollmentsByCourse.set(course._id.toString(), {
      active: 0,
      completed: 0,
      cancelled: 0,
    });
  }
  for (const row of enrollmentRows) {
    const bucket = enrollmentsByCourse.get(row._id.course.toString());
    if (!bucket) continue;
    if (row._id.status === EnrollmentStatus.ACTIVE) bucket.active += row.n;
    else if (row._id.status === EnrollmentStatus.COMPLETED) bucket.completed += row.n;
    else if (row._id.status === EnrollmentStatus.CANCELLED) bucket.cancelled += row.n;
  }

  // Numerators are summed over the pair maps, but only for students who still
  // hold an engaged enrollment — progress rows outlive a cancellation.
  const engagedPairs = await Enrollment.find({
    course: { $in: courseIds },
    status: { $in: ENGAGED },
  }).select("course student");

  const completedUnitsByCourse = new Map<string, number>();
  for (const enrollment of engagedPairs) {
    const courseId = enrollment.course.toString();
    const key = pairKey(enrollment.course, enrollment.student);
    const done =
      (completedLessonsByPair.get(key) ?? 0) + (passedQuizzesByPair.get(key) ?? 0);
    completedUnitsByCourse.set(
      courseId,
      (completedUnitsByCourse.get(courseId) ?? 0) + done
    );
  }

  const courseBreakdown: TeachingCourseRow[] = courses.map((course) => {
    const id = course._id.toString();
    const required = requiredItems.get(id) ?? { lessons: 0, quizzes: 0 };
    const requiredTotal = required.lessons + required.quizzes;
    const counts = enrollmentsByCourse.get(id) ?? {
      active: 0,
      completed: 0,
      cancelled: 0,
    };
    const students = counts.active + counts.completed;

    return {
      courseId: id,
      title: course.title,
      slug: course.slug,
      status: course.status,
      publishedLessons: required.lessons,
      requiredQuizzes: required.quizzes,
      students,
      completions: counts.completed,
      completionRate: percentage(counts.completed, students),
      // Every student in a course shares the same denominator, so the mean is
      // the summed numerators over requiredItems × students.
      averageProgress: percentage(
        completedUnitsByCourse.get(id) ?? 0,
        requiredTotal * students
      ),
      certificatesIssued: certificatesByCourse.get(id) ?? 0,
    };
  });

  const totals = courseBreakdown.reduce(
    (accumulator, row) => {
      const requiredTotal = row.publishedLessons + row.requiredQuizzes;
      accumulator.students += row.students;
      accumulator.completions += row.completions;
      accumulator.certificates += row.certificatesIssued;
      accumulator.completedUnits += completedUnitsByCourse.get(row.courseId) ?? 0;
      accumulator.possibleUnits += requiredTotal * row.students;
      return accumulator;
    },
    { students: 0, completions: 0, certificates: 0, completedUnits: 0, possibleUnits: 0 }
  );

  const statusTotals = [...enrollmentsByCourse.values()].reduce(
    (accumulator, counts) => ({
      active: accumulator.active + counts.active,
      completed: accumulator.completed + counts.completed,
      cancelled: accumulator.cancelled + counts.cancelled,
    }),
    { active: 0, completed: 0, cancelled: 0 }
  );

  const attempts = attemptStats[0];

  return {
    courses: courseCounts,
    students: {
      total: distinctStudents.length,
      active: statusTotals.active,
      completed: statusTotals.completed,
      cancelled: statusTotals.cancelled,
    },
    engagement: {
      averageProgress: percentage(totals.completedUnits, totals.possibleUnits),
      completions: totals.completions,
      completionRate: percentage(totals.completions, totals.students),
      certificatesIssued: totals.certificates,
    },
    quizzes: {
      published: publishedQuizCount,
      attempts: attempts?.attempts ?? 0,
      averageScore: attempts ? Math.round(attempts.avg) : null,
      passRate: attempts ? percentage(attempts.passed, attempts.attempts) : null,
    },
    courseBreakdown: courseBreakdown.sort((a, b) => b.students - a.students),
    nudges: await buildNudges(courses, requiredItems, {
      completedLessonsByPair,
      passedQuizzesByPair,
    }),
  };
};

/**
 * The students worth a message: still active, furthest from finishing, and
 * enrolled long enough that "hasn't started" means something.
 */
const buildNudges = async (
  courses: { _id: Types.ObjectId; title: string }[],
  requiredItems: Map<string, { lessons: number; quizzes: number }>,
  maps: {
    completedLessonsByPair: Map<string, number>;
    passedQuizzesByPair: Map<string, number>;
  }
): Promise<NudgeRow[]> => {
  const cutoff = new Date(Date.now() - NUDGE_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const titleByCourse = new Map(
    courses.map((course) => [course._id.toString(), course.title])
  );

  // Only courses that actually have something to complete can strand anyone.
  const gradedCourseIds = courses
    .map((course) => course._id)
    .filter((id) => {
      const required = requiredItems.get(id.toString());
      return required !== undefined && required.lessons + required.quizzes > 0;
    });
  if (gradedCourseIds.length === 0) return [];

  const candidates = await Enrollment.find({
    course: { $in: gradedCourseIds },
    status: EnrollmentStatus.ACTIVE,
    enrolledAt: { $lte: cutoff },
  })
    .sort({ lastAccessedAt: 1, enrolledAt: 1 })
    // A generous slice to rank within, so the six shown are the six least
    // advanced rather than merely the six least recently seen.
    .limit(200)
    .select("course student enrolledAt lastAccessedAt");

  if (candidates.length === 0) return [];

  // Names are fetched separately rather than populated: `student` has to stay a
  // raw ObjectId here because it is half of the key into the progress maps.
  const students = await User.find({
    _id: { $in: candidates.map((enrollment) => enrollment.student) },
  }).select("firstName lastName");
  const nameById = new Map(
    students.map((student) => [
      student._id.toString(),
      `${student.firstName} ${student.lastName}`.trim(),
    ])
  );

  return candidates
    .map((enrollment) => {
      const courseId = enrollment.course.toString();
      const required = requiredItems.get(courseId) ?? { lessons: 0, quizzes: 0 };
      const requiredTotal = required.lessons + required.quizzes;
      const key = pairKey(enrollment.course, enrollment.student);
      const done =
        (maps.completedLessonsByPair.get(key) ?? 0) +
        (maps.passedQuizzesByPair.get(key) ?? 0);

      return {
        enrollmentId: enrollment._id.toString(),
        studentName: nameById.get(enrollment.student.toString()) ?? "Deleted user",
        courseId,
        courseTitle: titleByCourse.get(courseId) ?? "",
        progressPercentage: percentage(done, requiredTotal),
        enrolledAt: enrollment.enrolledAt,
        lastAccessedAt: enrollment.lastAccessedAt ?? undefined,
      };
    })
    .sort(
      (a, b) =>
        a.progressPercentage - b.progressPercentage ||
        a.enrolledAt.getTime() - b.enrolledAt.getTime()
    )
    .slice(0, 6);
};

/** One row of the instructor's student roster: a person, in one course. */
export interface TeachingStudentRow {
  enrollmentId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  courseId: string;
  courseTitle: string;
  status: EnrollmentStatus;
  progressPercentage: number;
  completedLessons: number;
  totalLessons: number;
  passedRequiredQuizzes: number;
  totalRequiredQuizzes: number;
  enrolledAt: Date;
  lastAccessedAt?: Date;
  completedAt?: Date;
  certificateIssued: boolean;
}

/**
 * The instructor's student roster — one row per enrolment, because the same
 * person in two of your courses is two different stories.
 *
 * Progress is computed the same way as everywhere else, but only for the page
 * being shown: the enrolments are paginated first, then every aggregation is
 * scoped to that slice. A roster of ten thousand rows costs the same as ten.
 */
export const getTeachingStudents = async (
  viewer: Viewer,
  query: TeachingStudentsQuery
): Promise<{ students: TeachingStudentRow[]; pagination: PaginationMeta }> => {
  if (viewer.role === UserRole.STUDENT) {
    throw ApiError.forbidden("Only instructors and admins have a student roster.");
  }

  const emptyPage = {
    students: [],
    pagination: { page: query.page, limit: query.limit, total: 0, totalPages: 0 },
  };

  // Scope to the caller's own courses first — everything else hangs off this.
  const courseFilter: FilterQuery<ICourse> =
    viewer.role === UserRole.INSTRUCTOR ? { instructor: viewer.id } : {};
  if (query.course) {
    courseFilter._id = query.course;
  }
  const courses = await Course.find(courseFilter).select("title");
  if (courses.length === 0) return emptyPage;

  const courseIds = courses.map((course) => course._id);
  const titleByCourse = new Map(
    courses.map((course) => [course._id.toString(), course.title])
  );

  const enrollmentFilter: FilterQuery<IEnrollment> = { course: { $in: courseIds } };
  if (query.status) {
    enrollmentFilter.status = query.status;
  }

  // An enrolment holds only a reference to the person, so searching by name or
  // email means resolving those to ids before the enrolments can be filtered.
  const search = query.search?.trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    const matches = await User.find({
      role: UserRole.STUDENT,
      $or: [{ firstName: rx }, { lastName: rx }, { email: rx }],
    }).select("_id");
    if (matches.length === 0) return emptyPage;
    enrollmentFilter.student = { $in: matches.map((user) => user._id) };
  }

  // Name and progress are not columns on the enrolment, so those two sorts are
  // applied to the built rows. The other two sort in the database.
  const sortInDatabase =
    query.sortBy === "enrolledAt" || query.sortBy === "lastAccessedAt";
  const direction = query.sortOrder === "asc" ? 1 : -1;

  const total = await Enrollment.countDocuments(enrollmentFilter);
  if (total === 0) return emptyPage;

  const pagination: PaginationMeta = {
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.ceil(total / query.limit),
  };

  const enrollments = await Enrollment.find(enrollmentFilter)
    .sort(sortInDatabase ? { [query.sortBy]: direction } : { enrolledAt: -1 })
    .skip((query.page - 1) * query.limit)
    .limit(query.limit)
    .select("student course status enrolledAt lastAccessedAt completedAt");

  const pageCourseIds = [
    ...new Set(enrollments.map((enrollment) => enrollment.course.toString())),
  ].map((id) => new Types.ObjectId(id));
  const pageStudentIds = enrollments.map((enrollment) => enrollment.student);

  // Graded scope, for just the courses represented on this page.
  const publishedModules = await Module.find({
    course: { $in: pageCourseIds },
    isPublished: true,
  }).select("_id");
  const publishedModuleIds = publishedModules.map((module) => module._id);

  const [gradedLessons, requiredQuizzes, people] = await Promise.all([
    Lesson.find({
      course: { $in: pageCourseIds },
      module: { $in: publishedModuleIds },
      isPublished: true,
    }).select("_id course"),
    Quiz.find({
      course: { $in: pageCourseIds },
      isPublished: true,
      isRequired: true,
      $or: [
        { module: { $in: publishedModuleIds } },
        { module: { $exists: false } },
        { module: null },
      ],
    }).select("_id course"),
    User.find({ _id: { $in: pageStudentIds } }).select("firstName lastName email"),
  ]);

  const requiredByCourse = new Map<string, { lessons: number; quizzes: number }>();
  for (const id of pageCourseIds) {
    requiredByCourse.set(id.toString(), { lessons: 0, quizzes: 0 });
  }
  for (const lesson of gradedLessons) {
    const row = requiredByCourse.get(lesson.course.toString());
    if (row) row.lessons += 1;
  }
  for (const quiz of requiredQuizzes) {
    const row = requiredByCourse.get(quiz.course.toString());
    if (row) row.quizzes += 1;
  }

  const [completedRows, passedRows, certificates] = await Promise.all([
    LessonProgress.aggregate<{
      _id: { course: Types.ObjectId; student: Types.ObjectId };
      n: number;
    }>([
      {
        $match: {
          course: { $in: pageCourseIds },
          student: { $in: pageStudentIds },
          lesson: { $in: gradedLessons.map((lesson) => lesson._id) },
          isCompleted: true,
        },
      },
      { $group: { _id: { course: "$course", student: "$student" }, n: { $sum: 1 } } },
    ]),
    QuizAttempt.aggregate<{
      _id: { course: Types.ObjectId; student: Types.ObjectId };
      n: number;
    }>([
      {
        $match: {
          course: { $in: pageCourseIds },
          student: { $in: pageStudentIds },
          quiz: { $in: requiredQuizzes.map((quiz) => quiz._id) },
          passed: true,
        },
      },
      {
        $group: {
          _id: { course: "$course", student: "$student" },
          quizzes: { $addToSet: "$quiz" },
        },
      },
      { $project: { n: { $size: "$quizzes" } } },
    ]),
    Certificate.find({
      course: { $in: pageCourseIds },
      student: { $in: pageStudentIds },
    }).select("course student"),
  ]);

  const completedByPair = new Map(
    completedRows.map((row) => [pairKey(row._id.course, row._id.student), row.n])
  );
  const passedByPair = new Map(
    passedRows.map((row) => [pairKey(row._id.course, row._id.student), row.n])
  );
  const certifiedPairs = new Set(
    certificates.map((certificate) => pairKey(certificate.course, certificate.student))
  );
  const personById = new Map(
    people.map((person) => [person._id.toString(), person])
  );

  const rows: TeachingStudentRow[] = enrollments.map((enrollment) => {
    const courseId = enrollment.course.toString();
    const key = pairKey(enrollment.course, enrollment.student);
    const required = requiredByCourse.get(courseId) ?? { lessons: 0, quizzes: 0 };
    const completedLessons = completedByPair.get(key) ?? 0;
    const passedQuizzes = passedByPair.get(key) ?? 0;
    const person = personById.get(enrollment.student.toString());

    return {
      enrollmentId: enrollment._id.toString(),
      studentId: enrollment.student.toString(),
      firstName: person?.firstName ?? "Deleted",
      lastName: person?.lastName ?? "user",
      email: person?.email ?? "",
      courseId,
      courseTitle: titleByCourse.get(courseId) ?? "",
      status: enrollment.status,
      progressPercentage: percentage(
        completedLessons + passedQuizzes,
        required.lessons + required.quizzes
      ),
      completedLessons,
      totalLessons: required.lessons,
      passedRequiredQuizzes: passedQuizzes,
      totalRequiredQuizzes: required.quizzes,
      enrolledAt: enrollment.enrolledAt,
      lastAccessedAt: enrollment.lastAccessedAt ?? undefined,
      completedAt: enrollment.completedAt ?? undefined,
      certificateIssued: certifiedPairs.has(key),
    };
  });

  if (!sortInDatabase) {
    rows.sort((a, b) => {
      const value =
        query.sortBy === "progress"
          ? a.progressPercentage - b.progressPercentage
          : `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
      return query.sortOrder === "asc" ? value : -value;
    });
  }

  return { students: rows, pagination };
};
