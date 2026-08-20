import { Award, Download, Eye } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { certificatesService } from "@/services/certificates.service";
import type { Certificate } from "@/types";

/** Reusable certificate tile — dashboard and the student's certificate list. */
export const CertificateCard = ({ certificate }: { certificate: Certificate }) => {
  const { showToast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);

  const download = async () => {
    setIsDownloading(true);
    try {
      await certificatesService.download(
        certificate.id,
        `${certificate.certificateNumber}.pdf`
      );
      showToast("Certificate downloaded");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "The download failed. Please try again.",
        "error"
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const isRevoked = certificate.status === "revoked";

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-soft bg-surface p-4 shadow-[0_1px_2px_rgba(35,26,38,0.06)] transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-xl bg-amber/15 p-2.5" aria-hidden="true">
          <Award className="size-6 text-amber-strong" />
        </span>
        {isRevoked && <Badge variant="muted">Revoked</Badge>}
      </div>

      <div className="min-w-0">
        <h3 className="truncate font-display text-lg font-semibold">
          {certificate.courseTitle}
        </h3>
        <p className="mt-0.5 text-sm text-muted">
          Completed {new Date(certificate.completionDate).toLocaleDateString()}
        </p>
      </div>

      <div>
        <p className="text-xs text-muted">Certificate</p>
        <p className="font-mono text-sm tabular-nums">{certificate.certificateNumber}</p>
      </div>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-soft pt-3">
        <Link to={`/verify/certificate/${certificate.verificationCode}`} className="flex-1">
          <Button variant="outline" size="sm" className="w-full">
            <Eye className="size-4" aria-hidden="true" />
            View Certificate
          </Button>
        </Link>
        <Button
          size="sm"
          className="flex-1"
          onClick={() => void download()}
          isLoading={isDownloading}
        >
          <Download className="size-4" aria-hidden="true" />
          Download
        </Button>
      </div>
    </article>
  );
};
