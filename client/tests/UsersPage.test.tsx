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
    resetPassword: vi.fn(),
    bulkSetStatus: vi.fn(),
    bulkRemove: vi.fn(),
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

/**
 * The table and the card list are both mounted under jsdom, so a per-row
 * control matches twice — the card list gained checkboxes so that bulk actions
 * are reachable on a phone at all, where previously nothing was selectable.
 */
describe("UsersPage bulk actions", () => {
  /** The signed-in admin defaults to an id that is not among the listed rows. */
  const renderPage = (self: { id: string } = { id: "admin-only" }) =>
    renderWithProviders(<UsersPage />, { authUser: makeAdmin({ id: self.id }) });

  beforeEach(() => {
    vi.clearAllMocks();
    mockedService.list.mockResolvedValue(
      listResult([
        makeUser({ id: "u-1", firstName: "Ada", lastName: "One" }),
        makeUser({ id: "u-2", firstName: "Bob", lastName: "Two" }),
      ])
    );
  });

  it("shows no bulk bar until something is selected", async () => {
    renderPage();
    await screen.findByRole("table");

    expect(screen.queryByRole("group", { name: "Bulk actions" })).not.toBeInTheDocument();
  });

  it("selects rows and reports the count", async () => {
    renderPage();
    await screen.findByRole("table");

    await userEvent.click(screen.getAllByLabelText("Select Ada One")[0]);
    const bar = screen.getByRole("group", { name: "Bulk actions" });
    expect(within(bar).getByText("1 selected")).toBeInTheDocument();

    await userEvent.click(screen.getAllByLabelText("Select Bob Two")[0]);
    expect(within(bar).getByText("2 selected")).toBeInTheDocument();

    await userEvent.click(within(bar).getByRole("button", { name: "Clear" }));
    expect(screen.queryByRole("group", { name: "Bulk actions" })).not.toBeInTheDocument();
  });

  it("selects and clears every row from the header checkbox", async () => {
    renderPage();
    await screen.findByRole("table");

    const all = screen.getByLabelText("Select all users on this page");
    await userEvent.click(all);
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    await userEvent.click(all);
    expect(screen.queryByRole("group", { name: "Bulk actions" })).not.toBeInTheDocument();
  });

  it("deactivates the selection after confirmation", async () => {
    mockedService.bulkSetStatus.mockResolvedValue({ requested: 2, affected: 2 });
    renderPage();
    await screen.findByRole("table");

    await userEvent.click(screen.getByLabelText("Select all users on this page"));
    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Deactivate 2 users")).toBeInTheDocument();
    expect(within(dialog).getByText(/courses and progress are kept/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Deactivate" }));

    await waitFor(() => {
      expect(mockedService.bulkSetStatus).toHaveBeenCalledWith(["u-1", "u-2"], false);
    });
    expect(await screen.findByText("2 accounts updated")).toBeInTheDocument();
  });

  it("warns that a bulk delete cannot be undone", async () => {
    mockedService.bulkRemove.mockResolvedValue({ requested: 1, affected: 1 });
    renderPage();
    await screen.findByRole("table");

    await userEvent.click(screen.getAllByLabelText("Select Ada One")[0]);
    // Scoped to the bulk bar — each row has its own Delete action too.
    const bar = screen.getByRole("group", { name: "Bulk actions" });
    await userEvent.click(within(bar).getByRole("button", { name: /Delete/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/cannot be undone/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockedService.bulkRemove).toHaveBeenCalledWith(["u-1"]);
    });
  });

  it("says so when part of the selection no longer exists", async () => {
    mockedService.bulkSetStatus.mockResolvedValue({ requested: 2, affected: 1 });
    renderPage();
    await screen.findByRole("table");

    await userEvent.click(screen.getByLabelText("Select all users on this page"));
    await userEvent.click(screen.getByRole("button", { name: "Activate" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Activate" }));

    expect(
      await screen.findByText("1 of 2 updated — the rest no longer exist")
    ).toBeInTheDocument();
  });

  it("never offers your own account for selection", async () => {
    // The signed-in admin is one of the rows on this page.
    mockedService.list.mockResolvedValue(
      listResult([
        makeUser({ id: "admin-1", firstName: "Me", lastName: "Myself", role: "admin" }),
        makeUser({ id: "u-2", firstName: "Bob", lastName: "Two" }),
      ])
    );

    renderPage({ id: "admin-1" });
    await screen.findByRole("table");

    // Neither the table nor the card list offers a tick for your own row.
    expect(screen.queryAllByLabelText("Select Me Myself")).toHaveLength(0);
    expect(screen.getAllByLabelText("Select Bob Two").length).toBeGreaterThan(0);

    // "Select all" therefore covers everyone but you.
    await userEvent.click(screen.getByLabelText("Select all users on this page"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });
});

describe("UsersPage sorting, counts and view state", () => {
  const admin = makeAdmin({ id: "admin-1" });

  const stats = {
    totalUsers: 47,
    students: 38,
    instructors: 7,
    admins: 2,
    activeUsers: 44,
    inactiveUsers: 3,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedService.list.mockResolvedValue(listResult([makeUser({ firstName: "Row" })]));
    mockedService.statistics.mockResolvedValue(stats);
  });

  const renderAt = (url = "/admin/users") =>
    renderWithProviders(<UsersPage />, { authUser: admin, initialEntries: [url] });

  it("asks for newest-first by default, which the server used to decide alone", async () => {
    renderAt();
    await screen.findAllByText(/Row/);

    expect(mockedService.list).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: "createdAt", sortOrder: "desc" })
    );
  });

  it("sorts a column ascending on first click and flips it on the second", async () => {
    renderAt();
    await screen.findAllByText(/Row/);

    const nameHeader = screen.getByRole("button", { name: "Name" });

    await userEvent.click(nameHeader);
    await waitFor(() =>
      expect(mockedService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: "firstName", sortOrder: "asc" })
      )
    );

    await userEvent.click(screen.getByRole("button", { name: "Name" }));
    await waitFor(() =>
      expect(mockedService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: "firstName", sortOrder: "desc" })
      )
    );
  });

  it("exposes the sorted column to assistive technology", async () => {
    renderAt("/admin/users?sortBy=email&sortOrder=asc");
    await screen.findAllByText(/Row/);

    const header = screen.getByRole("columnheader", { name: /Email/ });
    expect(header).toHaveAttribute("aria-sort", "ascending");
    // Only the active column is marked; the others must not claim an order.
    expect(screen.getByRole("columnheader", { name: /Role/ })).toHaveAttribute(
      "aria-sort",
      "none"
    );
  });

  it("turns the counts into the filters they describe", async () => {
    renderAt();
    await screen.findAllByText(/Row/);

    const instructors = await screen.findByRole("button", { name: /7\s*Instructors/ });
    expect(instructors).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(instructors);

    await waitFor(() =>
      expect(mockedService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ role: "instructor" })
      )
    );
    expect(
      await screen.findByRole("button", { name: /7\s*Instructors/ })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the table when the counts fail to load", async () => {
    mockedService.statistics.mockRejectedValue(new Error("stats down"));
    renderAt();

    expect((await screen.findAllByText(/Row/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Instructors/ })).not.toBeInTheDocument();
  });

  it("lets an admin change how many rows a page holds", async () => {
    renderAt();
    await screen.findAllByText(/Row/);

    await userEvent.selectOptions(screen.getByLabelText("Rows per page"), "50");

    await waitFor(() =>
      expect(mockedService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ limit: 50, page: 1 })
      )
    );
  });

  it("restores the whole view from the URL", async () => {
    renderAt(
      "/admin/users?search=ada&role=instructor&status=inactive&sortBy=email&sortOrder=asc&limit=25&page=3"
    );
    await screen.findAllByText(/Row/);

    expect(mockedService.list).toHaveBeenCalledWith({
      page: 3,
      limit: 25,
      search: "ada",
      role: "instructor",
      status: "inactive",
      sortBy: "email",
      sortOrder: "asc",
    });
  });

  it("discards URL values the server would reject", async () => {
    renderAt("/admin/users?role=wizard&status=haunted&sortBy=password&limit=9999&page=0");
    await screen.findAllByText(/Row/);

    expect(mockedService.list).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "",
        status: "",
        sortBy: "createdAt",
        limit: 10,
        page: 1,
      })
    );
  });

  it("offers a way out of a filtered-to-nothing list", async () => {
    mockedService.list.mockResolvedValue(listResult([]));
    renderAt("/admin/users?role=admin");

    await screen.findByText("No users found.");
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() =>
      expect(mockedService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ role: "", status: "", search: "" })
      )
    );
  });

  it("shows no clear-filters escape hatch when nothing is filtered", async () => {
    mockedService.list.mockResolvedValue(listResult([]));
    renderAt();

    await screen.findByText("No users found.");
    expect(
      screen.queryByRole("button", { name: "Clear filters" })
    ).not.toBeInTheDocument();
  });

  it("names the range on show, not just the page number", async () => {
    mockedService.list.mockResolvedValue(
      listResult([makeUser({ firstName: "Row" })], {
        page: 2,
        limit: 10,
        total: 47,
        totalPages: 5,
      })
    );
    renderAt("/admin/users?page=2");

    expect(await screen.findByText(/11–20 of 47 users/)).toBeInTheDocument();
  });
});
