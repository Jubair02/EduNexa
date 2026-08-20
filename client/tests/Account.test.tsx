import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ResetPasswordModal } from "@/components/ResetPasswordModal";
import { ApiRequestError } from "@/services/api";
import { authService } from "@/services/auth.service";
import { usersService } from "@/services/users.service";
import { ProfilePage } from "@/pages/account/ProfilePage";
import { SettingsPage } from "@/pages/account/SettingsPage";
import { makeAuthValue, makeUser, renderWithProviders } from "./helpers";

vi.mock("@/services/auth.service", () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
  },
}));
vi.mock("@/services/users.service", () => ({
  usersService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    resetPassword: vi.fn(),
    remove: vi.fn(),
    statistics: vi.fn(),
    recent: vi.fn(),
  },
}));

const mockedAuth = vi.mocked(authService);
const mockedUsers = vi.mocked(usersService);

const student = makeUser({
  role: "student",
  firstName: "Lea",
  lastName: "Learner",
  email: "lea@example.com",
});

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the current identity and disables saving until something changes", () => {
    renderWithProviders(<ProfilePage />, { authUser: student });

    expect(screen.getByDisplayValue("Lea")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Learner")).toBeInTheDocument();
    expect(screen.getByDisplayValue("lea@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Discard changes/ })).toBeDisabled();
  });

  it("saves a changed name through the auth context", async () => {
    const updateProfile = vi.fn().mockResolvedValue(makeUser({ firstName: "Leanne" }));
    const authValue = { ...makeAuthValue(student), updateProfile };

    renderWithProviders(<ProfilePage />, { authValue });

    const firstName = screen.getByDisplayValue("Lea");
    await userEvent.clear(firstName);
    await userEvent.type(firstName, "Leanne");
    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalledWith({
        firstName: "Leanne",
        lastName: "Learner",
        email: "lea@example.com",
      });
    });
    expect(await screen.findByText("Profile updated")).toBeInTheDocument();
  });

  it("validates before calling the API", async () => {
    const updateProfile = vi.fn();
    const authValue = { ...makeAuthValue(student), updateProfile };

    renderWithProviders(<ProfilePage />, { authValue });

    const email = screen.getByDisplayValue("lea@example.com");
    await userEvent.clear(email);
    await userEvent.type(email, "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("puts a taken email on the email field, not at the top of the page", async () => {
    const updateProfile = vi
      .fn()
      .mockRejectedValue(new ApiRequestError("Email is already registered", 409));
    const authValue = { ...makeAuthValue(student), updateProfile };

    renderWithProviders(<ProfilePage />, { authValue });

    const email = screen.getByDisplayValue("lea@example.com");
    await userEvent.clear(email);
    await userEvent.type(email, "taken@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    const message = await screen.findByText("Email is already registered");
    expect(message).toBeInTheDocument();
    // Rendered as a field error, so it is linked to the input for screen readers.
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("discards edits back to the saved values", async () => {
    renderWithProviders(<ProfilePage />, { authUser: student });

    const firstName = screen.getByDisplayValue("Lea");
    await userEvent.clear(firstName);
    await userEvent.type(firstName, "Temporary");
    await userEvent.click(screen.getByRole("button", { name: /Discard changes/ }));

    expect(screen.getByDisplayValue("Lea")).toBeInTheDocument();
  });

  it("says that role and status are an admin's to change", () => {
    renderWithProviders(<ProfilePage />, { authUser: student });

    expect(screen.getByText(/Only an administrator can change these/)).toBeInTheDocument();
    // There is no control for either.
    expect(screen.queryByLabelText(/^Role$/)).not.toBeInTheDocument();
  });
});

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const fillPasswords = async (current: string, next: string, confirm = next) => {
    await userEvent.type(screen.getByLabelText("Current password"), current);
    await userEvent.type(screen.getByLabelText("New password"), next);
    await userEvent.type(screen.getByLabelText("Confirm new password"), confirm);
  };

  it("changes the password and clears the form", async () => {
    mockedAuth.changePassword.mockResolvedValue();
    renderWithProviders(<SettingsPage />, { authUser: student });

    await fillPasswords("current-password", "a-brand-new-password");
    await userEvent.click(screen.getByRole("button", { name: /Change password/ }));

    await waitFor(() => {
      expect(mockedAuth.changePassword).toHaveBeenCalledWith({
        currentPassword: "current-password",
        newPassword: "a-brand-new-password",
      });
    });
    expect(await screen.findByText("Password changed")).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
  });

  it("catches a mismatch, a short password and reuse before calling the API", async () => {
    renderWithProviders(<SettingsPage />, { authUser: student });
    const submit = screen.getByRole("button", { name: /Change password/ });

    await fillPasswords("current-password", "a-brand-new-password", "different-confirm");
    await userEvent.click(submit);
    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("New password"));
    await userEvent.clear(screen.getByLabelText("Confirm new password"));
    await userEvent.type(screen.getByLabelText("New password"), "short");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "short");
    await userEvent.click(submit);
    expect(
      await screen.findByText("Must be at least 8 characters")
    ).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("New password"));
    await userEvent.clear(screen.getByLabelText("Confirm new password"));
    await userEvent.type(screen.getByLabelText("New password"), "current-password");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "current-password");
    await userEvent.click(submit);
    expect(
      await screen.findByText("Must be different from your current password")
    ).toBeInTheDocument();

    expect(mockedAuth.changePassword).not.toHaveBeenCalled();
  });

  it("shows a rejected current password on that field", async () => {
    mockedAuth.changePassword.mockRejectedValue(
      new ApiRequestError("Your current password is incorrect.", 401)
    );
    renderWithProviders(<SettingsPage />, { authUser: student });

    await fillPasswords("wrong-current-one", "a-brand-new-password");
    await userEvent.click(screen.getByRole("button", { name: /Change password/ }));

    expect(
      await screen.findByText("Your current password is incorrect.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });

  it("explains the recovery route while email reset does not exist", () => {
    renderWithProviders(<SettingsPage />, { authUser: student });

    expect(screen.getByText(/an administrator can set a new password/i)).toBeInTheDocument();
  });
});

describe("ResetPasswordModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const target = makeUser({ firstName: "Sam", lastName: "Student", id: "user-9" });

  it("generates a password, submits it, and reports back", async () => {
    mockedUsers.resetPassword.mockResolvedValue(target);
    const onReset = vi.fn();

    renderWithProviders(
      <ResetPasswordModal user={target} onClose={vi.fn()} onReset={onReset} />
    );

    await userEvent.click(screen.getByRole("button", { name: /Generate/ }));
    const field = screen.getByLabelText("New password");
    expect((field as HTMLInputElement).value.length).toBe(16);

    await userEvent.click(screen.getByRole("button", { name: /Reset password/ }));

    await waitFor(() => {
      expect(mockedUsers.resetPassword).toHaveBeenCalledWith(
        "user-9",
        (field as HTMLInputElement).value
      );
    });
    expect(onReset).toHaveBeenCalled();
  });

  it("warns that the password must be handed over directly", () => {
    renderWithProviders(
      <ResetPasswordModal user={target} onClose={vi.fn()} onReset={vi.fn()} />
    );

    expect(screen.getByText(/Share this password with Sam directly/)).toBeInTheDocument();
  });

  it("rejects a short password without calling the API", async () => {
    renderWithProviders(
      <ResetPasswordModal user={target} onClose={vi.fn()} onReset={vi.fn()} />
    );

    await userEvent.type(screen.getByLabelText("New password"), "short");
    await userEvent.click(screen.getByRole("button", { name: /Reset password/ }));

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(mockedUsers.resetPassword).not.toHaveBeenCalled();
  });
});

describe("ErrorBoundary", () => {
  const Boom = ({ error }: { error: Error }) => {
    throw error;
  };

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("shows a recovery screen instead of a blank page", () => {
    render(
      <ErrorBoundary>
        <Boom error={new Error("render exploded")} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reload the page/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Go to my dashboard/ })).toBeInTheDocument();
  });

  it("treats a failed route chunk as a stale deploy, not a crash", () => {
    const chunkError = new Error("Failed to fetch dynamically imported module: /assets/x.js");
    render(
      <ErrorBoundary>
        <Boom error={chunkError} />
      </ErrorBoundary>
    );

    expect(screen.getByText("A new version is available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reload the page/ })).toBeInTheDocument();
    // "Go home" would just fail again — reloading is the only useful action.
    expect(
      screen.queryByRole("button", { name: /Go to my dashboard/ })
    ).not.toBeInTheDocument();
  });

  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>
    );

    expect(screen.getByText("all good")).toBeInTheDocument();
  });
});
