import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { AdminCertificatesPage } from "@/pages/admin/AdminCertificatesPage";
import { StudentCertificatesPage } from "@/pages/certificates/StudentCertificatesPage";
import { VerifyCertificatePage } from "@/pages/certificates/VerifyCertificatePage";
import { certificatesService } from "@/services/certificates.service";
import { coursesService } from "@/services/courses.service";
import type { Certificate, CertificateVerification } from "@/types";
import { makeAdmin, makeAuthValue, makeUser, renderWithProviders } from "./helpers";

vi.mock("@/services/certificates.service", () => ({
  certificatesService: {
    list: vi.fn(),
    get: vi.fn(),
    download: vi.fn(),
    verify: vi.fn(),
    setStatus: vi.fn(),
    courseCompletionStatistics: vi.fn(),
  },
}));
vi.mock("@/services/courses.service", () => ({
  coursesService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    remove: vi.fn(),
    statistics: vi.fn(),
  },
}));

const mocked = vi.mocked(certificatesService);
const mockedCourses = vi.mocked(coursesService);

const student = makeUser({ role: "student", firstName: "Jubair", lastName: "Hossain" });

const makeCertificate = (overrides: Partial<Certificate> = {}): Certificate => ({
  id: "cert-1",
  certificateNumber: "LMS-2026-000001",
  verificationCode: "ABCDEFGH23456789",
  status: "active",
  issuedAt: "2026-08-19T10:00:00.000Z",
  completionDate: "2026-08-19T09:00:00.000Z",
  studentName: "Jubair Hossain",
  courseTitle: "React Fundamentals",
  instructorName: "Ina Structor",
  course: { id: "c-1", title: "React Fundamentals", slug: "react-fundamentals" },
  student: {
    id: "s-1",
    firstName: "Jubair",
    lastName: "Hossain",
    email: "jubair@example.com",
  },
  createdAt: "2026-08-19T10:00:00.000Z",
  updatedAt: "2026-08-19T10:00:00.000Z",
  ...overrides,
});

const listResult = (certificates: Certificate[], limit = 9) => ({
  certificates,
  pagination: { page: 1, limit, total: certificates.length, totalPages: 1 },
});

describe("StudentCertificatesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists earned certificates with their number and actions", async () => {
    mocked.list.mockResolvedValue(listResult([makeCertificate()]));

    renderWithProviders(<StudentCertificatesPage />, { authUser: student });

    expect(await screen.findByText("React Fundamentals")).toBeInTheDocument();
    expect(screen.getByText("LMS-2026-000001")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View Certificate/ })).toHaveAttribute(
      "href",
      "/verify/certificate/ABCDEFGH23456789"
    );
    expect(screen.getByRole("button", { name: /Download/ })).toBeInTheDocument();
  });

  it("shows the empty state before any course is finished", async () => {
    mocked.list.mockResolvedValue(listResult([]));

    renderWithProviders(<StudentCertificatesPage />, { authUser: student });

    expect(
      await screen.findByText("You haven't earned any certificates yet.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Complete a course to earn your first certificate.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Browse Courses/ })).toBeInTheDocument();
  });

  it("downloads the PDF through the authenticated service", async () => {
    mocked.list.mockResolvedValue(listResult([makeCertificate()]));
    mocked.download.mockResolvedValue(undefined);

    renderWithProviders(<StudentCertificatesPage />, { authUser: student });

    await userEvent.click(await screen.findByRole("button", { name: /Download/ }));

    await waitFor(() => {
      expect(mocked.download).toHaveBeenCalledWith("cert-1", "LMS-2026-000001.pdf");
    });
    expect(await screen.findByText("Certificate downloaded")).toBeInTheDocument();
  });

  it("surfaces a failed download without losing the page", async () => {
    mocked.list.mockResolvedValue(listResult([makeCertificate()]));
    mocked.download.mockRejectedValue(new Error("Network unreachable"));

    renderWithProviders(<StudentCertificatesPage />, { authUser: student });

    await userEvent.click(await screen.findByRole("button", { name: /Download/ }));

    expect(await screen.findByText("Network unreachable")).toBeInTheDocument();
    expect(screen.getByText("React Fundamentals")).toBeInTheDocument();
  });

  it("marks a revoked certificate on the card", async () => {
    mocked.list.mockResolvedValue(listResult([makeCertificate({ status: "revoked" })]));

    renderWithProviders(<StudentCertificatesPage />, { authUser: student });

    expect(await screen.findByText("Revoked")).toBeInTheDocument();
  });

  it("shows an error state with retry", async () => {
    mocked.list.mockRejectedValueOnce(new Error("boom"));
    mocked.list.mockResolvedValueOnce(listResult([makeCertificate()]));

    renderWithProviders(<StudentCertificatesPage />, { authUser: student });

    expect(
      await screen.findByText("Unable to load your certificates.")
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("React Fundamentals")).toBeInTheDocument();
  });
});

