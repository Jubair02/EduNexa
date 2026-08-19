import { Badge } from "@/components/ui/badge";
import type { CourseCategory, CourseLevel, CourseStatus } from "@/types";
import { categoryLabels, levelLabels, statusLabels } from "@/utils/courseMeta";

const levelVariant: Record<CourseLevel, "success" | "amber" | "primary"> = {
  beginner: "success",
  intermediate: "amber",
  advanced: "primary",
};

const statusVariant: Record<CourseStatus, "muted" | "success" | "aubergine"> = {
  draft: "muted",
  published: "success",
  archived: "aubergine",
};

export const CategoryBadge = ({ category }: { category: CourseCategory }) => (
  <Badge variant="aubergine">{categoryLabels[category]}</Badge>
);

export const LevelBadge = ({ level }: { level: CourseLevel }) => (
  <Badge variant={levelVariant[level]}>{levelLabels[level]}</Badge>
);

export const CourseStatusBadge = ({ status }: { status: CourseStatus }) => (
  <Badge variant={statusVariant[status]}>{statusLabels[status]}</Badge>
);
