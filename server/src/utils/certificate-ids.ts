import { randomBytes } from "node:crypto";
import { Certificate } from "../models/certificate.model";

/** No 0/O/1/I — the code has to survive being read off a printed page. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 16;

/**
 * Public verification identifier: 16 characters from a 32-symbol alphabet
 * (80 bits), so certificates can't be found by guessing. Internal Mongo ids
 * are never exposed for this purpose.
 */
export const generateVerificationCode = (): string => {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  }
  return code;
};

/**
 * Human-readable number, sequential within the issue year: LMS-2026-000001.
 * Collisions are additionally prevented by the unique index plus a retry, so a
 * race between two issuers can never produce the same number twice.
 */
export const nextCertificateNumber = async (year: number): Promise<string> => {
  const prefix = `LMS-${year}-`;
  const latest = await Certificate.findOne({
    certificateNumber: new RegExp(`^${prefix}\\d+$`),
  })
    .sort({ certificateNumber: -1 })
    .select("certificateNumber");

  const lastSequence = latest
    ? Number.parseInt(latest.certificateNumber.slice(prefix.length), 10)
    : 0;
  const next = Number.isNaN(lastSequence) ? 1 : lastSequence + 1;

  return `${prefix}${String(next).padStart(6, "0")}`;
};
