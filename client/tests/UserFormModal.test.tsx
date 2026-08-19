import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserFormModal } from "@/components/UserFormModal";
import { usersService } from "@/services/users.service";
import { makeUser, renderWithProviders } from "./helpers";

vi.mock("@/services/users.service", () => ({
  usersService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    remove: vi.fn(),
    statistics: vi.fn(),
    recent: vi.fn(),
  },
}));

const mockedService = vi.mocked(usersService);

describe("UserFormModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("edit mode pre-fills fields, has a status select, and never shows a password field", () => {
    const user = makeUser({
      firstName: "Edit",
      lastName: "Me",
      email: "edit-me@example.com",
      role: "instructor",
      isActive: false,
    });

    renderWithProviders(
      <UserFormModal open user={user} onClose={() => {}} onSaved={() => {}} />
    );

    expect(screen.getByLabelText("First name")).toHaveValue("Edit");
    expect(screen.getByLabelText("Email")).toHaveValue("edit-me@example.com");
    expect(screen.getByLabelText("Role")).toHaveValue("instructor");
    expect(screen.getByLabelText("Status")).toHaveValue("inactive");
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("submits an update without any password field in the payload", async () => {
    const user = makeUser({ firstName: "Old", lastName: "Name" });
    mockedService.update.mockResolvedValue({ ...user, firstName: "New" });
    const onSaved = vi.fn();

    renderWithProviders(
      <UserFormModal open user={user} onClose={() => {}} onSaved={onSaved} />
    );

    const firstName = screen.getByLabelText("First name");
    await userEvent.clear(firstName);
    await userEvent.type(firstName, "New");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockedService.update).toHaveBeenCalledWith(user.id, {
        firstName: "New",
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      });
    });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ firstName: "New" }), "updated");
  });

  it("create mode requires a password of the minimum length", async () => {
    renderWithProviders(<UserFormModal open onClose={() => {}} onSaved={() => {}} />);

    await userEvent.type(screen.getByLabelText("First name"), "New");
    await userEvent.type(screen.getByLabelText("Last name"), "Person");
    await userEvent.type(screen.getByLabelText("Email"), "new@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "short");
    await userEvent.click(screen.getByRole("button", { name: "Create user" }));

    expect(await screen.findByText("Use at least 8 characters.")).toBeInTheDocument();
    expect(mockedService.create).not.toHaveBeenCalled();
  });

  it("surfaces a server error message in the form", async () => {
    mockedService.create.mockRejectedValue(new Error("Email is already registered"));

    renderWithProviders(<UserFormModal open onClose={() => {}} onSaved={() => {}} />);

    await userEvent.type(screen.getByLabelText("First name"), "Dup");
    await userEvent.type(screen.getByLabelText("Last name"), "Licate");
    await userEvent.type(screen.getByLabelText("Email"), "dup@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "long-enough-password");
    await userEvent.click(screen.getByRole("button", { name: "Create user" }));

    expect(await screen.findByText("Email is already registered")).toBeInTheDocument();
  });
});
