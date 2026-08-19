import { ArrowLeft, Pencil, Trash2, UserCheck, UserX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { RoleBadge, StatusBadge } from "@/components/UserBadges";
import { UserFormModal } from "@/components/UserFormModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { usersService } from "@/services/users.service";
import type { User } from "@/types";

type LoadStatus = "loading" | "error" | "ready";
type ConfirmType = "delete" | "deactivate" | "activate";

export const UserDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [editOpen, setEditOpen] = useState(false);
  const [confirmType, setConfirmType] = useState<ConfirmType | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setStatus("loading");
    try {
      setUser(await usersService.get(id));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const isSelf = user !== null && currentUser?.id === user.id;

  const handleConfirm = async () => {
    if (!user || !confirmType) return;
    setIsActionLoading(true);
    try {
      if (confirmType === "delete") {
        await usersService.remove(user.id);
        showToast("User deleted");
        navigate("/admin/users", { replace: true });
        return;
      }
      const updated = await usersService.setStatus(user.id, confirmType === "activate");
      setUser(updated);
      showToast(confirmType === "activate" ? "User activated" : "User deactivated");
      setConfirmType(null);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "The action failed. Please try again.",
        "error"
      );
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        to="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to Users
      </Link>

      {status === "loading" && (
        <Card>
          <CardContent className="space-y-4 py-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      )}

      {status === "error" && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-medium">Unable to load this user.</p>
            <p className="mt-1 text-sm text-muted">
              They may have been deleted, or something went wrong.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Button variant="outline" onClick={() => void load()}>
                Retry
              </Button>
              <Link to="/admin/users">
                <Button variant="ghost">Back to Users</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {status === "ready" && user && (
        <Card>
          <CardHeader className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>
                {user.firstName} {user.lastName}
                {isSelf && <span className="ml-2 text-sm text-muted">(you)</span>}
              </CardTitle>
              <div className="mt-2 flex items-center gap-2">
                <RoleBadge role={user.role} />
                <StatusBadge isActive={user.isActive} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pb-6">
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Full name</dt>
                <dd className="mt-0.5 font-medium">
                  {user.firstName} {user.lastName}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Email</dt>
                <dd className="mt-0.5 font-medium break-all">{user.email}</dd>
              </div>
              <div>
                <dt className="text-muted">Role</dt>
                <dd className="mt-0.5 font-medium capitalize">{user.role}</dd>
              </div>
              <div>
                <dt className="text-muted">Status</dt>
                <dd className="mt-0.5 font-medium">
                  {user.isActive ? "Active" : "Inactive"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Created</dt>
                <dd className="mt-0.5 font-medium">
                  {new Date(user.createdAt).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Last updated</dt>
                <dd className="mt-0.5 font-medium">
                  {new Date(user.updatedAt).toLocaleString()}
                </dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-wrap gap-3 border-t border-soft pt-6">
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" aria-hidden="true" />
                Edit
              </Button>
              {!isSelf && (
                <>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setConfirmType(user.isActive ? "deactivate" : "activate")
                    }
                  >
                    {user.isActive ? (
                      <UserX className="size-4" aria-hidden="true" />
                    ) : (
                      <UserCheck className="size-4" aria-hidden="true" />
                    )}
                    {user.isActive ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="outline"
                    className="text-danger hover:bg-danger-soft"
                    onClick={() => setConfirmType("delete")}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Delete
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {editOpen && user && (
        <UserFormModal
          key={user.updatedAt}
          open
          user={user}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setUser(updated);
            setEditOpen(false);
            showToast("User updated");
          }}
        />
      )}

      {confirmType && user && (
        <ConfirmDialog
          open
          title={
            confirmType === "delete"
              ? "Delete user"
              : confirmType === "deactivate"
                ? "Deactivate user"
                : "Activate user"
          }
          message={
            confirmType === "delete"
              ? "Are you sure you want to delete this user?\n\nThis action cannot be undone."
              : confirmType === "deactivate"
                ? "Are you sure you want to deactivate this user?\n\nThey will no longer be able to log in."
                : "This user will be able to log in again."
          }
          confirmLabel={
            confirmType === "delete"
              ? "Delete user"
              : confirmType === "deactivate"
                ? "Deactivate"
                : "Activate"
          }
          isLoading={isActionLoading}
          onConfirm={() => void handleConfirm()}
          onCancel={() => setConfirmType(null)}
        />
      )}
    </div>
  );
};
