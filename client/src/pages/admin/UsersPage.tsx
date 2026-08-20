import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCheck,
  UserX,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import type {
  Pagination,
  RoleFilter,
  SortOrder,
  StatusFilter,
  User,
  UserListParams,
  UserSortField,
  UserStatistics,
} from "@/types";
import { cn } from "@/utils/cn";

type LoadStatus = "loading" | "error" | "ready";

interface ConfirmAction {
  type: "delete" | "deactivate" | "activate";
  user: User;
}

type BulkAction = "activate" | "deactivate" | "delete";

const bulkCopy: Record<BulkAction, { verb: string; confirmLabel: string; danger: boolean }> = {
  activate: { verb: "Activate", confirmLabel: "Activate", danger: false },
  deactivate: { verb: "Deactivate", confirmLabel: "Deactivate", danger: false },
  delete: { verb: "Delete", confirmLabel: "Delete", danger: true },
};

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

const PAGE_SIZES = [10, 25, 50] as const;

const SORT_FIELDS: UserSortField[] = [
  "createdAt",
  "firstName",
  "lastName",
  "email",
  "role",
];

/** Sortable columns, in table order. `firstName` is what "Name" sorts by. */
const COLUMNS: { label: string; field: UserSortField }[] = [
  { label: "Name", field: "firstName" },
  { label: "Email", field: "email" },
  { label: "Role", field: "role" },
];

/**
 * URL-held state, so a filtered or sorted view survives a refresh, can be sent
 * to another admin, and steps back with the browser. Values arriving from the
 * URL are validated rather than forwarded to the API on trust.
 */
const readSortField = (value: string | null): UserSortField =>
  SORT_FIELDS.includes(value as UserSortField) ? (value as UserSortField) : "createdAt";

const readSortOrder = (value: string | null): SortOrder =>
  value === "asc" ? "asc" : "desc";

const readRole = (value: string | null): RoleFilter =>
  value === "admin" || value === "instructor" || value === "student" ? value : "";

const readStatus = (value: string | null): StatusFilter =>
  value === "active" || value === "inactive" ? value : "";

const readLimit = (value: string | null): number =>
  PAGE_SIZES.includes(Number(value) as (typeof PAGE_SIZES)[number])
    ? Number(value)
    : PAGE_SIZES[0];

const readPage = (value: string | null): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

