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
      ["Settings", "/settings"],
      ["Help & Support", "/help"],
    ]) {
      expect(within(nav).getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
  });

  it("has no dead or disabled rows left in any role's navigation", () => {
    for (const actor of [student, makeAdmin(), makeUser({ role: "instructor" })]) {
      const view = renderShell(actor, {
        entry: actor.role === "admin" ? "/admin/dashboard" : "/student/dashboard",
      });
      const nav = screen.getByRole("navigation", { name: "Main" });

      // Every row is a link with a real href — nothing disabled, nothing
      // labelled "Soon". `NavItem.to` is required, so this is type-enforced too.
      const links = within(nav).getAllByRole("link");
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        expect(link.getAttribute("href")).toMatch(/^\//);
      }
      expect(within(nav).queryByText("Soon")).not.toBeInTheDocument();
      expect(nav.querySelector("[aria-disabled]")).toBeNull();

      view.unmount();
    }
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

  it("switches the theme and remembers the choice", async () => {
    renderShell(student);

    // Nothing is stamped on <html> until a choice is made — the operating
    // system decides by default.
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("lms_theme")).toBe("dark");

    await userEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("lms_theme")).toBe("light");
  });

  it("advertises no feature that does not exist", () => {
    renderShell(student);

    // Direct messaging was never built; a panel promising it is worse than
    // nothing. Notifications are a real feature and live in their own bell.
    expect(screen.queryByRole("button", { name: "Messages" })).not.toBeInTheDocument();
  });

  it("signs out from the profile menu", async () => {
    const authValue = makeAuthValue(student);
    renderShell(student, { authValue });

    // The sidebar footer is the only place the account menu lives; in jsdom the
    // desktop rail and the (closed) drawer are not both mounted, so this is one
    // element rather than a list.
    await userEvent.click(
      screen.getByRole("button", { name: /Account menu for Sam Student/ })
    );

    const menu = await screen.findByRole("menu", { name: "Account" });
    expect(within(menu).getByText(student.email)).toBeInTheDocument();

    await userEvent.click(within(menu).getByRole("menuitem", { name: /Sign out/ }));
    expect(authValue.logout).toHaveBeenCalled();
  });

  it("offers the account menu once, from the sidebar rather than the navbar", () => {
    renderShell(student);

    // Two copies of the same control on one screen is the thing being
    // prevented: the navbar used to carry its own alongside the sidebar's.
    const menus = screen.getAllByRole("button", {
      name: /Account menu for Sam Student/,
    });
    expect(menus).toHaveLength(1);

    // And it is the sidebar's — the navbar header must not contain it.
    expect(
      within(screen.getByRole("banner")).queryByRole("button", {
        name: /Account menu for Sam Student/,
      })
    ).not.toBeInTheDocument();
  });

  it("provides a skip link to the main content", () => {
    renderShell(student);

    expect(
      screen.getByRole("link", { name: "Skip to main content" })
    ).toHaveAttribute("href", "#main-content");
  });
});
