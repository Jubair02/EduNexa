import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { RoleBadge, StatusBadge } from "@/components/UserBadges";
import { UserFormModal } from "@/components/UserFormModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { usersService } from "@/services/users.service";
import type { Pagination, RoleFilter, StatusFilter, User, UserListParams } from "@/types";

type LoadStatus = "loading" | "error" | "ready";

interface ConfirmAction {
  type: "delete" | "deactivate" | "activate";
  user: User;
}

const confirmCopy: Record<ConfirmAction["type"], { title: string; message: string; confirmLabel: string }> = {
  delete: {
    title: "Delete user",
    message:
      "Are you sure you want to delete this user?\n\nThis action cannot be undone.",
    confirmLabel: "Delete user",
  },
  deactivate: {
    title: "Deactivate user",
    message:
      "Are you sure you want to deactivate this user?\n\nThey will no longer be able to log in.",
    confirmLabel: "Deactivate",
  },
  activate: {
    title: "Activate user",
    message: "This user will be able to log in again.",
    confirmLabel: "Activate",
  },
};

export const UsersPage = () => {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [params, setParams] = useState<UserListParams>({
    page: 1,
    limit: 10,
    search: "",
    role: "",
    status: "",
  });
  const [searchInput, setSearchInput] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Debounced search: typing resets to page 1 after a pause.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setParams((prev) =>
        prev.search === searchInput ? prev : { ...prev, page: 1, search: searchInput }
      );
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await usersService.list(params);
      setUsers(result.users);
      setPagination(result.pagination);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [params]);

  useEffect(() => {
    void load();
  }, [load]);

  const setFilter = (patch: Partial<UserListParams>) => {
    setParams((prev) => ({ ...prev, ...patch, page: 1 }));
  };

  const goToPage = (page: number) => {
    setParams((prev) => ({ ...prev, page }));
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    const { type, user } = confirmAction;
    setIsActionLoading(true);
    try {
      if (type === "delete") {
        await usersService.remove(user.id);
        showToast("User deleted");
      } else {
        await usersService.setStatus(user.id, type === "activate");
        showToast(type === "activate" ? "User activated" : "User deactivated");
      }
      setConfirmAction(null);
      await load();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "The action failed. Please try again.",
        "error"
      );
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSaved = (savedUser: User, mode: "created" | "updated") => {
    setCreateOpen(false);
    setEditUser(null);
    showToast(mode === "created" ? "User created" : "User updated");
    void load();
    void savedUser;
  };

  const isSelf = (user: User) => currentUser?.id === user.id;

  const rowActions = (user: User) => (
    <div className="flex items-center gap-1">
      <Link
        to={`/admin/users/${user.id}`}
        aria-label={`View ${user.firstName} ${user.lastName}`}
        className="rounded-lg p-2 text-muted hover:bg-primary-soft hover:text-ink"
      >
        <Eye className="size-4" aria-hidden="true" />
      </Link>
      <button
        type="button"
        onClick={() => setEditUser(user)}
        aria-label={`Edit ${user.firstName} ${user.lastName}`}
        className="rounded-lg p-2 text-muted hover:bg-primary-soft hover:text-ink"
      >
        <Pencil className="size-4" aria-hidden="true" />
      </button>
      {!isSelf(user) && (
        <>
          <button
            type="button"
            onClick={() =>
              setConfirmAction({ type: user.isActive ? "deactivate" : "activate", user })
            }
            aria-label={`${user.isActive ? "Deactivate" : "Activate"} ${user.firstName} ${user.lastName}`}
            className="rounded-lg p-2 text-muted hover:bg-primary-soft hover:text-ink"
          >
            {user.isActive ? (
              <UserX className="size-4" aria-hidden="true" />
            ) : (
              <UserCheck className="size-4" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setConfirmAction({ type: "delete", user })}
            aria-label={`Delete ${user.firstName} ${user.lastName}`}
            className="rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Users</h1>
          <p className="mt-1 text-muted">
            Manage everyone on EduNexa — create, edit, and control access.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Create user
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                type="search"
                aria-label="Search users"
                placeholder="Search by name or email…"
                className="pl-9"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
            <Select
              aria-label="Filter by role"
              value={params.role}
              onChange={(event) => setFilter({ role: event.target.value as RoleFilter })}
            >
              <option value="">All roles</option>
              <option value="admin">Admin</option>
              <option value="instructor">Instructor</option>
              <option value="student">Student</option>
            </Select>
            <Select
              aria-label="Filter by status"
              value={params.status}
              onChange={(event) =>
                setFilter({ status: event.target.value as StatusFilter })
              }
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>

          {status === "loading" && (
            <div className="space-y-3" aria-label="Loading users">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}

          {status === "error" && (
            <div className="py-12 text-center">
              <p className="font-medium">Unable to load users.</p>
              <p className="mt-1 text-sm text-muted">Please try again.</p>
              <Button variant="outline" className="mt-4" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          )}

          {status === "ready" && users.length === 0 && (
            <div className="py-12 text-center">
              <p className="font-medium">No users found.</p>
              <p className="mt-1 text-sm text-muted">
                Try changing your search or filters.
              </p>
            </div>
          )}

          {status === "ready" && users.length > 0 && (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-soft text-xs text-muted uppercase">
                      <th className="py-2 pr-4 font-medium">Name</th>
                      <th className="py-2 pr-4 font-medium">Email</th>
                      <th className="py-2 pr-4 font-medium">Role</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Created</th>
                      <th className="py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-soft last:border-0">
                        <td className="py-3 pr-4 font-medium">
                          {user.firstName} {user.lastName}
                          {isSelf(user) && (
                            <span className="ml-2 text-xs text-muted">(you)</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-muted">{user.email}</td>
                        <td className="py-3 pr-4">
                          <RoleBadge role={user.role} />
                        </td>
                        <td className="py-3 pr-4">
                          <StatusBadge isActive={user.isActive} />
                        </td>
                        <td className="py-3 pr-4 text-muted">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3">{rowActions(user)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <ul className="space-y-3 md:hidden">
                {users.map((user) => (
                  <li key={user.id} className="rounded-xl border border-soft p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {user.firstName} {user.lastName}
                          {isSelf(user) && (
                            <span className="ml-2 text-xs text-muted">(you)</span>
                          )}
                        </p>
                        <p className="text-sm break-all text-muted">{user.email}</p>
                      </div>
                      <StatusBadge isActive={user.isActive} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <RoleBadge role={user.role} />
                        <span className="text-xs text-muted">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {rowActions(user)}
                    </div>
                  </li>
                ))}
              </ul>

              {pagination && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-soft pt-4">
                  <p className="text-sm text-muted">
                    {pagination.total} user{pagination.total === 1 ? "" : "s"}
                    {pagination.totalPages > 1 &&
                      ` — page ${pagination.page} of ${pagination.totalPages}`}
                  </p>
                  {pagination.totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pagination.page <= 1}
                        onClick={() => goToPage(pagination.page - 1)}
                      >
                        <ChevronLeft className="size-4" aria-hidden="true" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pagination.page >= pagination.totalPages}
                        onClick={() => goToPage(pagination.page + 1)}
                      >
                        Next
                        <ChevronRight className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <UserFormModal
          open
          onClose={() => setCreateOpen(false)}
          onSaved={handleSaved}
        />
      )}
      {editUser && (
        <UserFormModal
          key={editUser.id}
          open
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={handleSaved}
        />
      )}
      {confirmAction && (
        <ConfirmDialog
          open
          title={confirmCopy[confirmAction.type].title}
          message={confirmCopy[confirmAction.type].message}
          confirmLabel={confirmCopy[confirmAction.type].confirmLabel}
          isLoading={isActionLoading}
          onConfirm={() => void handleConfirm()}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
};
