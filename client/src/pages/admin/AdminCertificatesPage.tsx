import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  RotateCcw,
  Search,
  ShieldOff,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/useToast";
import { certificatesService } from "@/services/certificates.service";
import { coursesService } from "@/services/courses.service";
import type {
  Certificate,
  CertificateListParams,
  Course,
  Pagination,
} from "@/types";

type LoadStatus = "loading" | "error" | "ready";

/** Admin certificate register: search, filter, inspect, revoke and restore. */
export const AdminCertificatesPage = () => {
  const { showToast } = useToast();

  const [params, setParams] = useState<CertificateListParams>({
    page: 1,
    limit: 10,
    search: "",
    status: "",
    course: "",
  });
  const [searchInput, setSearchInput] = useState("");
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [pendingChange, setPendingChange] = useState<Certificate | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    coursesService
      .list({
        page: 1,
        limit: 100,
        search: "",
        category: "",
        level: "",
        status: "",
        view: "manage",
      })
      .then((result) => {
        if (!cancelled) setCourses(result.courses);
      })
      .catch(() => {
        // The course filter is a convenience; the table works without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const applyStatusChange = async () => {
    if (!pendingChange) return;
    const next = pendingChange.status === "active" ? "revoked" : "active";
    setIsSaving(true);
    try {
      await certificatesService.setStatus(pendingChange.id, next);
      showToast(next === "revoked" ? "Certificate revoked" : "Certificate restored");
      setPendingChange(null);
      await load();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "The action failed. Please try again.",
        "error"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const download = async (certificate: Certificate) => {
    try {
      await certificatesService.download(
        certificate.id,
        `${certificate.certificateNumber}.pdf`
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "The download failed.",
        "error"
      );
    }
  };

  /** Shared by the desktop table and the mobile cards. */
  const rowActions = (certificate: Certificate) => (
    <div className="flex items-center gap-1">
      <Link
        to={`/verify/certificate/${certificate.verificationCode}`}
        aria-label={`View ${certificate.certificateNumber}`}
        className="rounded-lg p-2 text-muted transition-colors hover:bg-primary-soft hover:text-ink"
      >
        <Eye className="size-4" aria-hidden="true" />
      </Link>
      <button
        type="button"
        onClick={() => void download(certificate)}
        aria-label={`Download ${certificate.certificateNumber}`}
        className="rounded-lg p-2 text-muted transition-colors hover:bg-primary-soft hover:text-ink"
      >
        <Download className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setPendingChange(certificate)}
        aria-label={`${
          certificate.status === "active" ? "Revoke" : "Restore"
        } ${certificate.certificateNumber}`}
        className="rounded-lg p-2 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
      >
        {certificate.status === "active" ? (
          <ShieldOff className="size-4" aria-hidden="true" />
        ) : (
          <RotateCcw className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Certificates</h1>
        <p className="mt-1 text-muted">
          Every certificate EduNexa has issued. Revoking keeps the record and fails
          public verification.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_170px]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                type="search"
                aria-label="Search certificates"
                placeholder="Search by student, course or number…"
                className="pl-9"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
            <Select
              aria-label="Filter by course"
              value={params.course ?? ""}
              onChange={(event) =>
                setParams((prev) => ({ ...prev, page: 1, course: event.target.value }))
              }
            >
              <option value="">All courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </Select>
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
          </div>

          {status === "loading" && (
            <div className="space-y-3" aria-live="polite">
              <p className="sr-only">Loading certificates…</p>
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-11 w-full" />
              ))}
            </div>
          )}

          {status === "error" && (
            <div className="py-12 text-center">
              <p className="font-medium">Unable to load certificates.</p>
              <p className="mt-1 text-sm text-muted">Please try again.</p>
              <Button variant="outline" className="mt-4" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          )}

          {status === "ready" && certificates.length === 0 && (
            <div className="py-12 text-center">
              <p className="font-medium">No certificates found.</p>
              <p className="mt-1 text-sm text-muted">
                Certificates appear here as students complete courses.
              </p>
            </div>
          )}

          {status === "ready" && certificates.length > 0 && (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-soft text-xs text-muted uppercase">
                      <th className="py-2 pr-4 font-medium">Certificate</th>
                      <th className="py-2 pr-4 font-medium">Student</th>
                      <th className="py-2 pr-4 font-medium">Course</th>
                      <th className="py-2 pr-4 font-medium">Issued</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certificates.map((certificate) => (
                      <tr key={certificate.id} className="border-b border-soft last:border-0">
                        <td className="py-3 pr-4 font-mono text-xs">
                          {certificate.certificateNumber}
                        </td>
                        <td className="py-3 pr-4">
                          <p className="font-medium">{certificate.studentName}</p>
                          <p className="text-xs text-muted">
                            {certificate.student?.email ?? "—"}
                          </p>
                        </td>
                        <td className="py-3 pr-4">{certificate.courseTitle}</td>
                        <td className="py-3 pr-4 text-muted">
                          {new Date(certificate.issuedAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge
                            variant={certificate.status === "active" ? "success" : "muted"}
                          >
                            {certificate.status === "active" ? "Active" : "Revoked"}
                          </Badge>
                        </td>
                        <td className="py-3">{rowActions(certificate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards — a six-column table is a sideways drag on a phone. */}
              <ul className="space-y-3 md:hidden" aria-label="Certificates">
                {certificates.map((certificate) => (
                  <li key={certificate.id} className="rounded-xl border border-soft p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{certificate.studentName}</p>
                        <p className="text-sm break-all text-muted">
                          {certificate.student?.email ?? "—"}
                        </p>
                      </div>
                      <Badge variant={certificate.status === "active" ? "success" : "muted"}>
                        {certificate.status === "active" ? "Active" : "Revoked"}
                      </Badge>
                    </div>

                    <p className="mt-3 text-sm font-medium">{certificate.courseTitle}</p>
                    <p className="mt-1 font-mono text-xs text-muted">
                      {certificate.certificateNumber}
                    </p>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-xs text-muted">
                        Issued {new Date(certificate.issuedAt).toLocaleDateString()}
                      </span>
                      {rowActions(certificate)}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-soft pt-4">
              <p className="text-sm text-muted">
                {pagination.total} certificate{pagination.total === 1 ? "" : "s"} — page{" "}
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

      {pendingChange && (
        <ConfirmDialog
          open
          title={
            pendingChange.status === "active" ? "Revoke certificate" : "Restore certificate"
          }
          message={
            pendingChange.status === "active"
              ? `Revoke ${pendingChange.certificateNumber} for ${pendingChange.studentName}?\n\nThe record is kept and stays visible to the student, but public verification will report it as revoked.`
              : `Restore ${pendingChange.certificateNumber} for ${pendingChange.studentName}?\n\nPublic verification will report it as valid again.`
          }
          confirmLabel={pendingChange.status === "active" ? "Revoke" : "Restore"}
          isLoading={isSaving}
          onConfirm={() => void applyStatusChange()}
          onCancel={() => setPendingChange(null)}
        />
      )}
    </div>
  );
};
