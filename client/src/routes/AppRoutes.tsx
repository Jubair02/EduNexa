import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { FullPageSpinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "@/layouts/AuthLayout";
import { CatalogLayout } from "@/layouts/CatalogLayout";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { dashboardPathFor } from "@/utils/roleRoutes";
import { GuestRoute } from "./GuestRoute";
import { ProtectedRoute } from "./ProtectedRoute";

/**
 * Login, register and the shell stay in the entry chunk — they are what a
 * first-time visitor always sees. Everything behind a role is split out, so a
 * student never downloads the admin screens and vice versa.
 *
 * The pages use named exports, so each loader unwraps its own binding; writing
 * them out keeps the inferred prop types intact, which a generic helper loses.
 */
const AdminDashboard = lazy(() =>
  import("@/pages/admin/AdminDashboard").then((m) => ({ default: m.AdminDashboard }))
);
const UsersPage = lazy(() =>
  import("@/pages/admin/UsersPage").then((m) => ({ default: m.UsersPage }))
);
const UserDetailsPage = lazy(() =>
  import("@/pages/admin/UserDetailsPage").then((m) => ({ default: m.UserDetailsPage }))
);
const AdminCoursesPage = lazy(() =>
  import("@/pages/admin/AdminCoursesPage").then((m) => ({ default: m.AdminCoursesPage }))
);
const AdminEnrollmentsPage = lazy(() =>
  import("@/pages/admin/AdminEnrollmentsPage").then((m) => ({ default: m.AdminEnrollmentsPage }))
);
const AdminCertificatesPage = lazy(() =>
  import("@/pages/admin/AdminCertificatesPage").then((m) => ({ default: m.AdminCertificatesPage }))
);
const AdminQuizAttemptsPage = lazy(() =>
  import("@/pages/admin/AdminQuizAttemptsPage").then((m) => ({ default: m.AdminQuizAttemptsPage }))
);
const AdminAuditLogPage = lazy(() =>
  import("@/pages/admin/AdminAuditLogPage").then((m) => ({ default: m.AdminAuditLogPage }))
);
const InstructorDashboard = lazy(() =>
  import("@/pages/instructor/InstructorDashboard").then((m) => ({ default: m.InstructorDashboard }))
);
const InstructorCoursesPage = lazy(() =>
  import("@/pages/instructor/InstructorCoursesPage").then((m) => ({ default: m.InstructorCoursesPage }))
);
const StudentDashboard = lazy(() =>
  import("@/pages/student/StudentDashboard").then((m) => ({ default: m.StudentDashboard }))
);
const MyCoursesPage = lazy(() =>
  import("@/pages/student/MyCoursesPage").then((m) => ({ default: m.MyCoursesPage }))
);
const StudentProgressPage = lazy(() =>
  import("@/pages/student/StudentProgressPage").then((m) => ({ default: m.StudentProgressPage }))
);
const StudentQuizzesPage = lazy(() =>
  import("@/pages/student/StudentQuizzesPage").then((m) => ({ default: m.StudentQuizzesPage }))
);
const LearnPage = lazy(() =>
  import("@/pages/student/LearnPage").then((m) => ({ default: m.LearnPage }))
);
const CourseCatalogPage = lazy(() =>
  import("@/pages/courses/CourseCatalogPage").then((m) => ({ default: m.CourseCatalogPage }))
);
const PublicCourseDetailsPage = lazy(() =>
  import("@/pages/courses/PublicCourseDetailsPage").then((m) => ({ default: m.PublicCourseDetailsPage }))
);
const LessonViewerPage = lazy(() =>
  import("@/pages/courses/LessonViewerPage").then((m) => ({ default: m.LessonViewerPage }))
);
const ManageCourseDetailsPage = lazy(() =>
  import("@/pages/courses/ManageCourseDetailsPage").then((m) => ({ default: m.ManageCourseDetailsPage }))
);
const ManageCourseFormPage = lazy(() =>
  import("@/pages/courses/ManageCourseFormPage").then((m) => ({ default: m.ManageCourseFormPage }))
);
const QuizManagementPage = lazy(() =>
  import("@/pages/quizzes/QuizManagementPage").then((m) => ({ default: m.QuizManagementPage }))
);
const QuizPlayerPage = lazy(() =>
  import("@/pages/quizzes/QuizPlayerPage").then((m) => ({ default: m.QuizPlayerPage }))
);
const StudentCertificatesPage = lazy(() =>
  import("@/pages/certificates/StudentCertificatesPage").then((m) => ({ default: m.StudentCertificatesPage }))
);
const VerifyCertificatePage = lazy(() =>
  import("@/pages/certificates/VerifyCertificatePage").then((m) => ({ default: m.VerifyCertificatePage }))
);
const ProfilePage = lazy(() =>
  import("@/pages/account/ProfilePage").then((m) => ({ default: m.ProfilePage }))
);
const SettingsPage = lazy(() =>
  import("@/pages/account/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
const HelpPage = lazy(() =>
  import("@/pages/help/HelpPage").then((m) => ({ default: m.HelpPage }))
);
const LandingPage = lazy(() =>
  import("@/pages/LandingPage").then((m) => ({ default: m.LandingPage }))
);
const InstructorStudentsPage = lazy(() =>
  import("@/pages/instructor/InstructorStudentsPage").then((m) => ({
    default: m.InstructorStudentsPage,
  }))
);

/**
 * Signed-in people go straight to their own dashboard. Everyone else gets the
 * landing page — previously this bounced visitors to /login, which meant the
 * public catalogue had nothing pointing at it.
 */
const RootRoute = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <FullPageSpinner />;
  }
  if (user) {
    return <Navigate to={dashboardPathFor(user.role)} replace />;
  }
  return <LandingPage />;
};

export const AppRoutes = () => (
  // One boundary around the whole tree: route chunks are small and the spinner
  // is the same one a route's own data fetch shows, so the transition reads as
  // a single load rather than two.
  <Suspense fallback={<FullPageSpinner />}>
    <Routes>


      <Route element={<GuestRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
      </Route>

      {/* Public: the landing page, catalog and certificate verification all
          work without a session. */}
      <Route element={<CatalogLayout />}>
        <Route index element={<RootRoute />} />
        <Route path="/courses" element={<CourseCatalogPage />} />
        <Route path="/courses/:slug" element={<PublicCourseDetailsPage />} />
        <Route path="/courses/:slug/lessons/:lessonId" element={<LessonViewerPage />} />
        <Route
          path="/verify/certificate/:verificationCode"
          element={<VerifyCertificatePage />}
        />
        {/* Help is public on purpose: someone locked out of their account is
            exactly who needs to read how to get a password reset. */}
        <Route path="/help" element={<HelpPage />} />
      </Route>

      {/* Account screens: any signed-in role, no role restriction. */}
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/users/:id" element={<UserDetailsPage />} />
          <Route path="/admin/courses" element={<AdminCoursesPage />} />
          <Route path="/admin/enrollments" element={<AdminEnrollmentsPage />} />
          <Route path="/admin/certificates" element={<AdminCertificatesPage />} />
          <Route path="/admin/quiz-attempts" element={<AdminQuizAttemptsPage />} />
          <Route path="/admin/audit-log" element={<AdminAuditLogPage />} />
          <Route
            path="/admin/courses/new"
            element={<ManageCourseFormPage variant="admin" mode="create" />}
          />
          <Route
            path="/admin/courses/:id"
            element={<ManageCourseDetailsPage variant="admin" />}
          />
          <Route
            path="/admin/courses/:id/edit"
            element={<ManageCourseFormPage variant="admin" mode="edit" />}
          />
          <Route
            path="/admin/courses/:courseId/quizzes"
            element={<QuizManagementPage variant="admin" />}
          />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["instructor"]} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/instructor/dashboard" element={<InstructorDashboard />} />
          <Route path="/instructor/courses" element={<InstructorCoursesPage />} />
          <Route path="/instructor/students" element={<InstructorStudentsPage />} />
          <Route
            path="/instructor/courses/new"
            element={<ManageCourseFormPage variant="instructor" mode="create" />}
          />
          <Route
            path="/instructor/courses/:id"
            element={<ManageCourseDetailsPage variant="instructor" />}
          />
          <Route
            path="/instructor/courses/:id/edit"
            element={<ManageCourseFormPage variant="instructor" mode="edit" />}
          />
          <Route
            path="/instructor/courses/:courseId/quizzes"
            element={<QuizManagementPage variant="instructor" />}
          />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["student"]} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/student/dashboard" element={<StudentDashboard />} />
          <Route path="/student/courses" element={<MyCoursesPage />} />
          <Route path="/student/certificates" element={<StudentCertificatesPage />} />
          <Route path="/student/progress" element={<StudentProgressPage />} />
          <Route path="/student/quizzes" element={<StudentQuizzesPage />} />
          <Route path="/student/courses/:courseId/learn" element={<LearnPage />} />
          <Route
            path="/student/courses/:courseId/quizzes/:quizId"
            element={<QuizPlayerPage />}
          />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  </Suspense>
);
