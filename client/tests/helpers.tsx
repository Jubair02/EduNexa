import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import type { Course, User, UserRole } from "@/types";

let userCounter = 0;

export const makeUser = (overrides: Partial<User> = {}): User => {
  userCounter += 1;
  return {
    id: `user-${userCounter}`,
    firstName: "Test",
    lastName: `User${userCounter}`,
    email: `user${userCounter}@example.com`,
    role: "student",
    isActive: true,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
};

export const makeAdmin = (overrides: Partial<User> = {}): User =>
  makeUser({ role: "admin" as UserRole, firstName: "Admin", ...overrides });

let courseCounter = 0;

export const makeCourse = (overrides: Partial<Course> = {}): Course => {
  courseCounter += 1;
  return {
    id: `course-${courseCounter}`,
    title: `Course ${courseCounter}`,
    slug: `course-${courseCounter}`,
    description: "A course description that is long enough for the catalog.",
    shortDescription: "A short line.",
    category: "programming",
    level: "beginner",
    duration: 120,
    status: "draft",
    instructor: {
      id: "instructor-1",
      firstName: "Ina",
      lastName: "Structor",
      email: "ina@example.com",
    },
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
};

export const makeAuthValue = (user: User | null): AuthContextValue => ({
  user,
  isAuthenticated: user !== null,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  updateProfile: vi.fn(),
});

interface RenderOptions {
  authUser?: User | null;
  initialEntries?: string[];
  /**
   * A ready-made context value, for tests that need to assert on one of its
   * functions (e.g. updateProfile). Takes precedence over `authUser`.
   */
  authValue?: AuthContextValue;
}

export const renderWithProviders = (
  ui: ReactElement,
  { authUser = makeAdmin(), initialEntries = ["/"], authValue }: RenderOptions = {}
) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider value={authValue ?? makeAuthValue(authUser)}>
      <ToastProvider>
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      </ToastProvider>
    </AuthContext.Provider>
  );
  return render(ui, { wrapper });
};
