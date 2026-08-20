import {
  Award,
  BookOpen,
  ChevronDown,
  HelpCircle,
  KeyRound,
  LifeBuoy,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { useMemo, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types";
import { cn } from "@/utils/cn";
import { AUDIENCE_LABELS, HELP_TOPICS, matchesQuery, type HelpTopic } from "./helpTopics";

type Audience = "all" | UserRole;

const AUDIENCE_ORDER: Audience[] = ["all", "student", "instructor", "admin"];

interface QuickLink {
  label: string;
  hint: string;
  to: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** Roles this shortcut applies to; omitted means everyone. */
  roles?: UserRole[];
}

const QUICK_LINKS: QuickLink[] = [
  {
    label: "Change your password",
    hint: "Settings",
    to: "/settings",
    icon: KeyRound,
  },
  {
    label: "Edit your name or email",
    hint: "Profile",
    to: "/profile",
    icon: Settings,
  },
  {
    label: "Browse courses",
    hint: "Find something to enrol in",
    to: "/courses",
    icon: BookOpen,
  },
  {
    label: "Your certificates",
    hint: "Download or share them",
    to: "/student/certificates",
    icon: Award,
    roles: ["student"],
  },
  {
    label: "Manage users",
    hint: "Create accounts, reset passwords",
    to: "/admin/users",
    icon: Users,
    roles: ["admin"],
  },
  {
    label: "Your courses",
    hint: "Build modules, lessons and quizzes",
    to: "/instructor/courses",
    icon: BookOpen,
    roles: ["instructor"],
  },
];

/** One question, as a native disclosure so it works without JavaScript. */
const Topic = ({ topic }: { topic: HelpTopic }) => (
  <details
    id={topic.id}
    className="group border-b border-soft last:border-0 [&_summary::-webkit-details-marker]:hidden"
  >
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 font-medium transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <span>{topic.question}</span>
      <ChevronDown
        className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180"
        aria-hidden="true"
      />
    </summary>
    <div className="space-y-3 pb-4 text-sm leading-relaxed text-muted">
      {topic.answer.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </div>
  </details>
);

/**
 * Help and support. Deliberately reachable without a session: someone locked
 * out of their account is exactly the person who needs to read how to get a
 * password reset, and they cannot sign in to find out.
 */
export const HelpPage = () => {
  const { user } = useAuth();
  // Signed-in people start on their own role's questions; visitors see all.
  const [audience, setAudience] = useState<Audience>(user?.role ?? "all");
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () =>
      HELP_TOPICS.filter((topic) => {
        if (audience !== "all" && topic.audience !== null && topic.audience !== audience) {
          return false;
        }
        return matchesQuery(topic, query);
      }),
    [audience, query]
  );

  // Grouped so a filtered view still reads as sections rather than a flat list.
  const groups = useMemo(() => {
    const order: (UserRole | "general")[] = ["general", "student", "instructor", "admin"];
    return order
      .map((key) => ({
        key,
        label: key === "general" ? "Accounts and signing in" : AUDIENCE_LABELS[key],
        topics: visible.filter((topic) => (topic.audience ?? "general") === key),
      }))
      .filter((group) => group.topics.length > 0);
  }, [visible]);

  const quickLinks = QUICK_LINKS.filter(
    (link) => !link.roles || (user !== null && link.roles.includes(user.role))
  );

  return (
    <div className="space-y-6">
      <div>
        {/* Spelled out rather than "&": the display face draws an ornate
            ampersand that reads as a symbol at heading size. */}
        <h1 className="font-display text-3xl font-semibold">Help and support</h1>
        <p className="mt-1 text-muted">
          How EduNexa works, and what to do when something does not.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Search help"
              placeholder="Search help — try “password”, “certificate”, “publish”…"
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div
            role="group"
            aria-label="Filter help by audience"
            className="flex flex-wrap gap-2"
          >
            {AUDIENCE_ORDER.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={audience === value}
                onClick={() => setAudience(value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  audience === value
                    ? "border-primary bg-primary-soft text-primary-strong"
                    : "border-soft text-muted hover:text-ink"
                )}
              >
                {value === "all" ? "All topics" : AUDIENCE_LABELS[value]}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {groups.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <HelpCircle className="mx-auto size-8 text-muted" aria-hidden="true" />
            <p className="mt-3 font-medium">Nothing here matches “{query}”.</p>
            <p className="mt-1 text-sm text-muted">
              Try a different word, or clear the filters to see every topic.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setQuery("");
                setAudience("all");
              }}
            >
              Show all topics
            </Button>
          </CardContent>
        </Card>
      )}

      {groups.map((group) => (
        <Card key={group.key}>
          <CardHeader>
            <CardTitle className="text-lg">{group.label}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-2">
            {group.topics.map((topic) => (
              <Topic key={topic.id} topic={topic} />
            ))}
          </CardContent>
        </Card>
      ))}

      {quickLinks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Go straight there</CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            <ul className="grid gap-2 sm:grid-cols-2">
              {quickLinks.map(({ label, hint, to, icon: Icon }) => (
                <li key={label}>
                  <Link
                    to={to}
                    className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-3 transition-colors hover:border-soft hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <span className="shrink-0 rounded-lg bg-primary-soft p-2">
                      <Icon className="size-4 text-primary" aria-hidden={true} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="block text-xs text-muted">{hint}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="shrink-0 rounded-lg bg-amber/15 p-2">
              <LifeBuoy className="size-4 text-amber-strong" aria-hidden="true" />
            </span>
            <CardTitle className="text-lg">Still stuck?</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pb-6 text-sm text-muted">
          <p>
            EduNexa has no built-in support inbox, so there is no ticket to raise here.
            Your administrator is the person who can act on account problems — they can
            reset passwords, fix roles, reactivate accounts and correct certificates.
          </p>
          <p>
            For a question about the content of a course — a confusing lesson, a quiz that
            looks wrong — the instructor who teaches it is the right person to ask. Their
            name is on the course page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
