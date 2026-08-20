/**
 * Notifications, derived rather than stored.
 *
 * The usual design is a Notification collection written to on every event. That
 * needs a write bolted onto each existing flow, and anything the write misses
 * is silently absent forever — including everything that happened before the
 * feature shipped. Instead, the records that already exist *are* the events:
 * a certificate has an `issuedAt`, an attempt has a `submittedAt`, an enrolment
 * has an `enrolledAt`. Reading them back in time order gives a complete feed
 * with no backfill and nothing to keep in sync.
 *
 * Read state is therefore one timestamp per person, not one row per
 * notification.
 *
 * The trade-off is deliberate: only events with an unambiguous timestamp are
 * included. "A lesson was published" is left out, because `updatedAt` moves on
 * any edit and would announce a typo fix as new content.
 */
import { Types } from "mongoose";
import { Certificate } from "../models/certificate.model";
import { Course } from "../models/course.model";
import { Enrollment, EnrollmentStatus } from "../models/enrollment.model";
import { Quiz } from "../models/quiz.model";
import { QuizAttempt } from "../models/quiz-attempt.model";
import { User, UserDocument, UserRole } from "../models/user.model";
import { Viewer } from "./courses.service";

/** How many events to look back over per source. */
const PER_SOURCE_LIMIT = 15;
/** How many to return once merged. */
const FEED_LIMIT = 20;

export type NotificationKind =
  | "certificate-earned"
  | "quiz-result"
  | "course-completed"
  | "new-enrollment"
  | "student-completed"
  | "certificate-issued"
  | "new-user";

export interface NotificationItem {
  /** Stable across requests: kind plus the id of the record behind it. */
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  at: Date;
  /** Where clicking should go, when there is somewhere useful. */
  to?: string;
  isUnread: boolean;
}

export interface NotificationFeed {
  notifications: NotificationItem[];
  unreadCount: number;
}

