import { ChevronLeft, ChevronRight, ScrollText, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { auditService } from "@/services/audit.service";
import type {
  AuditAction,
  AuditChange,
  AuditListParams,
  AuditLogEntry,
  Pagination,
} from "@/types";

type LoadStatus = "loading" | "error" | "ready";
type Tone = NonNullable<BadgeProps["variant"]>;

/**
 * How each recorded action is presented. Keyed by the stored action string, so
 * an action the server adds before this map does still renders — it falls back
 * to the raw value rather than disappearing from the log.
 */
const ACTION_PRESENTATION: Record<AuditAction, { label: string; tone: Tone }> = {
  "user.created": { label: "User created", tone: "success" },
  "user.updated": { label: "User updated", tone: "muted" },
  "user.role_changed": { label: "Role changed", tone: "amber" },
  "user.status_changed": { label: "Status changed", tone: "amber" },
  "user.password_reset": { label: "Password reset", tone: "amber" },
  "user.deleted": { label: "User deleted", tone: "danger" },
  "users.bulk_status_changed": { label: "Bulk status change", tone: "amber" },
  "users.bulk_deleted": { label: "Bulk delete", tone: "danger" },
  "certificate.status_changed": { label: "Certificate status", tone: "aubergine" },
  "course.deleted": { label: "Course deleted", tone: "danger" },
};

/** The order the filter offers, grouped by what an admin actually looks for. */
const FILTERABLE_ACTIONS: AuditAction[] = [
  "user.role_changed",
  "user.password_reset",
  "user.deleted",
  "users.bulk_deleted",
  "user.status_changed",
  "users.bulk_status_changed",
  "user.created",
  "user.updated",
  "course.deleted",
  "certificate.status_changed",
];

const present = (action: AuditAction) =>
  ACTION_PRESENTATION[action] ?? { label: action, tone: "muted" as Tone };

/** Metadata is untyped by design, so read out of it defensively. */
const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const ChangeRows = ({ changes }: { changes: AuditChange[] }) => (
  <ul className="mt-1 space-y-0.5">
    {changes.map((change) => (
      <li key={change.field} className="text-xs text-muted">
        <span className="font-medium text-ink">{change.field}</span>{" "}
        {change.from || "—"} → <span className="text-ink">{change.to || "—"}</span>
      </li>
    ))}
  </ul>
);

/**
 * The expandable tail of an entry: which accounts a bulk action swept up, and
 * where the request came from. Collapsed by default — it is the detail someone
 * goes looking for during an investigation, not while scanning.
 */
const EntryDetails = ({ entry }: { entry: AuditLogEntry }) => {
  const accounts = stringList(entry.metadata.accounts);
  const hasRequestInfo = Boolean(entry.ip || entry.userAgent);

  if (accounts.length === 0 && !hasRequestInfo) return null;

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-muted hover:text-ink">
        {accounts.length > 0
          ? `${accounts.length} account${accounts.length === 1 ? "" : "s"} and request details`
          : "Request details"}
      </summary>
      <div className="mt-2 space-y-2 rounded-lg bg-paper p-3">
        {accounts.length > 0 && (
          <ul className="space-y-0.5">
            {accounts.map((account) => (
              <li key={account} className="text-xs break-all">
                {account}
              </li>
            ))}
          </ul>
        )}
        {hasRequestInfo && (
          <dl className="space-y-0.5 text-xs text-muted">
            {entry.ip && (
              <div className="flex gap-2">
                <dt className="font-medium">IP</dt>
                <dd className="break-all">{entry.ip}</dd>
              </div>
            )}
            {entry.userAgent && (
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium">Client</dt>
                <dd className="break-all">{entry.userAgent}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </details>
  );
};

const Actor = ({ entry }: { entry: AuditLogEntry }) => (
  <>
    <p className="font-medium">{entry.actor.name}</p>
    <p className="text-xs break-all text-muted">{entry.actor.email}</p>
  </>
);

/**
 * Who did what to whom, across the whole platform.
 *
 * Read-only on purpose: there is no edit or delete control anywhere on this
 * screen because the API offers none, and a log an admin can tidy up is not
 * evidence of anything.
 */
export const AdminAuditLogPage = () => {
  const [params, setParams] = useState<AuditListParams>({
    page: 1,
    limit: 20,
    search: "",
    action: "",
    from: "",
    to: "",
  });
  const [searchInput, setSearchInput] = useState("");
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      const result = await auditService.list(params);
      setEntries(result.logs);
      setPagination(result.pagination);
      setStatus("ready");
    } catch (error) {
      // The server rejects an inverted date range with a reason worth reading,
      // so show what it said rather than a generic failure.
      setErrorMessage(error instanceof Error ? error.message : null);
      setStatus("error");
    }
  }, [params]);

  useEffect(() => {
    void load();
  }, [load]);

  const setFilter = (patch: Partial<AuditListParams>) =>
    setParams((prev) => ({ ...prev, page: 1, ...patch }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Audit log</h1>
        <p className="mt-1 text-muted">
          Every role change, deletion and password reset on EduNexa, with who did it.
          Entries are appended automatically and cannot be edited or removed.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_200px_160px_160px]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                type="search"
                aria-label="Search the audit log"
                placeholder="Search by person or action…"
                className="pl-9"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>

            <Select
              aria-label="Filter by action"
              value={params.action}
              onChange={(event) =>
                setFilter({ action: event.target.value as AuditListParams["action"] })
              }
            >
              <option value="">All actions</option>
              {FILTERABLE_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {present(action).label}
                </option>
              ))}
            </Select>

            <div>
              <label htmlFor="audit-from" className="sr-only">
                From date
              </label>
              <Input
                id="audit-from"
                type="date"
                value={params.from}
                max={params.to || undefined}
                onChange={(event) => setFilter({ from: event.target.value })}
              />
            </div>
            <div>
              <label htmlFor="audit-to" className="sr-only">
                To date
              </label>
              <Input
                id="audit-to"
                type="date"
                value={params.to}
                min={params.from || undefined}
                onChange={(event) => setFilter({ to: event.target.value })}
              />
            </div>
          </div>

          {status === "loading" && (
            <div className="space-y-3" aria-live="polite">
              <p className="sr-only">Loading the audit log…</p>
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-11 w-full" />
              ))}
            </div>
          )}

          {status === "error" && (
            <div className="py-12 text-center">
              <p className="font-medium">Unable to load the audit log.</p>
              <p className="mt-1 text-sm text-muted">
                {errorMessage ?? "Please try again."}
              </p>
              <Button variant="outline" className="mt-4" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          )}

          {status === "ready" && entries.length === 0 && (
            <div className="py-12 text-center">
              <ScrollText className="mx-auto size-8 text-muted" aria-hidden="true" />
              <p className="mt-3 font-medium">Nothing recorded for this view.</p>
              <p className="mt-1 text-sm text-muted">
                Role changes, deletions and password resets appear here as they happen.
              </p>
            </div>
          )}

          {status === "ready" && entries.length > 0 && (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-soft text-xs text-muted uppercase">
                      <th className="py-2 pr-4 font-medium">When</th>
                      <th className="py-2 pr-4 font-medium">Who</th>
                      <th className="py-2 pr-4 font-medium">Action</th>
                      <th className="py-2 font-medium">What happened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => {
                      const { label, tone } = present(entry.action);
                      return (
                        <tr key={entry.id} className="border-b border-soft last:border-0">
                          <td className="py-3 pr-4 align-top whitespace-nowrap text-muted">
                            {new Date(entry.createdAt).toLocaleString()}
                          </td>
                          <td className="py-3 pr-4 align-top">
                            <Actor entry={entry} />
                            <Badge variant="muted" className="mt-1">
                              {entry.actor.role}
                            </Badge>
                          </td>
                          <td className="py-3 pr-4 align-top">
                            <Badge variant={tone}>{label}</Badge>
                          </td>
                          <td className="py-3 align-top">
                            <p>{entry.summary}</p>
                            {entry.changes.length > 0 && (
                              <ChangeRows changes={entry.changes} />
                            )}
                            <EntryDetails entry={entry} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile and tablet cards — this table has too much text per row
                  to survive a sideways drag. */}
              <ul className="space-y-3 lg:hidden" aria-label="Audit log entries">
                {entries.map((entry) => {
                  const { label, tone } = present(entry.action);
                  return (
                    <li key={entry.id} className="rounded-xl border border-soft p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Actor entry={entry} />
                        </div>
                        <Badge variant={tone}>{label}</Badge>
                      </div>

                      <p className="mt-3 text-sm">{entry.summary}</p>
                      {entry.changes.length > 0 && <ChangeRows changes={entry.changes} />}
                      <EntryDetails entry={entry} />

                      <p className="mt-3 text-xs text-muted">
                        {new Date(entry.createdAt).toLocaleString()}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-soft pt-4">
              <p className="text-sm text-muted">
                {pagination.total} entr{pagination.total === 1 ? "y" : "ies"} — page{" "}
                {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => setParams((prev) => ({ ...prev, page: prev.page - 1 }))}
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setParams((prev) => ({ ...prev, page: prev.page + 1 }))}
                >
                  Next
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
