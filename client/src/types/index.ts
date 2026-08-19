export type UserRole = "admin" | "instructor" | "student";

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: FieldError[];
  pagination?: Pagination;
}

export interface AuthData {
  user: User;
  token: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface UserStatistics {
  totalUsers: number;
  students: number;
  instructors: number;
  admins: number;
  activeUsers: number;
  inactiveUsers: number;
}

export type StatusFilter = "" | "active" | "inactive";
export type RoleFilter = "" | UserRole;

export interface UserListParams {
  page: number;
  limit: number;
  search: string;
  role: RoleFilter;
  status: StatusFilter;
}

export interface UserListResult {
  users: User[];
  pagination: Pagination;
}

export interface CreateUserPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: UserRole;
  isActive?: boolean;
}

// ---- Courses (Phase 3) ----

export type CourseLevel = "beginner" | "intermediate" | "advanced";
export type CourseStatus = "draft" | "published" | "archived";

export const COURSE_CATEGORIES = [
  "programming",
  "web-development",
  "design",
  "business",
  "marketing",
  "data-science",
  "devops",
  "other",
] as const;
export type CourseCategory = (typeof COURSE_CATEGORIES)[number];

export interface CourseInstructor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface CourseContentStats {
  totalModules: number;
  publishedModules: number;
  totalLessons: number;
  publishedLessons: number;
}

export interface Course {
  id: string;
  title: string;
  slug: string;
  description: string;
  shortDescription?: string;
  thumbnail?: { url: string; publicId?: string };
  category: CourseCategory;
  level: CourseLevel;
  /** Minutes. */
  duration?: number;
  status: CourseStatus;
  instructor: CourseInstructor | null;
  createdAt: string;
  updatedAt: string;
  /** Present only for admin/owner. */
  contentStats?: CourseContentStats;
}

export interface CourseStatistics {
  totalCourses: number;
  published: number;
  draft: number;
  archived: number;
}

export interface CourseListParams {
  page: number;
  limit: number;
  search: string;
  category: "" | CourseCategory;
  level: "" | CourseLevel;
  status: "" | CourseStatus;
  instructor?: string;
  view: "catalog" | "manage";
}

export interface CourseListResult {
  courses: Course[];
  pagination: Pagination;
}

export interface CoursePayload {
  title: string;
  description: string;
  shortDescription?: string;
  category: CourseCategory;
  level: CourseLevel;
  duration?: number | null;
  instructor?: string;
  thumbnail?: string;
  thumbnailPublicId?: string;
}

export interface StoredFileInfo {
  url: string;
  publicId?: string;
  fileName?: string;
}

export type UploadKind = "image" | "pdf" | "document";

// ---- Modules & lessons (Phase 4) ----

export interface CourseModule {
  id: string;
  course: string;
  title: string;
  description?: string;
  order: number;
  isPublished: boolean;
  lessonCount: number;
  createdAt: string;
  updatedAt: string;
}

export type LessonType = "video" | "text" | "pdf" | "document";