const nameOf = (person: { firstName?: string; lastName?: string } | null): string =>
  person ? `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim() : "A student";

/** Events for a student: their own certificates, attempts and completions. */
const studentEvents = async (studentId: string): Promise<NotificationItem[]> => {
  const [certificates, attempts, completions] = await Promise.all([
    Certificate.find({ student: studentId })
      .sort({ issuedAt: -1 })
      .limit(PER_SOURCE_LIMIT)
      .select("courseTitle issuedAt verificationCode"),
    QuizAttempt.find({ student: studentId })
      .sort({ submittedAt: -1 })
      .limit(PER_SOURCE_LIMIT)
      .select("quiz course percentage passed submittedAt"),
    Enrollment.find({
      student: studentId,
      status: EnrollmentStatus.COMPLETED,
      completedAt: { $ne: null },
    })
      .sort({ completedAt: -1 })
      .limit(PER_SOURCE_LIMIT)
      .select("course completedAt")
      .populate<{ course: { title: string } | null }>("course", "title"),
  ]);

  const quizTitles = new Map<string, string>();
  if (attempts.length > 0) {
    const quizzes = await Quiz.find({
      _id: { $in: attempts.map((attempt) => attempt.quiz) },
    }).select("title");
    for (const quiz of quizzes) quizTitles.set(quiz._id.toString(), quiz.title);
  }

  return [
    ...certificates.map((certificate) => ({
      id: `certificate-earned:${certificate._id.toString()}`,
      kind: "certificate-earned" as const,
      title: "Certificate earned",
      body: `Your certificate for ${certificate.courseTitle} is ready to download.`,
      at: certificate.issuedAt,
      to: "/student/certificates",
      isUnread: false,
    })),
    ...attempts.map((attempt) => ({
      id: `quiz-result:${attempt._id.toString()}`,
      kind: "quiz-result" as const,
      title: attempt.passed ? "Quiz passed" : "Quiz not passed yet",
      body: `${quizTitles.get(attempt.quiz.toString()) ?? "A quiz"} — you scored ${
        attempt.percentage
      }%.`,
      at: attempt.submittedAt,
      to: `/student/courses/${attempt.course.toString()}/quizzes/${attempt.quiz.toString()}`,
      isUnread: false,
    })),
    ...completions.map((enrollment) => {
      const course = enrollment.course as unknown as { title?: string } | null;
      return {
        id: `course-completed:${enrollment._id.toString()}`,
        kind: "course-completed" as const,
        title: "Course completed",
        body: `You finished ${course?.title ?? "a course"}.`,
        at: enrollment.completedAt ?? enrollment.updatedAt,
        to: "/student/progress",
        isUnread: false,
      };
    }),
  ];
};

/** Events for an instructor: activity on the courses they own. */
const instructorEvents = async (instructorId: string): Promise<NotificationItem[]> => {
  const courses = await Course.find({ instructor: instructorId }).select("title");
  if (courses.length === 0) return [];

  const courseIds = courses.map((course) => course._id);
  const titleByCourse = new Map(
    courses.map((course) => [course._id.toString(), course.title])
  );

  const [enrollments, completions, certificates] = await Promise.all([
    Enrollment.find({ course: { $in: courseIds } })
      .sort({ enrolledAt: -1 })
      .limit(PER_SOURCE_LIMIT)
      .select("student course enrolledAt")
      .populate<{ student: { firstName: string; lastName: string } | null }>(
        "student",
        "firstName lastName"
      ),
    Enrollment.find({
      course: { $in: courseIds },
      status: EnrollmentStatus.COMPLETED,
      completedAt: { $ne: null },
    })
      .sort({ completedAt: -1 })
      .limit(PER_SOURCE_LIMIT)
      .select("student course completedAt")
      .populate<{ student: { firstName: string; lastName: string } | null }>(
        "student",
        "firstName lastName"
      ),
    Certificate.find({ course: { $in: courseIds } })
      .sort({ issuedAt: -1 })
      .limit(PER_SOURCE_LIMIT)
      .select("studentName courseTitle issuedAt"),
  ]);

  return [
    ...enrollments.map((enrollment) => ({
      id: `new-enrollment:${enrollment._id.toString()}`,
      kind: "new-enrollment" as const,
      title: "New enrolment",
      body: `${nameOf(
        enrollment.student as unknown as { firstName?: string; lastName?: string } | null
      )} joined ${titleByCourse.get(enrollment.course.toString()) ?? "your course"}.`,
      at: enrollment.enrolledAt,
      to: "/instructor/students",
      isUnread: false,
    })),
    ...completions.map((enrollment) => ({
      id: `student-completed:${enrollment._id.toString()}`,
      kind: "student-completed" as const,
      title: "A student finished",
      body: `${nameOf(
        enrollment.student as unknown as { firstName?: string; lastName?: string } | null
      )} completed ${titleByCourse.get(enrollment.course.toString()) ?? "your course"}.`,
      at: enrollment.completedAt ?? enrollment.updatedAt,
      to: "/instructor/students",
      isUnread: false,
    })),
    ...certificates.map((certificate) => ({
      id: `certificate-issued:${certificate._id.toString()}`,
      kind: "certificate-issued" as const,
      title: "Certificate issued",
      body: `${certificate.studentName} earned a certificate for ${certificate.courseTitle}.`,
      at: certificate.issuedAt,
      to: "/instructor/dashboard",
      isUnread: false,
    })),
  ];
};

/** Events for an admin: platform-wide sign-ups and certificates. */
const adminEvents = async (): Promise<NotificationItem[]> => {
  const [users, certificates] = await Promise.all([
    User.find()
      .sort({ createdAt: -1 })
      .limit(PER_SOURCE_LIMIT)
      .select("firstName lastName role createdAt"),
    Certificate.find()
      .sort({ issuedAt: -1 })
      .limit(PER_SOURCE_LIMIT)
      .select("studentName courseTitle issuedAt"),
  ]);

  return [
    ...users.map((user) => ({
      id: `new-user:${user._id.toString()}`,
      kind: "new-user" as const,
      title: "New account",
      body: `${user.firstName} ${user.lastName} joined as a ${user.role}.`,
      at: user.createdAt,
      to: `/admin/users/${user._id.toString()}`,
      isUnread: false,
    })),
    ...certificates.map((certificate) => ({
      id: `certificate-issued:${certificate._id.toString()}`,
      kind: "certificate-issued" as const,
      title: "Certificate issued",
      body: `${certificate.studentName} earned a certificate for ${certificate.courseTitle}.`,
      at: certificate.issuedAt,
      to: "/admin/certificates",
      isUnread: false,
    })),
  ];
};

/**
 * The caller's notification feed, newest first, with anything after their last
 * visit marked unread.
 */
export const getNotifications = async (viewer: Viewer): Promise<NotificationFeed> => {
  const [events, person] = await Promise.all([
    viewer.role === UserRole.STUDENT
      ? studentEvents(viewer.id)
      : viewer.role === UserRole.INSTRUCTOR
        ? instructorEvents(viewer.id)
        : adminEvents(),
    User.findById(viewer.id).select("notificationsSeenAt"),
  ]);

  const seenAt = person?.notificationsSeenAt ?? null;

  const notifications = events
    .filter((event) => event.at instanceof Date && !Number.isNaN(event.at.getTime()))
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, FEED_LIMIT)
    .map((event) => ({
      ...event,
      // Never unread on a first visit: with no `seenAt` the whole history would
      // light up, which is noise rather than news.
      isUnread: seenAt !== null && event.at.getTime() > seenAt.getTime(),
    }));

  return {
    notifications,
    unreadCount: notifications.filter((event) => event.isUnread).length,
  };
};

/** Stamps "seen now", which is what clears the unread badge. */
export const markNotificationsSeen = async (viewer: Viewer): Promise<Date> => {
  const seenAt = new Date();
  await User.updateOne(
    { _id: new Types.ObjectId(viewer.id) },
    { notificationsSeenAt: seenAt }
  );
  return seenAt;
};

/** Exported for tests that need to assert the read-state field directly. */
export type { UserDocument };