export const UsersPage = () => {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get("search") ?? "";
  const role = readRole(searchParams.get("role"));
  const statusFilter = readStatus(searchParams.get("status"));
  const sortBy = readSortField(searchParams.get("sortBy"));
  const sortOrder = readSortOrder(searchParams.get("sortOrder"));
  const limit = readLimit(searchParams.get("limit"));
  const page = readPage(searchParams.get("page"));

  const [searchInput, setSearchInput] = useState(search);
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [stats, setStats] = useState<UserStatistics | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const patchParams = useCallback(
    (patch: Record<string, string | number>, options?: { replace?: boolean }) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch)) {
            const isDefault =
              value === "" ||
              (key === "page" && value === 1) ||
              (key === "limit" && value === PAGE_SIZES[0]) ||
              (key === "sortBy" && value === "createdAt") ||
              (key === "sortOrder" && value === "desc");
            if (isDefault) next.delete(key);
            else next.set(key, String(value));
          }
          return next;
        },
        { replace: options?.replace ?? false }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  // Debounced search: typing resets to page 1 after a pause. Replaces rather
  // than pushes, so the back button isn't buried under one entry per keystroke.
  useEffect(() => {
    if (searchInput === search) return;
    const timer = window.setTimeout(
      () => patchParams({ search: searchInput, page: 1 }, { replace: true }),
      350
    );
    return () => window.clearTimeout(timer);
  }, [searchInput, search, patchParams]);

  const params = useMemo<UserListParams>(
    () => ({ page, limit, search, role, status: statusFilter, sortBy, sortOrder }),
    [page, limit, search, role, statusFilter, sortBy, sortOrder]
  );

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await usersService.list(params);
      setUsers(result.users);
      setPagination(result.pagination);
      // A tick from the previous page must never apply to different rows.
      setSelected(new Set());
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [params]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Counts are supplementary — the list is the page. If this call fails the
   * tiles simply don't render; it must never take the table down with it.
   */
  const loadStats = useCallback(async () => {
    try {
      setStats((await usersService.statistics()) ?? null);
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const goToPage = (next: number) => patchParams({ page: next });

  const toggleSort = (field: UserSortField) => {
    // Clicking the active column flips direction; a new column starts ascending
    // for names and text, which is the order people expect to read them in.
    const nextOrder: SortOrder =
      sortBy === field ? (sortOrder === "asc" ? "desc" : "asc") : "asc";
    patchParams({ sortBy: field, sortOrder: nextOrder, page: 1 });
  };

  const refreshAll = async () => {
    await Promise.all([load(), loadStats()]);
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
      await refreshAll();
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
    void refreshAll();
    void savedUser;
  };

  const isSelf = (user: User) => currentUser?.id === user.id;

  /**
   * Selection is keyed by id and cleared on every reload, so a stale tick can
   * never carry over onto a different page of results.
   */
  const selectable = users.filter((user) => !isSelf(user));
  const selectedUsers = selectable.filter((user) => selected.has(user.id));
  const allSelected = selectable.length > 0 && selectedUsers.length === selectable.length;

  const toggleOne = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectable.map((user) => user.id)));

  const runBulk = async () => {
    if (!bulkAction || selectedUsers.length === 0) return;
    const ids = selectedUsers.map((user) => user.id);
    setIsActionLoading(true);
    try {
      const result =
        bulkAction === "delete"
          ? await usersService.bulkRemove(ids)
          : await usersService.bulkSetStatus(ids, bulkAction === "activate");
      setSelected(new Set());
      setBulkAction(null);
      // A gap between the two means part of the selection was already gone.
      showToast(
        result.affected === result.requested
          ? `${result.affected} account${result.affected === 1 ? "" : "s"} updated`
          : `${result.affected} of ${result.requested} updated — the rest no longer exist`,
        "success"
      );
      await refreshAll();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "The bulk action failed.",
        "error"
      );
    } finally {
      setIsActionLoading(false);
    }
  };

  const hasFilters = Boolean(search || role || statusFilter);

  const clearFilters = () => {
    setSearchInput("");
    patchParams({ search: "", role: "", status: "", page: 1 });
  };

  /**
   * The counts are also the fastest way to narrow the list, so each tile is the
   * filter it describes rather than a number you then have to go and apply by
   * hand in the dropdowns below.
   */
  const tiles = stats
    ? [
        { key: "all", label: "Total", value: stats.totalUsers, active: !role && !statusFilter, apply: { role: "", status: "" } },
        { key: "student", label: "Students", value: stats.students, active: role === "student", apply: { role: "student", status: "" } },
        { key: "instructor", label: "Instructors", value: stats.instructors, active: role === "instructor", apply: { role: "instructor", status: "" } },
        { key: "admin", label: "Admins", value: stats.admins, active: role === "admin", apply: { role: "admin", status: "" } },
        { key: "active", label: "Active", value: stats.activeUsers, active: statusFilter === "active", apply: { role: "", status: "active" } },
        { key: "inactive", label: "Inactive", value: stats.inactiveUsers, active: statusFilter === "inactive", apply: { role: "", status: "inactive" } },
      ]
    : [];

  const total = pagination?.total ?? 0;
  const rangeStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = Math.min(page * limit, total);

  /** 44px on touch, tighter on desktop where the pointer is precise. */
  const actionButton =
    "flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors md:size-9";

  const rowActions = (user: User) => (
    <div className="flex items-center gap-0.5">
      <Link
        to={`/admin/users/${user.id}`}
        aria-label={`View ${user.firstName} ${user.lastName}`}
        title="View details"
        className={cn(actionButton, "hover:bg-primary-soft hover:text-ink")}
      >
        <Eye className="size-4" aria-hidden="true" />
      </Link>
      <button
        type="button"
        onClick={() => setEditUser(user)}
        aria-label={`Edit ${user.firstName} ${user.lastName}`}
        title="Edit"
        className={cn(actionButton, "hover:bg-primary-soft hover:text-ink")}
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
            title={user.isActive ? "Deactivate" : "Activate"}
            className={cn(actionButton, "hover:bg-primary-soft hover:text-ink")}
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
            title="Delete"
            className={cn(actionButton, "hover:bg-danger-soft hover:text-danger")}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );

  /** A sortable header: a real button, with the state exposed via aria-sort. */
  const sortableHeader = ({ label, field }: { label: string; field: UserSortField }) => {
    const isActive = sortBy === field;
    return (
      <th
        key={field}
        scope="col"
        aria-sort={isActive ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
        className="py-2 pr-4 font-medium"
      >
        <button
          type="button"
          onClick={() => toggleSort(field)}
          className="inline-flex items-center gap-1 rounded transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {label}
          {/* Only the active column shows a caret — six of them would say
              nothing about which one is actually in effect. */}
          {isActive &&
            (sortOrder === "asc" ? (
              <ArrowUp className="size-3.5" aria-hidden="true" />
            ) : (
              <ArrowDown className="size-3.5" aria-hidden="true" />
            ))}
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Users</h1>
          <p className="mt-1 text-muted">
            Manage everyone on EduNexa — create, edit, and control access.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Create user
        </Button>
      </div>

      {tiles.length > 0 && (
        <div
          role="group"
          aria-label="Filter by role or status"
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
        >
          {tiles.map((tile) => (
            <button
              key={tile.key}
              type="button"
              aria-pressed={tile.active}
              onClick={() => patchParams({ ...tile.apply, page: 1 })}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                tile.active
                  ? "border-primary/40 bg-primary-soft"
                  : "border-soft bg-surface hover:border-primary/30 hover:bg-primary-soft/40"
              )}
            >
              <span className="block font-display text-xl font-semibold tabular-nums">
                {tile.value}
              </span>
              <span className="block text-xs text-muted">{tile.label}</span>
            </button>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="grid gap-3 md:grid-cols-[1fr_170px_170px_130px]">
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
              value={role}
              onChange={(event) => patchParams({ role: event.target.value, page: 1 })}
            >
              <option value="">All roles</option>
              <option value="admin">Admin</option>
              <option value="instructor">Instructor</option>
              <option value="student">Student</option>
            </Select>
            <Select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => patchParams({ status: event.target.value, page: 1 })}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
            <Select
              aria-label="Rows per page"
              value={String(limit)}
              onChange={(event) => patchParams({ limit: event.target.value, page: 1 })}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
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
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                The list didn’t load. Your filters are kept — try again.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          )}

          {status === "ready" && users.length === 0 && (
            <div className="py-12 text-center">
              <UsersRound className="mx-auto size-8 text-muted" aria-hidden="true" />
              <p className="mt-3 font-medium">No users found.</p>
              <p className="mt-1 text-sm text-muted">
                Try changing your search or filters.
              </p>
              {/* Without this, a filtered-to-nothing view is a dead end. */}
              {hasFilters && (
                <Button variant="outline" className="mt-4" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          )}

          {status === "ready" && selectedUsers.length > 0 && (
            <div
              role="group"
              aria-label="Bulk actions"
              // Sticky under the navbar: selecting rows then scrolling used to
              // leave the actions somewhere off-screen above.
              className="sticky top-16 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary-soft px-4 py-3"
            >
              <p className="text-sm font-medium tabular-nums" aria-live="polite">
                {selectedUsers.length} selected
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setBulkAction("activate")}>
                  Activate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkAction("deactivate")}
                >
                  Deactivate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-danger hover:bg-danger-soft"
                  onClick={() => setBulkAction("delete")}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Delete
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            </div>
          )}

          {status === "ready" && users.length > 0 && (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    Users, sorted by {sortBy} {sortOrder === "asc" ? "ascending" : "descending"}
                  </caption>
                  <thead>
                    <tr className="border-b border-soft text-xs text-muted uppercase">
                      <th scope="col" className="w-8 py-2 pr-2">
                        <input
                          type="checkbox"
                          aria-label="Select all users on this page"
                          checked={allSelected}
                          disabled={selectable.length === 0}
                          onChange={toggleAll}
                          className="size-4 accent-primary"
                        />
                      </th>
                      {COLUMNS.map(sortableHeader)}
                      <th scope="col" className="py-2 pr-4 font-medium">
                        Status
                      </th>
                      {sortableHeader({ label: "Created", field: "createdAt" })}
                      <th scope="col" className="py-2 font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr
                        key={user.id}
                        className={cn(
                          "border-b border-soft transition-colors last:border-0",
                          selected.has(user.id) ? "bg-primary-soft/50" : "hover:bg-paper"
                        )}
                      >
                        <td className="py-3 pr-2">
                          {/* Your own account is never selectable — bulk
                              deactivate or delete would lock you out. */}
                          {!isSelf(user) && (
                            <input
                              type="checkbox"
                              aria-label={`Select ${user.firstName} ${user.lastName}`}
                              checked={selected.has(user.id)}
                              onChange={() => toggleOne(user.id)}
                              className="size-4 accent-primary"
                            />
                          )}
                        </td>
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
                        <td className="py-3 pr-4 text-muted tabular-nums">
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
                  <li
                    key={user.id}
                    className={cn(
                      "rounded-xl border p-4 transition-colors",
                      selected.has(user.id)
                        ? "border-primary/40 bg-primary-soft/50"
                        : "border-soft"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {!isSelf(user) && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${user.firstName} ${user.lastName}`}
                          checked={selected.has(user.id)}
                          onChange={() => toggleOne(user.id)}
                          className="mt-1 size-4 shrink-0 accent-primary"
                        />
                      )}
                      <div className="min-w-0 flex-1">
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
                        <span className="text-xs text-muted tabular-nums">
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
                  {/* Announced, so filtering with a screen reader gives some
                      signal that the result set changed. */}
                  <p className="text-sm text-muted tabular-nums" aria-live="polite">
                    {rangeStart}–{rangeEnd} of {total} user
                    {total === 1 ? "" : "s"}
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
      {bulkAction && (
        <ConfirmDialog
          open
          title={`${bulkCopy[bulkAction].verb} ${selectedUsers.length} user${
            selectedUsers.length === 1 ? "" : "s"
          }`}
          message={
            bulkAction === "delete"
              ? `Are you sure you want to delete ${selectedUsers.length} account${
                  selectedUsers.length === 1 ? "" : "s"
                }?

This action cannot be undone.`
              : bulkAction === "deactivate"
                ? `${selectedUsers.length} account${
                    selectedUsers.length === 1 ? "" : "s"
                  } will no longer be able to log in.

Their courses and progress are kept.`
                : `${selectedUsers.length} account${
                    selectedUsers.length === 1 ? "" : "s"
                  } will be able to log in again.`
          }
          confirmLabel={bulkCopy[bulkAction].confirmLabel}
          isLoading={isActionLoading}
          onConfirm={() => void runBulk()}
          onCancel={() => setBulkAction(null)}
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
