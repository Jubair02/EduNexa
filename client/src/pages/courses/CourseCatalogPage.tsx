import { ChevronLeft, ChevronRight, Compass, Search, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CourseCard } from "@/components/CourseCard";
import { FeaturedCourseCard } from "@/components/courses/FeaturedCourseCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { coursesService } from "@/services/courses.service";
import type {
  Course,
  CourseCategory,
  CourseLevel,
  CourseListParams,
  Pagination,
} from "@/types";
import { COURSE_CATEGORIES } from "@/types";
import { categoryLabels, levelLabels } from "@/utils/courseMeta";

type LoadStatus = "loading" | "error" | "ready";

const PAGE_SIZE = 12;

/**
 * Below this many results the lead card is skipped. A "featured" course sitting
 * beside one lonely sibling reads as a broken grid rather than an editorial
 * choice, so the layout only earns the treatment once there is a row to lead.
 */
const FEATURE_THRESHOLD = 3;

const LEVELS = Object.keys(levelLabels) as CourseLevel[];

/**
 * Filters live in the URL, which makes a filtered catalog shareable, survivable
 * across a refresh, and navigable with the back button. It also removes the
 * category/level state that previously existed only in memory and silently
 * reset itself.
 *
 * Values arriving from the URL are strangers, so both are checked against the
 * known set instead of being forwarded to the API on trust.
 */
const readCategory = (value: string | null): "" | CourseCategory =>
  COURSE_CATEGORIES.includes(value as CourseCategory) ? (value as CourseCategory) : "";

const readLevel = (value: string | null): "" | CourseLevel =>
  LEVELS.includes(value as CourseLevel) ? (value as CourseLevel) : "";

const readPage = (value: string | null): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

/** Static strings so Tailwind's scanner sees them; index 0 is deliberately bare. */
const STAGGER = [
  "",
  "[animation-delay:50ms]",
  "[animation-delay:100ms]",
  "[animation-delay:150ms]",
  "[animation-delay:200ms]",
  "[animation-delay:250ms]",
];

const stagger = (index: number) => STAGGER[Math.min(index, STAGGER.length - 1)];

