import { Request, Response } from "express";
import mongoose from "mongoose";
import { Course } from "../models/course.model";
import {
  certificateFileName,
  renderCertificatePdf,
} from "../services/certificate-pdf.service";
import * as certificatesService from "../services/certificates.service";
import { getCourseCompletionStatistics } from "../services/course-completion.service";
import { canManageCourse } from "../services/courses.service";
import { ApiError } from "../utils/ApiError";
import { CertificateListQuery } from "../validators/certificates.validators";
import { param, requireActor, requireViewer } from "../utils/requestContext";

export const listCertificates = async (req: Request, res: Response): Promise<void> => {
  const query = res.locals.query as CertificateListQuery;
  const { certificates, pagination } = await certificatesService.listCertificates(
    query,
    requireViewer(req)
  );
  res.status(200).json({
    success: true,
    message: "Certificates retrieved",
    data: certificates,
    pagination,
  });
};

export const getCertificate = async (req: Request, res: Response): Promise<void> => {
  const certificate = await certificatesService.getCertificate(
    param(req, "id"),
    requireViewer(req)
  );
  res.status(200).json({
    success: true,
    message: "Certificate retrieved",
    data: { certificate },
  });
};

export const downloadCertificate = async (req: Request, res: Response): Promise<void> => {
  const certificate = await certificatesService.getCertificateDocument(
    param(req, "id"),
    requireViewer(req)
  );
  const pdf = await renderCertificatePdf(certificate);

  res.status(200);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${certificateFileName(certificate)}"`
  );
  res.setHeader("Content-Length", pdf.length);
  res.send(pdf);
};

/** Public — no authentication, and only certificate-face data is returned. */
export const verifyCertificate = async (req: Request, res: Response): Promise<void> => {
  const verification = await certificatesService.verifyCertificate(
    param(req, "verificationCode")
  );
  res.status(200).json({
    success: true,
    message: verification.valid
      ? "Certificate verified"
      : "Certificate could not be verified",
    data: verification,
  });
};

export const setCertificateStatus = async (req: Request, res: Response): Promise<void> => {
  const certificate = await certificatesService.setCertificateStatus(
    param(req, "id"),
    req.body,
    requireActor(req)
  );
  res.status(200).json({
    success: true,
    message:
      certificate.status === "revoked" ? "Certificate revoked" : "Certificate restored",
    data: { certificate },
  });
};

/** Completion and certificate counts for one course — admin or its instructor. */
export const courseCompletionStatistics = async (
  req: Request,
  res: Response
): Promise<void> => {
  const viewer = requireViewer(req);
  const courseId = param(req, "courseId");

  if (!mongoose.isValidObjectId(courseId)) {
    throw ApiError.badRequest("Invalid course id");
  }
  const course = await Course.findById(courseId);
  if (!course) {
    throw ApiError.notFound("Course not found");
  }
  if (!canManageCourse(course, viewer)) {
    throw ApiError.forbidden("You can only view statistics for your own courses.");
  }

  const statistics = await getCourseCompletionStatistics(course._id);
  res.status(200).json({
    success: true,
    message: "Completion statistics retrieved",
    data: statistics,
  });
};
