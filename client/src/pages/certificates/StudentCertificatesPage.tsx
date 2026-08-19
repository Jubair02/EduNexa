import { Award, ChevronLeft, ChevronRight, Compass, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CertificateCard } from "@/components/certificates/CertificateCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { certificatesService } from "@/services/certificates.service";
import type { Certificate, CertificateListParams, Pagination } from "@/types";

type LoadStatus = "loading" | "error" | "ready";

export const StudentCertificatesPage = () => {
  const [params, setParams] = useState<CertificateListParams>({
    page: 1,
    limit: 9,
    search: "",
    status: "",
    sortBy: "issuedAt",
    sortOrder: "desc",
  });
  const [searchInput, setSearchInput] = useState("");
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");

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
      const result = await certificatesService.list(params);
      setCertificates(result.certificates);
      setPagination(result.pagination);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [params]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasFilters = Boolean(params.search || params.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">My certificates</h1>
          <p className="mt-1 text-muted">
            Every course you've finished, ready to share or download.
          </p>
        </div>
        <Link to="/student/courses">
          <Button variant="outline">My courses</Button>
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_190px_190px]">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search certificates"
            placeholder="Search by course or certificate number…"
            className="pl-9"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <Select
          aria-label="Filter by status"
          value={params.status}
          onChange={(event) =>
            setParams((prev) => ({
              ...prev,
              page: 1,
              status: event.target.value as CertificateListParams["status"],
            }))
          }
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
        </Select>
        <Select
          aria-label="Sort certificates"
          value={params.sortBy}
          onChange={(event) =>
            setParams((prev) => ({
              ...prev,
              page: 1,
              sortBy: event.target.value as CertificateListParams["sortBy"],
            }))
          }
        >
          <option value="issuedAt">Newest first</option>
          <option value="completionDate">By completion date</option>
          <option value="certificateNumber">By certificate number</option>
        </Select>
      </div>

      {status === "loading" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
          <p className="sr-only">Loading certificates…</p>
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-56 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {status === "error" && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-medium">Unable to load your certificates.</p>
            <p className="mt-1 text-sm text-muted">Please try again.</p>
            <Button variant="outline" className="mt-4" onClick={() => void load()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {status === "ready" && certificates.length === 0 && (
        <Card>
          <CardContent className="py-14 text-center">
            <Award className="mx-auto size-9 text-muted" aria-hidden="true" />
            {hasFilters ? (
              <>
                <p className="mt-3 font-medium">No certificates match your search.</p>
                <p className="mt-1 text-sm text-muted">
                  Try a different course name or clear the filters.
                </p>
              </>
            ) : (
              <>
                <p className="mt-3 font-medium">
                  You haven't earned any certificates yet.
                </p>
                <p className="mt-1 text-sm text-muted">
                  Complete a course to earn your first certificate.
                </p>
                <Link to="/courses">
                  <Button className="mt-4">
                    <Compass className="size-4" aria-hidden="true" />
                    Browse Courses
                  </Button>
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {status === "ready" && certificates.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {certificates.map((certificate) => (
              <CertificateCard key={certificate.id} certificate={certificate} />
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
