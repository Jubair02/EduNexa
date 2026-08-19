import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthContext } from "@/context/AuthContext";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import { makeAdmin, makeAuthValue, makeUser } from "./helpers";

const renderGuarded = (authUser: ReturnType<typeof makeUser> | null) =>
  render(
    <AuthContext.Provider value={makeAuthValue(authUser)}>
      <MemoryRouter initialEntries={["/admin/dashboard"]}>
        <Routes>
          <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
            <Route path="/admin/dashboard" element={<div>admin secret</div>} />
          </Route>
          <Route path="/student/dashboard" element={<div>student home</div>} />
          <Route path="/instructor/dashboard" element={<div>instructor home</div>} />
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );

describe("ProtectedRoute", () => {
  it("lets an admin into admin routes", () => {
    renderGuarded(makeAdmin());
    expect(screen.getByText("admin secret")).toBeInTheDocument();
  });

  it("redirects a student away from admin routes to their own dashboard", () => {
    renderGuarded(makeUser({ role: "student" }));
    expect(screen.getByText("student home")).toBeInTheDocument();
    expect(screen.queryByText("admin secret")).not.toBeInTheDocument();
  });

  it("redirects an instructor away from admin routes", () => {
    renderGuarded(makeUser({ role: "instructor" }));
    expect(screen.getByText("instructor home")).toBeInTheDocument();
  });

  it("redirects unauthenticated visitors to the login page", () => {
    renderGuarded(null);
    expect(screen.getByText("login page")).toBeInTheDocument();
  });
});
