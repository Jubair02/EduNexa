import { Badge } from "@/components/ui/badge";
import type { UserRole } from "@/types";
import { roleLabels } from "@/utils/roleRoutes";

const roleVariant: Record<UserRole, "amber" | "aubergine" | "primary"> = {
  admin: "amber",
  instructor: "aubergine",
  student: "primary",
};

export const RoleBadge = ({ role }: { role: UserRole }) => (
  <Badge variant={roleVariant[role]}>{roleLabels[role]}</Badge>
);

export const StatusBadge = ({ isActive }: { isActive: boolean }) => (
  <Badge variant={isActive ? "success" : "muted"}>
    {isActive ? "Active" : "Inactive"}
  </Badge>
);
