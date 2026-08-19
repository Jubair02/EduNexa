import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { AuthContext, type AuthContextValue } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import type { User } from "@/types";
import { makeAdmin, makeAuthValue, makeUser } from "./helpers";

const renderShell = (
  user: User,
  { authValue, entry = "/student/dashboard" }: { authValue?: AuthContextValue; entry?: string } = {}
) =>
  render(
    <AuthContext.Provider value={authValue ?? makeAuthValue(user)}>
      <ToastProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route element={<DashboardLayout />}>
              <Route path="/student/dashboard" element={<div>student home</div>} />
              <Route path="/student/courses" element={<div>my courses page</div>} />
              <Route path="/admin/dashboard" element={<div>admin home</div>} />
              <Route path="/courses" element={<div>catalog page</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthContext.Provider>
  );

const student = makeUser({ role: "student", firstName: "Sam", lastName: "Student" });

describe("Sidebar navigation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the student's navigation and no admin-only entries", () => {
    renderShell(student);
    const nav = screen.getByRole("navigation", { name: "Main" });

    for (const label of [
      "Dashboard",
      "My Courses",
      "Browse Courses",
      "My Progress",
      "Quizzes",
      "Certificates",
      "Settings",
      "Help & Support",
    ]) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }

    expect(within(nav).queryByText("Users")).not.toBeInTheDocument();
    expect(within(nav).queryByText("Enrollments")).not.toBeInTheDocument();
  });

  it("renders admin-only navigation for an admin", () => {
    renderShell(makeAdmin(), { entry: "/admin/dashboard" });
    const nav = screen.getByRole("navigation", { name: "Main" });

    expect(within(nav).getByText("Users")).toBeInTheDocument();
    expect(within(nav).getByText("Enrollments")).toBeInTheDocument();
  });

  it("marks the current route as active and links the rest", () => {
    renderShell(student);
    const nav = screen.getByRole("navigation", { name: "Main" });

    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(within(nav).getByRole("link", { name: "My Courses" })).toHaveAttribute(
      "href",
      "/student/courses"
    );
  });

  it("links every shipped feature instead of marking it as coming soon", () => {
    renderShell(student);
    const nav = screen.getByRole("navigation", { name: "Main" });

    for (const [label, href] of [
      ["My Progress", "/student/progress"],
      ["Quizzes", "/student/quizzes"],
      ["Certificates", "/student/certificates"],
    ]) {
      expect(within(nav).getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
  });

  it("renders unbuilt entries as disabled rather than dead links", () => {
    renderShell(student);
    const nav = screen.getByRole("navigation", { name: "Main" });

    expect(within(nav).queryByRole("link", { name: /Settings/ })).not.toBeInTheDocument();
    expect(within(nav).getByText("Settings").closest("[aria-disabled]")).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(within(nav).getAllByText("Soon").length).toBeGreaterThan(0);
  });

  it("collapses to icons only and remembers the choice", async () => {
    renderShell(student);

    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).queryByText("Dashboard")).not.toBeInTheDocument();
    // The icon row keeps its accessible name even without a visible label.
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(localStorage.getItem("lms_sidebar_collapsed")).toBe("true");
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });

  it("starts collapsed when that was the stored preference", () => {
    localStorage.setItem("lms_sidebar_collapsed", "true");
    renderShell(student);

    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });
});

describe("Mobile navigation drawer", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("opens from the hamburger and closes on Escape", async () => {
    renderShell(student);

    expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    const drawer = await screen.findByRole("dialog", { name: "Navigation" });
    expect(within(drawer).getByText("Role: Student")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();
  });

  it("closes when a destination is chosen", async () => {
    renderShell(student);

    await userEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    const drawer = await screen.findByRole("dialog", { name: "Navigation" });

    await userEvent.click(within(drawer).getByRole("link", { name: "My Courses" }));

    expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();
    expect(screen.getByText("my courses page")).toBeInTheDocument();
  });
});

describe("Top navbar", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("sends a course search to the catalog", async () => {
    renderShell(student);

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search courses" }),
      "react{enter}"
    );

    expect(screen.getByText("catalog page")).toBeInTheDocument();
  });

  it("offers notifications and messages with honest empty states", async () => {
    renderShell(student);

    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(
      await screen.findByRole("dialog", { name: "Notifications" })
    ).toBeInTheDocument();
    expect(screen.getByText(/You're all caught up/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Messages" }));
    expect(screen.getByText(/No messages yet/)).toBeInTheDocument();
  });

  it("signs out from the profile menu", async () => {
    const authValue = makeAuthValue(student);
    renderShell(student, { authValue });

    // The navbar and the sidebar footer both expose the account menu in jsdom.
    await userEvent.click(
      screen.getAllByRole("button", { name: /Account menu for Sam Student/ })[0]
    );

    const menu = await screen.findByRole("menu", { name: "Account" });
    expect(within(menu).getByText(student.email)).toBeInTheDocument();

    await userEvent.click(within(menu).getByRole("menuitem", { name: /Sign out/ }));
    expect(authValue.logout).toHaveBeenCalled();
  });

  it("provides a skip link to the main content", () => {
    renderShell(student);

    expect(
      screen.getByRole("link", { name: "Skip to main content" })
    ).toHaveAttribute("href", "#main-content");
  });
});
