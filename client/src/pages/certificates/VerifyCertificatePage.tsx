import { AlertTriangle, ArrowLeft, BadgeCheck, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { certificatesService } from "@/services/certificates.service";
import type { CertificateVerification } from "@/types";

type LoadStatus = "loading" | "error" | "ready";

const formatDate = (value?: string): string =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

/**
 * Public certificate check. Reachable without a session, and only ever shows
 * what is printed on the certificate itself.
 */
export const VerifyCertificatePage = () => {
  const { verificationCode } = useParams<{ verificationCode: string }>();
  const [result, setResult] = useState<CertificateVerification | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");

  const load = useCallback(async () => {
    if (!verificationCode) return;
    setStatus("loading");
    try {
      setResult(await certificatesService.verify(verificationCode));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [verificationCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const isRevoked = result?.status === "revoked";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Certificate Verification</h1>
        <p className="mt-1 text-muted">
          Anyone can check an EduNexa certificate here — no account needed.
        </p>
      </div>

      {status === "loading" && (
        <Card>
          <CardContent className="space-y-3 py-8" aria-live="polite">
            <p className="text-center text-sm text-muted">Verifying certificate…</p>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      )}

      {status === "error" && (
        <Card>
          <CardContent className="py-12 text-center">
            <XCircle className="mx-auto size-9 text-danger" aria-hidden="true" />
            <p className="mt-3 font-medium">Certificate could not be verified.</p>
            <p className="mt-1 text-sm text-muted">
              Something went wrong reaching the service. Please try again.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => void load()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {status === "ready" && result && !result.certificateNumber && (
        <Card className="border-danger/30">
          <CardContent className="py-12 text-center">
            <XCircle className="mx-auto size-9 text-danger" aria-hidden="true" />
            <p className="mt-3 font-medium">Certificate not found or invalid.</p>
            <p className="mt-1 text-sm text-muted">
              Check the code on the certificate and try again.
            </p>
          </CardContent>
        </Card>
      )}

      {status === "ready" && result?.certificateNumber && (
        <Card className={isRevoked ? "border-amber/40" : "border-success/40"}>
          <CardContent className="space-y-5 py-6">
            <div className="text-center">
              {isRevoked ? (
                <>
                  <AlertTriangle className="mx-auto size-9 text-amber" aria-hidden="true" />
                  <p className="mt-2 font-display text-xl font-semibold">
                    This certificate has been revoked.
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    It was issued by EduNexa but is no longer valid.
                  </p>
                </>
              ) : (
                <>
                  <BadgeCheck className="mx-auto size-9 text-success" aria-hidden="true" />
                  <p className="mt-2 font-display text-xl font-semibold text-success">
                    Valid Certificate
                  </p>
                </>
              )}
            </div>

            <dl className="grid grid-cols-1 gap-4 border-t border-soft pt-5 text-sm sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-muted">Certificate number</dt>
                <dd className="mt-0.5 font-mono font-medium">{result.certificateNumber}</dd>
              </div>
              <div>
                <dt className="text-muted">Student</dt>
                <dd className="mt-0.5 font-medium">{result.studentName}</dd>
              </div>
              <div>
                <dt className="text-muted">Course</dt>
                <dd className="mt-0.5 font-medium">{result.courseTitle}</dd>
              </div>
              <div>
                <dt className="text-muted">Instructor</dt>
                <dd className="mt-0.5 font-medium">{result.instructorName}</dd>
              </div>
              <div>
                <dt className="text-muted">Status</dt>
                <dd className="mt-0.5 font-medium capitalize">{result.status}</dd>
              </div>
              <div>
                <dt className="text-muted">Completed</dt>
                <dd className="mt-0.5 font-medium">{formatDate(result.completionDate)}</dd>
              </div>
              <div>
                <dt className="text-muted">Issued</dt>
                <dd className="mt-0.5 font-medium">{formatDate(result.issuedAt)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      <Link
        to="/courses"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Browse EduNexa courses
      </Link>
    </div>
  );
};
