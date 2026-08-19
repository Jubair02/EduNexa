import type { CourseCategory, CourseLevel, CourseStatus } from "@/types";

export const categoryLabels: Record<CourseCategory, string> = {
  programming: "Programming",
  "web-development": "Web Development",
  design: "Design",
  business: "Business",
  marketing: "Marketing",
  "data-science": "Data Science",
  devops: "DevOps",
  other: "Other",
};

export const levelLabels: Record<CourseLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const statusLabels: Record<CourseStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

/** Formats minutes as "5h 30m" / "45m". */
export const formatDuration = (minutes?: number): string => {
  if (!minutes || minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
};

export const instructorName = (
  instructor: { firstName: string; lastName: string } | null
): string => (instructor ? `${instructor.firstName} ${instructor.lastName}` : "Unassigned");