describe("VerifyCertificatePage", () => {
  const renderVerify = (code: string, authUser = null) =>
    render(
      <AuthContext.Provider value={makeAuthValue(authUser)}>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/verify/certificate/${code}`]}>
            <Routes>
              <Route
                path="/verify/certificate/:verificationCode"
                element={<VerifyCertificatePage />}
              />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthContext.Provider>
    );

  const verification = (
    overrides: Partial<CertificateVerification> = {}
  ): CertificateVerification => ({
    valid: true,
    certificateNumber: "LMS-2026-000001",
    studentName: "Jubair Hossain",
    courseTitle: "React Fundamentals",
    instructorName: "Ina Structor",
    completionDate: "2026-08-19T09:00:00.000Z",
    issuedAt: "2026-08-19T10:00:00.000Z",
    status: "active",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("confirms a valid certificate without any session", async () => {
    mocked.verify.mockResolvedValue(verification());

    renderVerify("ABCDEFGH23456789");

    expect(await screen.findByText("Valid Certificate")).toBeInTheDocument();
    expect(screen.getByText("LMS-2026-000001")).toBeInTheDocument();
    expect(screen.getByText("Jubair Hossain")).toBeInTheDocument();
    expect(screen.getByText("React Fundamentals")).toBeInTheDocument();
    expect(screen.getByText("Ina Structor")).toBeInTheDocument();
    expect(mocked.verify).toHaveBeenCalledWith("ABCDEFGH23456789");
  });

  it("reports an unknown code as invalid", async () => {
    mocked.verify.mockResolvedValue({ valid: false });

    renderVerify("NOPE");

    expect(
      await screen.findByText("Certificate not found or invalid.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Valid Certificate")).not.toBeInTheDocument();
  });

  it("explains a revoked certificate rather than calling it valid", async () => {
    mocked.verify.mockResolvedValue(verification({ valid: false, status: "revoked" }));

    renderVerify("ABCDEFGH23456789");

    expect(
      await screen.findByText("This certificate has been revoked.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Valid Certificate")).not.toBeInTheDocument();
    // The identifying details still show so the holder can be told what failed.
    expect(screen.getByText("LMS-2026-000001")).toBeInTheDocument();
  });

  it("shows an error state when verification cannot be reached", async () => {
    mocked.verify.mockRejectedValue(new Error("offline"));

    renderVerify("ABCDEFGH23456789");

    expect(
      await screen.findByText("Certificate could not be verified.")
    ).toBeInTheDocument();
  });
});

describe("AdminCertificatesPage", () => {
  const renderAdmin = () =>
    renderWithProviders(<AdminCertificatesPage />, { authUser: makeAdmin() });

  beforeEach(() => {
    vi.clearAllMocks();
    mockedCourses.list.mockResolvedValue({
      courses: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });
  });

  it("lists every certificate with its student and course", async () => {
    mocked.list.mockResolvedValue(listResult([makeCertificate()], 10));

    renderAdmin();

    // Table and card list both render in jsdom, so scope to the table.
    const table = await screen.findByRole("table");
    expect(within(table).getByText("LMS-2026-000001")).toBeInTheDocument();
    expect(within(table).getByText("Jubair Hossain")).toBeInTheDocument();
    expect(within(table).getByText("jubair@example.com")).toBeInTheDocument();
    expect(within(table).getByText("React Fundamentals")).toBeInTheDocument();
    // Scoped to the table: "Active" is also a status filter option.
    expect(within(table).getByText("Active")).toBeInTheDocument();
  });

  it("repeats each certificate as a card for phones", async () => {
    mocked.list.mockResolvedValue(listResult([makeCertificate()], 10));

    renderAdmin();

    const cards = await screen.findByRole("list", { name: "Certificates" });
    const row = within(cards).getAllByRole("listitem")[0];
    expect(row).toHaveTextContent("Jubair Hossain");
    expect(row).toHaveTextContent("React Fundamentals");
    expect(row).toHaveTextContent("LMS-2026-000001");
    // The same three actions are reachable without the table.
    expect(
      within(row).getByRole("button", { name: /Revoke LMS-2026-000001/ })
    ).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: /Download LMS-2026-000001/ })
    ).toBeInTheDocument();
    expect(
      within(row).getByRole("link", { name: /View LMS-2026-000001/ })
    ).toBeInTheDocument();
  });

  it("revokes a certificate after confirmation", async () => {
    mocked.list.mockResolvedValue(listResult([makeCertificate()], 10));
    mocked.setStatus.mockResolvedValue(makeCertificate({ status: "revoked" }));

    renderAdmin();

    const table = await screen.findByRole("table");
    await userEvent.click(
      within(table).getByRole("button", { name: /Revoke LMS-2026-000001/ })
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/stays visible to the student/)
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Revoke" }));

    await waitFor(() => {
      expect(mocked.setStatus).toHaveBeenCalledWith("cert-1", "revoked");
    });
    expect(await screen.findByText("Certificate revoked")).toBeInTheDocument();
  });

  it("restores a revoked certificate", async () => {
    mocked.list.mockResolvedValue(
      listResult([makeCertificate({ status: "revoked" })], 10)
    );
    mocked.setStatus.mockResolvedValue(makeCertificate({ status: "active" }));

    renderAdmin();

    const table = await screen.findByRole("table");
    await userEvent.click(
      within(table).getByRole("button", { name: /Restore LMS-2026-000001/ })
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Restore" }));

    await waitFor(() => {
      expect(mocked.setStatus).toHaveBeenCalledWith("cert-1", "active");
    });
    expect(await screen.findByText("Certificate restored")).toBeInTheDocument();
  });

  it("filters by status and course", async () => {
    mocked.list.mockResolvedValue(listResult([], 10));

    renderAdmin();
    await screen.findByText("No certificates found.");

    await userEvent.selectOptions(screen.getByLabelText("Filter by status"), "revoked");
    await waitFor(() => {
      expect(mocked.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "revoked", page: 1 })
      );
    });
  });

  it("searches by student, course or number", async () => {
    mocked.list.mockResolvedValue(listResult([], 10));

    renderAdmin();
    await screen.findByText("No certificates found.");

    await userEvent.type(screen.getByLabelText("Search certificates"), "jubair");
    await waitFor(() => {
      expect(mocked.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "jubair" })
      );
    });
  });
});
