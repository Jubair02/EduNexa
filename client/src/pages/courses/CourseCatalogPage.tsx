import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CourseCard } from "@/components/CourseCard";
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

/** Public course discovery — published courses only (enforced server-side too). */
export const CourseCatalogPage = () => {
  // The navbar search sends people here as /courses?search=…
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("search") ?? "";

  const [params, setParams] = useState<CourseListParams>({
    page: 1,
    limit: 12,
    search: urlSearch,
    category: "",
    level: "",
    status: "",
    view: "catalog",
  });
  const [searchInput, setSearchInput] = useState(urlSearch);
  const [courses, setCourses] = useState<Course[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");

  // Searching again from the navbar while already on this page only changes
  // the URL, so mirror it back into the field and the query.
  useEffect(() => {
    setSearchInput(urlSearch);
    setParams((prev) =>
      prev.search === urlSearch ? prev : { ...prev, page: 1, search: urlSearch }
    );
  }, [urlSearch]);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Browse courses</h1>
        <p className="mt-1 text-muted">
          Learn something new — taught by EduNexa instructors.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_200px_180px]">
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
          value={params.category}
          onChange={(event) =>
            setParams((prev) => ({
              ...prev,
              page: 1,
              category: event.target.value as "" | CourseCategory,
            }))
          }
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
          value={params.level}
          onChange={(event) =>
            setParams((prev) => ({
              ...prev,
              page: 1,
              level: event.target.value as "" | CourseLevel,
            }))
          }
        >
          <option value="">All levels</option>
          {(Object.keys(levelLabels) as CourseLevel[]).map((value) => (
            <option key={value} value={value}>
              {levelLabels[value]}
            </option>
          ))}
        </Select>
      </div>

      {status === "loading" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading courses">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {status === "error" && (
        <div className="py-16 text-center">
          <p className="font-medium">Unable to load courses.</p>
          <p className="mt-1 text-sm text-muted">Please try again.</p>
          <Button variant="outline" className="mt-4" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      {status === "ready" && courses.length === 0 && (
        <div className="py-16 text-center">
          <p className="font-medium">No courses found.</p>
          <p className="mt-1 text-sm text-muted">
            Try changing your search or filters — new courses are added regularly.
          </p>
        </div>
      )}

      {status === "ready" && courses.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} to={`/courses/${course.slug}`} />
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setParams((prev) => ({ ...prev, page: prev.page - 1 }))}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                Previous
              </Button>
              <p className="text-sm text-muted">
                Page {pagination.page} of {pagination.totalPages}
              </p>
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
          )}
        </>
      )}
    </div>
  );
};