export interface LessonSummary {
  id: string;
  module: string;
  course: string;
  title: string;
  description?: string;
  type: LessonType;
  /** Minutes. */
  duration?: number;
  order: number;
  isPublished: boolean;
  isPreview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Lesson extends LessonSummary {
  content?: string;
  videoUrl?: string;
  fileUrl?: string;
  fileName?: string;
}

export interface LessonContext {
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  moduleId: string;
  moduleTitle: string;
  previousLessonId: string | null;
  nextLessonId: string | null;
}

export interface ModulePayload {
  title: string;
  description?: string;
}

// ---- Enrollments (Phase 5) ----

export type EnrollmentStatus = "active" | "completed" | "cancelled";

export interface EnrollmentCourseInfo {
  id: string;
  title: string;
  slug: string;
  thumbnail?: { url: string; publicId?: string };
  category: CourseCategory;
  level: CourseLevel;
  status: CourseStatus;
  instructorName: string;
}

export interface EnrollmentStudentInfo {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface Enrollment {
  id: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  lastAccessedAt?: string;
  course: EnrollmentCourseInfo | null;
  student: EnrollmentStudentInfo | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnrollmentCheck {
  isEnrolled: boolean;
  enrollmentId: string | null;
  status: EnrollmentStatus | null;
}

export interface EnrollmentListParams {
  page: number;
  limit: number;
  search: string;
  status: "" | EnrollmentStatus;
  course?: string;
}

export interface EnrollmentListResult {
  enrollments: Enrollment[];
  pagination: Pagination;
}

export interface EnrollmentStatistics {
  totalEnrollments: number;
  activeEnrollments: number;
  completedEnrollments: number;
  cancelledEnrollments: number;
}

// ---- Progress & quizzes (Phase 6) ----

export interface CourseProgress {
  courseId: string;
  totalLessons: number;
  completedLessons: number;
  totalRequiredQuizzes: number;
  passedRequiredQuizzes: number;
  totalRequiredItems: number;
  completedRequiredItems: number;
  progressPercentage: number;
  isCompleted: boolean;
  /** Set by the backend when requirements were first met. */
  completedAt?: string;
  certificateAvailable: boolean;
  certificateId?: string;
  certificateStatus?: CertificateStatus;
  completedLessonIds: string[];
  passedQuizIds: string[];
}

// ---- Certificates (Phase 7) ----

export type CertificateStatus = "active" | "revoked";

export interface Certificate {
  id: string;
  certificateNumber: string;
  verificationCode: string;
  status: CertificateStatus;
  issuedAt: string;
  completionDate: string;
  /** Snapshot values, exactly as printed on the certificate. */
  studentName: string;
  courseTitle: string;
  instructorName: string;
  course: { id: string; title: string; slug: string } | null;
  student: { id: string; firstName: string; lastName: string; email: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** The only fields the public verification endpoint returns. */
export interface CertificateVerification {
  valid: boolean;
  certificateNumber?: string;
  studentName?: string;
  courseTitle?: string;
  instructorName?: string;
  completionDate?: string;
  issuedAt?: string;
  status?: CertificateStatus;
}

export interface CertificateListParams {
  page: number;
  limit: number;
  search: string;
  status: "" | CertificateStatus;
  student?: string;
  course?: string;
  sortBy?: "issuedAt" | "completionDate" | "certificateNumber";
  sortOrder?: "asc" | "desc";
}

export interface CourseCompletionStatistics {
  enrolledStudents: number;
  activeStudents: number;
  completedStudents: number;
  certificatesIssued: number;
  activeCertificates: number;
  revokedCertificates: number;
  completionRate: number;
}

export interface LessonProgressState {
  lessonId: string;
  isCompleted: boolean;
  completedAt?: string;
}

export interface MyCourseProgress {
  course: {
    id: string;
    title: string;
    slug: string;
    thumbnail?: { url: string; publicId?: string };
  };
  enrollmentStatus: EnrollmentStatus;
  progress: CourseProgress;
}

export interface ProgressSummary {
  activeCourses: number;
  completedCourses: number;
  overallProgressPercentage: number;
  /** Mean of the best attempt per quiz; null when nothing was attempted. */
  averageQuizScore: number | null;
  quizzesAttempted: number;
}

export type QuestionType = "multiple-choice" | "true-false";

export interface QuizQuestion {
  id: string;
  questionText: string;
  type: QuestionType;
  options: string[];
  points: number;
  order: number;
  /** Present only in staff responses — students never receive the key. */
  correctAnswer?: string;
}

export interface Quiz {
  id: string;
  course: string;
  module: string | null;
  title: string;
  description?: string;
  passingScore: number;
  isRequired: boolean;
  isPublished: boolean;
  questionCount: number;
  totalPoints: number;
  questions: QuizQuestion[];
  createdAt: string;
  updatedAt: string;
}

/** A quiz in the student's own list, with their attempt summary attached. */
export interface StudentQuizOverview extends Quiz {
  courseId: string;
  courseTitle: string;
  attemptCount: number;
  bestPercentage: number | null;
  passed: boolean;
}

export interface QuizQuestionInput {
  questionText: string;
  type: QuestionType;
  options?: string[];
  correctAnswer: string;
  points: number;
}

export interface QuizPayload {
  title: string;
  description?: string;
  module?: string;
  passingScore: number;
  isRequired: boolean;
  questions: QuizQuestionInput[];
}

export interface QuizAnswerInput {
  questionId: string;
  selectedAnswer: string;
}

export interface AttemptResult {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  score: number;
  totalPoints: number;
  percentage: number;
  passed: boolean;
  submittedAt: string;
}

export interface AttemptWithStudent extends AttemptResult {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export interface MyQuizResults {
  quizId: string;
  passingScore: number;
  attemptCount: number;
  bestPercentage: number | null;
  passed: boolean;
  attempts: AttemptResult[];
}

export interface QuizResultsSummary {
  quizId: string;
  quizTitle: string;
  passingScore: number;
  totalAttempts: number;
  studentsAttempted: number;
  studentsPassed: number;
  averagePercentage: number | null;
}

export interface AttemptListParams {
  page: number;
  limit: number;
  search: string;
  passed: "" | "true" | "false";
  quiz?: string;
  course?: string;
}

export interface LessonPayload {
  title: string;
  description?: string;
  type: LessonType;
  content?: string;
  videoUrl?: string;
  fileUrl?: string;
  fileName?: string;
  filePublicId?: string;
  duration?: number | null;
  isPreview?: boolean;
}
