import { ArrowRight, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { RoleBadge, StatusBadge } from "@/components/UserBadges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { User } from "@/types";

const initials = (user: User): string =>
  `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();

const joinedOn = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** Shared column template so the header and the rows stay aligned on md+. */
const columns = "md:grid md:grid-cols-[minmax(0,1fr)_7rem_6rem_7rem] md:items-center md:gap-4";

export const RecentUsersPanel = ({
  users,
  isLoading,
}: {
  users: User[];
  isLoading: boolean;
}) => (
  <Card className="flex h-full flex-col">
    <CardHeader className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <CardTitle className="text-lg">Recently registered</CardTitle>
        <p className="mt-0.5 text-sm text-muted">The newest people on the platform.</p>
      </div>
      <Link
        to="/admin/users"
        className="inline-flex items-center gap-1 rounded-lg text-sm font-medium text-primary transition-colors hover:text-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        View all users
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </CardHeader>

    <CardContent className="flex flex-1 flex-col pb-6">
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <Skeleton className="h-9 flex-1" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && users.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
          <span className="rounded-full bg-primary-soft p-3">
            <UserPlus className="size-6 text-primary" aria-hidden="true" />
          </span>
          <div>
            <p className="font-medium">No users yet</p>
            <p className="mt-1 text-sm text-muted">
              Accounts you create will show up here as they join.
            </p>
          </div>
          <Link
            to="/admin/users"
            className="text-sm font-medium text-primary hover:text-primary-strong"
          >
            Go to user management
          </Link>
        </div>
      )}

      {!isLoading && users.length > 0 && (
        <>
          <div
            className={`hidden border-b border-soft pb-2 text-xs font-semibold tracking-wide text-muted uppercase ${columns}`}
          >
            <span>Member</span>
            <span>Role</span>
            <span>Status</span>
            <span>Registered</span>
          </div>

          <ul className="divide-y divide-soft">
            {users.map((user) => (
              <li
                key={user.id}
                className={`flex flex-wrap items-center gap-3 py-3 ${columns}`}
              >
                <Link
                  to={`/admin/users/${user.id}`}
                  className="group flex w-full min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:w-auto"
                >
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft font-display text-sm font-semibold text-primary-strong"
                    aria-hidden="true"
                  >
                    {initials(user)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium transition-colors group-hover:text-primary">
                      {user.firstName} {user.lastName}
                    </span>
                    <span className="block truncate text-xs text-muted">{user.email}</span>
                  </span>
                </Link>
                <RoleBadge role={user.role} />
                <StatusBadge isActive={user.isActive} />
                <span className="ml-auto text-xs text-muted tabular-nums md:ml-0">
                  {joinedOn(user.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </CardContent>
  </Card>
);
