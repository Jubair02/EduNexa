import { ChevronRight, ShieldCheck } from "lucide-react";
import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface AttentionItem {
  label: string;
  /** Short count phrase, e.g. "3 drafts" — never a bare number, so it reads on its own. */
  note: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  to: string;
}

export const AttentionPanel = ({
  items,
  isLoading,
  emptyNote = "No inactive accounts, drafts, or dropped enrollments.",
}: {
  items: AttentionItem[];
  isLoading: boolean;
  /** What "all clear" means here — the loose ends differ by role. */
  emptyNote?: string;
}) => (
  <Card className="flex h-full flex-col">
    <CardHeader>
      <CardTitle className="text-lg">Needs attention</CardTitle>
      <p className="mt-0.5 text-sm text-muted">Loose ends worth a look today.</p>
    </CardHeader>

    <CardContent className="flex flex-1 flex-col pb-6">
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
          <span className="rounded-full bg-success-soft p-3">
            <ShieldCheck className="size-6 text-success" aria-hidden="true" />
          </span>
          <div>
            <p className="font-medium">All clear</p>
            <p className="mt-1 text-sm text-muted">{emptyNote}</p>
          </div>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <ul className="space-y-2">
          {items.map(({ label, note, icon: Icon, to }) => (
            <li key={label}>
              <Link
                to={to}
                className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-3 transition-colors hover:border-soft hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span className="shrink-0 rounded-lg bg-amber/15 p-2">
                  <Icon className="size-4 text-amber-strong" aria-hidden={true} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted">{note}</span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
);