/** Public course discovery — published courses only (enforced server-side too). */
export const CourseCatalogPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get("search") ?? "";
  const category = readCategory(searchParams.get("category"));
  const level = readLevel(searchParams.get("level"));
  const page = readPage(searchParams.get("page"));

  const [searchInput, setSearchInput] = useState(search);
  const [courses, setCourses] = useState<Course[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");

  /**
   * Writes filter state to the URL. `replace` is for the debounced search box,
   * where one history entry per keystroke would make the back button useless;
   * an explicit choice — a filter, a chip, a page — pushes, so it can be undone.
   */
  const applyFilters = useCallback(
    (patch: Record<string, string | number>, options?: { replace?: boolean }) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch)) {
            // Defaults are left out entirely rather than written as empty
            // values, so a URL only ever names what is actually narrowed.
            if (value === "" || (key === "page" && value === 1)) {
              next.delete(key);
            } else {
              next.set(key, String(value));
            }
          }
          return next;
        },
        { replace: options?.replace ?? false }
      );
    },
    [setSearchParams]
  );

  // The navbar can search again while this page is already open, which only
  // changes the URL — mirror it back into the field.
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    if (searchInput === search) return;
    const timer = window.setTimeout(
      () => applyFilters({ search: searchInput, page: 1 }, { replace: true }),
      350
    );
    return () => window.clearTimeout(timer);
  }, [searchInput, search, applyFilters]);

  const params = useMemo<CourseListParams>(
    () => ({
      page,
      limit: PAGE_SIZE,
      search,
      category,
      level,
      status: "",
      view: "catalog",
    }),
    [page, search, category, level]
  );

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await coursesService.list(params);
      setCourses(result.courses);
      setPagination(result.pagination);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [params]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeFilters = [
    category && { key: "category", label: categoryLabels[category] },
    level && { key: "level", label: levelLabels[level] },
    search && { key: "search", label: `“${search}”` },
  ].filter((filter): filter is { key: string; label: string } => Boolean(filter));

  const clearAll = () => {
    setSearchInput("");
    applyFilters({ search: "", category: "", level: "", page: 1 });
  };

  const total = pagination?.total ?? 0;
  const showFeatured = page === 1 && courses.length >= FEATURE_THRESHOLD;
  const [featured, ...remainder] = courses;
  const gridCourses = showFeatured ? remainder : courses;

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-8">
      <header className="max-w-2xl">
        <h1 className="font-display text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
          Browse courses
        </h1>
        <p className="mt-3 text-pretty text-muted sm:text-lg">
          Learn something new — taught by EduNexa instructors.
        </p>
      </header>

      <section aria-labelledby="catalog-filters-heading" className="space-y-3">
        <h2 id="catalog-filters-heading" className="sr-only">
          Search and filter courses
        </h2>

        {/* A search landmark, so this is reachable as one rather than being
            three unrelated controls that happen to sit together. */}
        <form
          role="search"
          className="grid gap-3 md:grid-cols-[1fr_200px_180px]"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Search courses"
              placeholder="Search courses…"
              className="pl-9"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <Select
            aria-label="Filter by category"
            value={category}
            onChange={(event) => applyFilters({ category: event.target.value, page: 1 })}
          >
            <option value="">All categories</option>
            {COURSE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {categoryLabels[value]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by level"
            value={level}
            onChange={(event) => applyFilters({ level: event.target.value, page: 1 })}
          >
            <option value="">All levels</option>
            {LEVELS.map((value) => (
              <option key={value} value={value}>
                {levelLabels[value]}
              </option>
            ))}
          </Select>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {/* Announced on change: filtering with a keyboard and a screen reader
              otherwise gives no signal that anything happened. */}
          <p className="text-sm text-muted tabular-nums" aria-live="polite">
            {status === "ready"
              ? `${total} course${total === 1 ? "" : "s"}${
                  activeFilters.length > 0 ? " match these filters" : " available"
                }`
              : " "}
          </p>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <SlidersHorizontal className="size-4 text-muted" aria-hidden="true" />
              {activeFilters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  aria-label={`Remove filter ${filter.label}`}
                  onClick={() => {
                    if (filter.key === "search") setSearchInput("");
                    applyFilters({ [filter.key]: "", page: 1 });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-soft bg-surface py-1 pr-2 pl-3 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {filter.label}
                  <X className="size-3.5 text-muted" aria-hidden="true" />
                </button>
              ))}
              <button
                type="button"
                onClick={clearAll}
                className="text-xs font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </section>

      {status === "loading" && (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Loading courses"
        >
          {/* Shaped like what is coming, lead card included, so the page does
              not visibly rearrange itself the moment results land. */}
          <Skeleton className="h-64 w-full rounded-3xl sm:col-span-2 lg:row-span-2 lg:h-full" />
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-72 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {status === "error" && (
        <div className="rounded-3xl border border-soft bg-surface px-6 py-16 text-center">
          <p className="font-display text-xl font-semibold">Unable to load courses.</p>
          <p className="mx-auto mt-2 max-w-sm text-pretty text-sm text-muted">
            The catalog didn’t respond. Your filters are kept — try again.
          </p>
          <Button variant="outline" className="mt-5" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      {status === "ready" && courses.length === 0 && (
        <div className="rounded-3xl border border-dashed border-soft px-6 py-16 text-center">
          <Compass className="mx-auto size-9 text-muted" aria-hidden="true" />
          <p className="mt-4 font-display text-xl font-semibold">No courses found.</p>
          <p className="mx-auto mt-2 max-w-sm text-pretty text-sm text-muted">
            {activeFilters.length > 0
              ? "Nothing matches this combination. Widening the filters usually helps."
              : "New courses are added regularly — check back soon."}
          </p>
          {/* An empty result with no way out is a dead end; clearing is the
              action someone actually wants here. */}
          {activeFilters.length > 0 && (
            <Button variant="outline" className="mt-5" onClick={clearAll}>
              Clear all filters
            </Button>
          )}
        </div>
      )}

      {status === "ready" && courses.length > 0 && (
        <>
          {/*
           * One asymmetric grid rather than three even columns. The lead course
           * spans two columns and two rows on wide screens, so the eye has an
           * entry point instead of nine identical rectangles; below `lg` it
           * simply becomes the full-width first card.
           */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {showFeatured && featured && (
              <div className="animate-rise-in sm:col-span-2 lg:row-span-2">
                <FeaturedCourseCard
                  course={featured}
                  to={`/courses/${featured.slug}`}
                />
              </div>
            )}
            {gridCourses.map((course, index) => (
              <CourseCard
                key={course.id}
                course={course}
                to={`/courses/${course.slug}`}
                className={`animate-rise-in ${stagger(index)}`}
              />
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-soft pt-6">
              <p className="text-sm text-muted tabular-nums">
                Showing {rangeStart}–{rangeEnd} of {total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => applyFilters({ page: page - 1 })}
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => applyFilters({ page: page + 1 })}
                >
                  Next
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
