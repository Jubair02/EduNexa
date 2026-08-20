import {
  Award,
  BookOpen,
  ClipboardList,
  Compass,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  ScrollText,
  Settings,
  TrendingUp,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import type { UserRole } from "@/types";

export interface NavItem {
  label: string;
  icon: ComponentType<{ className?: string }>;
  /**
   * Destination route. Required on purpose: a nav row with nowhere to go reads
   * as an unfinished product, so the type refuses to let one exist. Build the
   * screen, or leave the entry out until it exists.
   */
  to: string;
}

export interface RoleNav {
  /** Shown above the divider. */
  primary: NavItem[];
  /** Shown below the divider — account-level, not content. */
  secondary: NavItem[];
}

/**
 * Navigation is presentation only. Every route is still guarded by
 * ProtectedRoute on the client and by RBAC on the server, so what appears
 * here can never widen a role's actual permissions.
 */
export const NAV_BY_ROLE: Record<UserRole, RoleNav> = {
  student: {
    primary: [
      { label: "Dashboard", icon: LayoutDashboard, to: "/student/dashboard" },
      { label: "My Courses", icon: BookOpen, to: "/student/courses" },
      { label: "Browse Courses", icon: Compass, to: "/courses" },
      { label: "My Progress", icon: TrendingUp, to: "/student/progress" },
      { label: "Quizzes", icon: ClipboardList, to: "/student/quizzes" },
      { label: "Certificates", icon: Award, to: "/student/certificates" },
    ],
    secondary: [
      { label: "Settings", icon: Settings, to: "/settings" },
      { label: "Help & Support", icon: HelpCircle, to: "/help" },
    ],
  },
  instructor: {
    primary: [
      { label: "Dashboard", icon: LayoutDashboard, to: "/instructor/dashboard" },
      { label: "My Courses", icon: BookOpen, to: "/instructor/courses" },
      { label: "My Students", icon: Users, to: "/instructor/students" },
      { label: "Browse Courses", icon: Compass, to: "/courses" },
      // Instructors manage quizzes and see completion figures inside each
      // course, so there is deliberately no global entry for either here.
    ],
    secondary: [
      { label: "Settings", icon: Settings, to: "/settings" },
      { label: "Help & Support", icon: HelpCircle, to: "/help" },
    ],
  },
  admin: {
    primary: [
      { label: "Dashboard", icon: LayoutDashboard, to: "/admin/dashboard" },
      { label: "Users", icon: Users, to: "/admin/users" },
      { label: "Courses", icon: BookOpen, to: "/admin/courses" },
      { label: "Enrollments", icon: GraduationCap, to: "/admin/enrollments" },
      { label: "Certificates", icon: Award, to: "/admin/certificates" },
      { label: "Quiz Attempts", icon: ClipboardList, to: "/admin/quiz-attempts" },
      { label: "Audit Log", icon: ScrollText, to: "/admin/audit-log" },
      { label: "Browse Courses", icon: Compass, to: "/courses" },
    ],
    secondary: [
      { label: "Settings", icon: Settings, to: "/settings" },
      { label: "Help & Support", icon: HelpCircle, to: "/help" },
    ],
  },
};
