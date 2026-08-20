import { Award, Bell, ClipboardCheck, GraduationCap, UserPlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { notificationsService } from "@/services/notifications.service";
import type { NotificationItem, NotificationKind } from "@/types";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/relativeTime";

const ICONS: Record<NotificationKind, ComponentType<{ className?: string }>> = {
  "certificate-earned": Award,
  "certificate-issued": Award,
  "quiz-result": ClipboardCheck,
  "course-completed": GraduationCap,
  "student-completed": GraduationCap,
  "new-enrollment": UserPlus,
  "new-user": UserPlus,
};

/**
 * Notification bell. The feed is fetched once when the shell mounts, so the
 * unread count is available without opening anything; opening the panel is what
 * marks everything seen.
 */
export const NotificationBell = () => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const feed = await notificationsService.list();
      setItems(feed.notifications);
      setUnread(feed.unreadCount);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Close on an outside click or Escape, like the account menu does.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleOpen = async () => {
    const next = !open;
    setOpen(next);
    if (!next || unread === 0) return;
    // Clear the badge optimistically; a failed write just means it reappears
    // on the next load, which is the harmless direction to be wrong in.
    setUnread(0);
    setItems((current) => current.map((item) => ({ ...item, isUnread: false })));
    try {
      await notificationsService.markSeen();
    } catch {
      // Nothing to tell the user — the feed itself still rendered.
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => void handleOpen()}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
        className={cn(
          "relative flex size-10 items-center justify-center rounded-xl text-muted transition-colors duration-200",
          "hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          open && "bg-paper text-ink"
        )}
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute top-full right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-soft bg-surface shadow-lg"
        >
          <p className="border-b border-soft px-4 py-3 text-sm font-semibold">
            Notifications
          </p>

          {status === "loading" && (
            <p className="px-4 py-6 text-sm text-muted">Loading…</p>
          )}

          {status === "error" && (
            <div className="px-4 py-6">
              <p className="text-sm text-muted">Could not load notifications.</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-2 text-sm font-medium text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {status === "ready" && items.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted">
              Nothing yet. Enrolments, quiz results and certificates show up here.
            </p>
          )}

          {status === "ready" && items.length > 0 && (
            <ul className="max-h-96 divide-y divide-soft overflow-y-auto">
              {items.map((item) => {
                const Icon = ICONS[item.kind] ?? Bell;
                const body = (
                  <>
                    <span className="shrink-0 rounded-lg bg-primary-soft p-1.5">
                      <Icon className="size-4 text-primary" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{item.title}</span>
                      <span className="block text-xs text-muted">{item.body}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {relativeTime(item.at)}
                      </span>
                    </span>
                  </>
                );

                return (
                  <li key={item.id}>
                    {item.to ? (
                      <Link
                        to={item.to}
                        onClick={() => setOpen(false)}
                        className="flex gap-3 px-4 py-3 transition-colors hover:bg-paper"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="flex gap-3 px-4 py-3">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
