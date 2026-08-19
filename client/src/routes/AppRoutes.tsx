import { Navigate, Route, Routes } from "react-router-dom";
import { FullPageSpinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "@/layouts/AuthLayout";
import { CatalogLayout } from "@/layouts/CatalogLayout";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { AdminCoursesPage } from "@/pages/admin/AdminCoursesPage";
import { AdminDashboard } from "@/pages/admin/AdminDashboard";
import { UserDetailsPage } from "@/pages/admin/UserDetailsPage";
import { UsersPage } from "@/pages/admin/UsersPage";
import { CourseCatalogPage } from "@/pages/courses/CourseCatalogPage";
import { LessonViewerPage } from "@/pages/courses/LessonViewerPage";
import { ManageCourseDetailsPage } from "@/pages/courses/ManageCourseDetailsPage";
import { ManageCourseFormPage } from "@/pages/courses/ManageCourseFormPage";
import { PublicCourseDetailsPage } from "@/pages/courses/PublicCourseDetailsPage";
import { InstructorCoursesPage } from "@/pages/instructor/InstructorCoursesPage";
import { InstructorDashboard } from "@/pages/instructor/InstructorDashboard";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { AdminCertificatesPage } from "@/pages/admin/AdminCertificatesPage";
import { AdminEnrollmentsPage } from "@/pages/admin/AdminEnrollmentsPage";
import { AdminQuizAttemptsPage } from "@/pages/admin/AdminQuizAttemptsPage";
import { StudentCertificatesPage } from "@/pages/certificates/StudentCertificatesPage";
import { VerifyCertificatePage } from "@/pages/certificates/VerifyCertificatePage";
import { QuizManagementPage } from "@/pages/quizzes/QuizManagementPage";
import { QuizPlayerPage } from "@/pages/quizzes/QuizPlayerPage";
import { LearnPage } from "@/pages/student/LearnPage";
import { MyCoursesPage } from "@/pages/student/MyCoursesPage";
import { StudentDashboard } from "@/pages/student/StudentDashboard";
import { StudentProgressPage } from "@/pages/student/StudentProgressPage";
import { StudentQuizzesPage } from "@/pages/student/StudentQuizzesPage";
import { dashboardPathFor } from "@/utils/roleRoutes";
import { GuestRoute } from "./GuestRoute";
import { ProtectedRoute } from "./ProtectedRoute";

const RootRedirect = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <FullPageSpinner />;
  }
  return <Navigate to={user ? dashboardPathFor(user.role) : "/login"} replace />;
};

export const AppRoutes = () => (
  <Routes>
    <Route index element={<RootRedirect />} />

    <Route element={<GuestRoute />}>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
    </Route>

    {/* Public: the catalog and certificate verification need no session. */}
    <Route element={<CatalogLayout />}>
      <Route path="/courses" element={<CourseCatalogPage />} />
      <Route path="/courses/:slug" element={<PublicCourseDetailsPage />} />
      <Route path="/courses/:slug/lessons/:lessonId" element={<LessonViewerPage />} />
      <Route
        path="/verify/certificate/:verificationCode"
        element={<VerifyCertificatePage />}
      />
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
);
