import type { UserRole } from "@/types";

export const dashboardPathFor = (role: UserRole): string => `/${role}/dashboard`;

export const roleLabels: Record<UserRole, string> = {
  admin: "Administrator",
  instructor: "Instructor",
  student: "Student",
};
