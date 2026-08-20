import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NAV_BY_ROLE } from "@/components/layout/navConfig";
import { AdminAuditLogPage } from "@/pages/admin/AdminAuditLogPage";
import { auditService } from "@/services/audit.service";
import type { AuditListResult, AuditLogEntry } from "@/types";
import { makeAdmin, renderWithProviders } from "./helpers";

vi.mock("@/services/audit.service", () => ({
  auditService: { list: vi.fn() },
}));

const mockedAudit = vi.mocked(auditService);

let entryCounter = 0;

const makeEntry = (overrides: Partial<AuditLogEntry> = {}): AuditLogEntry => {
  entryCounter += 1;
  return {
    id: `entry-${entryCounter}`,
    action: "user.role_changed",
    summary: "Changed Sam Student (sam@example.com) from student to instructor",
    actor: {
      id: "admin-1",
      name: "Ada Admin",
      email: "ada@example.com",
      role: "admin",
    },
    target: { type: "user", id: "user-1", label: "Sam Student (sam@example.com)" },
    changes: [{ field: "role", from: "student", to: "instructor" }],
    metadata: {},
    ip: "203.0.113.7",
    userAgent: "Mozilla/5.0 (Test Runner)",
    createdAt: "2026-08-20T09:30:00.000Z",
    ...overrides,
  };
};

const result = (logs: AuditLogEntry[], total = logs.length): AuditListResult => ({
  logs,
  pagination: { page: 1, limit: 20, total, totalPages: Math.ceil(total / 20) },
});

const renderPage = () =>
  renderWithProviders(<AdminAuditLogPage />, { authUser: makeAdmin() });

/**
 * The page renders a table for wide viewports and cards for narrow ones. Under
 * jsdom no CSS applies, so both are in the document and every entry matches
 * twice — hence `findAllByText` throughout rather than the singular form.
 */
beforeEach(() => {
  vi.clearAllMocks();
  mockedAudit.list.mockResolvedValue(result([makeEntry()]));
});

describe("AdminAuditLogPage", () => {
  it("shows who acted, what the action was, and which values moved", async () => {
    renderPage();

    expect((await screen.findAllByText("Ada Admin")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("ada@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Role changed").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/from student to instructor/).length
    ).toBeGreaterThan(0);
    // The change row spells out the transition on its own.
    expect(screen.getAllByText("role").length).toBeGreaterThan(0);
  });

  it("keeps naming the actor after their account is gone", async () => {
    mockedAudit.list.mockResolvedValue(
      result([
        makeEntry({
          action: "user.deleted",
          actor: {
            id: null,
            name: "Mal Feasance",
            email: "mal@example.com",
            role: "admin",
          },
          summary: "Deleted student account Sam Student (sam@example.com)",
          changes: [],
        }),
      ])
    );

    renderPage();

    expect((await screen.findAllByText("Mal Feasance")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("User deleted").length).toBeGreaterThan(0);
  });

  it("hides the accounts swept up by a bulk delete behind a disclosure", async () => {
    mockedAudit.list.mockResolvedValue(
      result([
        makeEntry({
          action: "users.bulk_deleted",
          summary: "Deleted 2 accounts",
          changes: [],
          metadata: {
            requested: 2,
            affected: 2,
            accounts: [
              "One Student (one@example.com) — student",
              "Two Student (two@example.com) — student",
            ],
          },
        }),
      ])
    );

    renderPage();

    const summaries = await screen.findAllByText(/2 accounts and request details/);
    const details = summaries[0].closest("details");

    // Collapsed to begin with: the list is investigation detail, not scan
    // detail. A closed <details> keeps its children in the DOM, so the state
    // being asserted is the element's own, not whether the text exists.
    expect(details).not.toHaveAttribute("open");

    await userEvent.click(summaries[0]);

    expect(details).toHaveAttribute("open");
    expect(
      within(details as HTMLElement).getByText(/One Student \(one@example\.com\)/)
    ).toBeInTheDocument();
  });

  it("records the originating IP for an entry", async () => {
    renderPage();

    const disclosures = await screen.findAllByText("Request details");
    await userEvent.click(disclosures[0]);

    expect(screen.getAllByText("203.0.113.7").length).toBeGreaterThan(0);
  });

  it("asks the server for a single action when the filter narrows", async () => {
    renderPage();
    await screen.findAllByText("Ada Admin");

    await userEvent.selectOptions(
      screen.getByLabelText("Filter by action"),
      "user.password_reset"
    );

    await waitFor(() =>
      expect(mockedAudit.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: "user.password_reset", page: 1 })
      )
    );
  });

  it("passes a date range through to the server", async () => {
    renderPage();
    await screen.findAllByText("Ada Admin");

    await userEvent.type(screen.getByLabelText("From date"), "2026-08-01");

    await waitFor(() =>
      expect(mockedAudit.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: "2026-08-01" })
      )
    );
  });

  it("debounces the search box into one request", async () => {
    renderPage();
    await screen.findAllByText("Ada Admin");
    mockedAudit.list.mockClear();

    await userEvent.type(screen.getByLabelText("Search the audit log"), "mal");

    await waitFor(() =>
      expect(mockedAudit.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "mal", page: 1 })
      )
    );
    expect(mockedAudit.list).toHaveBeenCalledTimes(1);
  });

  it("explains an empty view rather than showing a bare table", async () => {
    mockedAudit.list.mockResolvedValue(result([]));
    renderPage();

    expect(await screen.findByText("Nothing recorded for this view.")).toBeInTheDocument();
  });

  it("surfaces the server's reason when a request is rejected", async () => {
    mockedAudit.list.mockRejectedValue(
      new Error("The start of the range must not be after its end")
    );
    renderPage();

    expect(
      await screen.findByText("The start of the range must not be after its end")
    ).toBeInTheDocument();
  });

  it("offers no control other than paging — the log is not editable", async () => {
    // Enough entries to bring up pagination, so the assertion is that these
    // are the *only* buttons rather than that the page happens to have none.
    mockedAudit.list.mockResolvedValue(result([makeEntry()], 40));
    renderPage();
    await screen.findAllByText("Ada Admin");

    const names = screen
      .getAllByRole("button")
      .map((button) => button.textContent?.trim());
    expect(names).toEqual(["Previous", "Next"]);
  });
});

describe("audit log navigation", () => {
  it("is offered to admins only", () => {
    const adminEntry = NAV_BY_ROLE.admin.primary.find(
      (item) => item.to === "/admin/audit-log"
    );
    expect(adminEntry?.label).toBe("Audit Log");

    for (const role of ["student", "instructor"] as const) {
      const nav = NAV_BY_ROLE[role];
      expect(
        [...nav.primary, ...nav.secondary].some((item) =>
          item.to.includes("audit-log")
        )
      ).toBe(false);
    }
  });
});

describe("audit log table semantics", () => {
  it("labels its columns so the log is readable by row", async () => {
    renderPage();
    await screen.findAllByText("Ada Admin");

    const table = screen.getByRole("table");
    for (const heading of ["When", "Who", "Action", "What happened"]) {
      expect(within(table).getByText(heading)).toBeInTheDocument();
    }
  });
});
