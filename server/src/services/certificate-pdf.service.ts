/**
 * Renders a certificate to PDF with pdfkit. Nothing is persisted — the file is
 * built in memory on each request, so no generated binaries live in MongoDB or
 * on disk. Only pdfkit's built-in fonts are used, so there are no font assets
 * to ship.
 */
import PDFDocument from "pdfkit";
import { env } from "../config/env";
import { CertificateDocument, CertificateStatus } from "../models/certificate.model";

const COLORS = {
  aubergine: "#2a1e2f",
  primary: "#b02a50",
  amber: "#e8a33d",
  ink: "#231a26",
  muted: "#6e6472",
  paper: "#faf7f4",
  danger: "#b3261e",
};

/** CLIENT_URL may hold a comma-separated list; the first entry is canonical. */
const clientOrigin = (): string =>
  (env.CLIENT_URL.split(",")[0] ?? "").trim().replace(/\/$/, "");

const verificationUrl = (verificationCode: string): string =>
  `${clientOrigin()}/verify/certificate/${verificationCode}`;

const formatDate = (value: Date): string =>
  value.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

/** A4 landscape, printable, centred layout. */
export const renderCertificatePdf = (certificate: CertificateDocument): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 0,
      info: {
        Title: `Certificate ${certificate.certificateNumber}`,
        Author: "EduNexa",
        Subject: certificate.courseTitle,
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const width = doc.page.width;
    const height = doc.page.height;
    const centre = (text: string, y: number, size: number, color: string, font: string) => {
      doc.font(font).fontSize(size).fillColor(color).text(text, 0, y, {
        align: "center",
        width,
      });
    };

    // Background and border
    doc.rect(0, 0, width, height).fill(COLORS.paper);
    doc.lineWidth(6).strokeColor(COLORS.aubergine).rect(22, 22, width - 44, height - 44).stroke();
    doc.lineWidth(1).strokeColor(COLORS.amber).rect(34, 34, width - 68, height - 68).stroke();

    // Brand mark: the petal shape used across the app, drawn as a quarter-round.
    const markX = width / 2 - 9;
    doc.save();
    doc.translate(markX, 62);
    doc.path("M 0 9 A 9 9 0 1 1 18 9 L 18 18 L 0 18 Z").fill(COLORS.aubergine);
    doc.restore();
    centre("EduNexa", 88, 13, COLORS.aubergine, "Helvetica-Bold");

    centre("Certificate of Completion", 132, 34, COLORS.primary, "Times-Bold");
    doc
      .moveTo(width / 2 - 70, 178)
      .lineTo(width / 2 + 70, 178)
      .lineWidth(2)
      .strokeColor(COLORS.amber)
      .stroke();

    centre("This certificate is proudly presented to", 200, 12, COLORS.muted, "Helvetica");
    centre(certificate.studentName, 224, 32, COLORS.ink, "Times-Bold");

    centre("for successfully completing", 278, 12, COLORS.muted, "Helvetica");
    centre(certificate.courseTitle, 300, 20, COLORS.aubergine, "Times-Bold");

    // Two-column detail block
    const detailY = 356;
    const leftX = 110;
    const rightX = width / 2 + 30;
    const columnWidth = width / 2 - 140;
    const detail = (label: string, value: string, x: number, y: number) => {
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(COLORS.muted)
        .text(label.toUpperCase(), x, y, { width: columnWidth });
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor(COLORS.ink)
        .text(value, x, y + 13, { width: columnWidth });
    };

    detail("Instructor", certificate.instructorName, leftX, detailY);
    detail("Completion date", formatDate(certificate.completionDate), rightX, detailY);
    detail("Certificate number", certificate.certificateNumber, leftX, detailY + 46);
    detail("Issue date", formatDate(certificate.issuedAt), rightX, detailY + 46);

    if (certificate.status === CertificateStatus.REVOKED) {
      centre("THIS CERTIFICATE HAS BEEN REVOKED", detailY + 96, 13, COLORS.danger, "Helvetica-Bold");
    }

    // Verification footer
    const footerY = height - 84;
    doc
      .moveTo(leftX, footerY - 14)
      .lineTo(width - leftX, footerY - 14)
      .lineWidth(0.5)
      .strokeColor(COLORS.muted)
      .stroke();
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.muted)
      .text(`Verification code: ${certificate.verificationCode}`, leftX, footerY, {
        width: width - leftX * 2,
      });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.primary)
      .text(`Verify at ${verificationUrl(certificate.verificationCode)}`, leftX, footerY + 13, {
        width: width - leftX * 2,
      });

    doc.end();
  });

export const certificateFileName = (certificate: CertificateDocument): string =>
  `${certificate.certificateNumber}.pdf`;
