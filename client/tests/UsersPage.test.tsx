import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsersPage } from "@/pages/admin/UsersPage";
import { usersService } from "@/services/users.service";
import type { Pagination, User } from "@/types";
import { makeAdmin, makeUser, renderWithProviders } from "./helpers";

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

const listResult = (users: User[], pagination?: Partial<Pagination>) => ({
  users,
  pagination: {
    page: 1,
    limit: 10,
    total: users.length,
    totalPages: 1,
    ...pagination,
  },
});

describe("UsersPage", () => {
  const admin = makeAdmin({ id: "admin-1" });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and renders the user list", async () => {
    const users = [
      makeUser({ firstName: "John", lastName: "Carpenter", email: "john@example.com" }),
      makeUser({ firstName: "Mary", lastName: "Shelley", role: "instructor" }),
    ];
    mockedService.list.mockResolvedValue(listResult(users));

    renderWithProviders(<UsersPage />, { authUser: admin });

    // The responsive layout renders a table and a card list; both exist in jsdom.
    expect((await screen.findAllByText("John Carpenter")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mary Shelley").length).toBeGreaterThan(0);
    expect(screen.getAllByText("john@example.com").length).toBeGreaterThan(0);
  });

  it("shows the empty state when nothing matches", async () => {
    mockedService.list.mockResolvedValue(listResult([]));

    renderWithProviders(<UsersPage />, { authUser: admin });

    expect(await screen.findByText("No users found.")).toBeInTheDocument();
    expect(screen.getByText("Try changing your search or filters.")).toBeInTheDocument();
  });

  it("shows the error state with a working retry", async () => {
    mockedService.list.mockRejectedValueOnce(new Error("boom"));
    mockedService.list.mockResolvedValueOnce(listResult([makeUser({ firstName: "After" })]));

    renderWithProviders(<UsersPage />, { authUser: admin });

    expect(await screen.findByText("Unable to load users.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect((await screen.findAllByText(/After/)).length).toBeGreaterThan(0);
  });

  it("sends the debounced search term to the API", async () => {
    mockedService.list.mockResolvedValue(listResult([]));

    renderWithProviders(<UsersPage />, { authUser: admin });
    await screen.findByText("No users found.");

    await userEvent.type(screen.getByLabelText("Search users"), "john");

    await waitFor(() => {
      expect(mockedService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "john", page: 1 })
      );
    });
  });

  it("applies role and status filters", async () => {
    mockedService.list.mockResolvedValue(listResult([]));

    renderWithProviders(<UsersPage />, { authUser: admin });
    await screen.findByText("No users found.");

    await userEvent.selectOptions(screen.getByLabelText("Filter by role"), "instructor");
    await waitFor(() => {
      expect(mockedService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ role: "instructor" })
      );
    });

    await userEvent.selectOptions(screen.getByLabelText("Filter by status"), "inactive");
    await waitFor(() => {
      expect(mockedService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ role: "instructor", status: "inactive" })
      );
    });
  });

  it("paginates with the Next button", async () => {
    mockedService.list.mockResolvedValue(
      listResult([makeUser()], { total: 25, totalPages: 3, page: 1 })
    );

    renderWithProviders(<UsersPage />, { authUser: admin });
    await screen.findByText(/page 1 of 3/);

    await userEvent.click(screen.getByRole("button", { name: /Next/ }));

    await waitFor(() => {
      expect(mockedService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 })
      );
    });
  });

  it("deletes a user after confirmation and shows a toast", async () => {
    const victim = makeUser({ firstName: "Doomed", lastName: "Person" });
    mockedService.list.mockResolvedValue(listResult([victim]));
    mockedService.remove.mockResolvedValue(undefined);

    renderWithProviders(<UsersPage />, { authUser: admin });
    await screen.findAllByText("Doomed Person");

    await userEvent.click(
      screen.getAllByRole("button", { name: "Delete Doomed Person" })[0]
    );
    expect(
      await screen.findByText(/Are you sure you want to delete this user/)
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Delete user" }));

    await waitFor(() => {
      expect(mockedService.remove).toHaveBeenCalledWith(victim.id);
    });
    expect(await screen.findByText("User deleted")).toBeInTheDocument();
  });

  it("deactivates a user after confirmation", async () => {
    const target = makeUser({ firstName: "Active", lastName: "Person", isActive: true });
    mockedService.list.mockResolvedValue(listResult([target]));
    mockedService.setStatus.mockResolvedValue({ ...target, isActive: false });

    renderWithProviders(<UsersPage />, { authUser: admin });
    await screen.findAllByText("Active Person");

    await userEvent.click(
      screen.getAllByRole("button", { name: "Deactivate Active Person" })[0]
    );
    expect(
      await screen.findByText(/They will no longer be able to log in/)
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    await waitFor(() => {
      expect(mockedService.setStatus).toHaveBeenCalledWith(target.id, false);
    });
    expect(await screen.findByText("User deactivated")).toBeInTheDocument();
  });

  it("hides destructive actions on the signed-in admin's own row", async () => {
    mockedService.list.mockResolvedValue(listResult([admin]));

    renderWithProviders(<UsersPage />, { authUser: admin });
    await screen.findAllByText(/\(you\)/);

    expect(
      screen.queryByRole("button", { name: `Delete ${admin.firstName} ${admin.lastName}` })
    ).not.toBeInTheDocument();
  });

  it("opens the create modal and validates required fields", async () => {
    mockedService.list.mockResolvedValue(listResult([]));

    renderWithProviders(<UsersPage />, { authUser: admin });
    await screen.findByText("No users found.");

    await userEvent.click(screen.getByRole("button", { name: /Create user/ }));
    const dialog = await screen.findByRole("dialog");

    await userEvent.click(within(dialog).getByRole("button", { name: "Create user" }));

    expect(await screen.findByText("Enter a first name.")).toBeInTheDocument();
    expect(screen.getByText("Enter a last name.")).toBeInTheDocument();
    expect(screen.getByText("Enter an email address.")).toBeInTheDocument();
    expect(screen.getByText("Choose a password.")).toBeInTheDocument();
    expect(mockedService.create).not.toHaveBeenCalled();
  });

  it("creates a user through the modal", async () => {
    mockedService.list.mockResolvedValue(listResult([]));
    const created = makeUser({ firstName: "Fresh", role: "instructor" });
    mockedService.create.mockResolvedValue(created);

    renderWithProviders(<UsersPage />, { authUser: admin });
    await screen.findByText("No users found.");

    await userEvent.click(screen.getByRole("button", { name: /Create user/ }));
    const dialog = await screen.findByRole("dialog");

    await userEvent.type(within(dialog).getByLabelText("First name"), "Fresh");
    await userEvent.type(within(dialog).getByLabelText("Last name"), "Face");
    await userEvent.type(within(dialog).getByLabelText("Email"), "fresh@example.com");
    await userEvent.type(within(dialog).getByLabelText("Password"), "long-enough-password");
    await userEvent.selectOptions(within(dialog).getByLabelText("Role"), "instructor");

    await userEvent.click(within(dialog).getByRole("button", { name: "Create user" }));

    await waitFor(() => {
      expect(mockedService.create).toHaveBeenCalledWith({
        firstName: "Fresh",
        lastName: "Face",
        email: "fresh@example.com",
        password: "long-enough-password",
        role: "instructor",
      });
    });
    expect(await screen.findByText("User created")).toBeInTheDocument();
  });
});
