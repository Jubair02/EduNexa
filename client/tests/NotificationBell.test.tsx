import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { notificationsService } from "@/services/notifications.service";
import type { NotificationItem } from "@/types";
import { renderWithProviders } from "./helpers";

vi.mock("@/services/notifications.service", () => ({
  notificationsService: { list: vi.fn(), markSeen: vi.fn() },
}));

const mocked = vi.mocked(notificationsService);

const item = (overrides: Partial<NotificationItem> = {}): NotificationItem => ({
  id: "certificate-earned:c-1",
  kind: "certificate-earned",
  title: "Certificate earned",
  body: "Your certificate for Test-Driven TypeScript is ready to download.",
  at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  to: "/student/certificates",
  isUnread: true,
  ...overrides,
});

const render = () => renderWithProviders(<NotificationBell />);

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.list.mockResolvedValue({ notifications: [], unreadCount: 0 });
    mocked.markSeen.mockResolvedValue();
  });

  it("loads the feed on mount so the badge is right before opening", async () => {
    mocked.list.mockResolvedValue({
      notifications: [item(), item({ id: "quiz-result:a-1", isUnread: true })],
      unreadCount: 2,
    });

    render();

    // The count is in the accessible name, so it is announced, not just drawn.
    expect(
      await screen.findByRole("button", { name: "Notifications, 2 unread" })
    ).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("caps a large badge rather than breaking the layout", async () => {
    mocked.list.mockResolvedValue({ notifications: [], unreadCount: 27 });

    render();

    expect(await screen.findByText("9+")).toBeInTheDocument();
  });

  it("shows no badge when nothing is unread", async () => {
    mocked.list.mockResolvedValue({ notifications: [item({ isUnread: false })], unreadCount: 0 });

    render();

    expect(
      await screen.findByRole("button", { name: "Notifications" })
    ).toBeInTheDocument();
  });

  it("lists notifications with a relative time and a destination", async () => {
    mocked.list.mockResolvedValue({ notifications: [item()], unreadCount: 1 });

    render();
    await userEvent.click(await screen.findByRole("button", { name: /Notifications/ }));

    const panel = await screen.findByRole("dialog", { name: "Notifications" });
    expect(within(panel).getByText("Certificate earned")).toBeInTheDocument();
    expect(within(panel).getByText(/ready to download/)).toBeInTheDocument();
    expect(within(panel).getByText("1 hour ago")).toBeInTheDocument();
    expect(within(panel).getByRole("link")).toHaveAttribute(
      "href",
      "/student/certificates"
    );
  });

  it("marks everything seen when opened, and clears the badge", async () => {
    mocked.list.mockResolvedValue({ notifications: [item()], unreadCount: 1 });

    render();
    await userEvent.click(await screen.findByRole("button", { name: /1 unread/ }));

    await waitFor(() => {
      expect(mocked.markSeen).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByRole("button", { name: "Notifications" })
    ).toBeInTheDocument();
  });

  it("does not write a seen mark when there was nothing unread", async () => {
    mocked.list.mockResolvedValue({
      notifications: [item({ isUnread: false })],
      unreadCount: 0,
    });

    render();
    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));

    await screen.findByRole("dialog", { name: "Notifications" });
    expect(mocked.markSeen).not.toHaveBeenCalled();
  });

  it("keeps the feed visible if the seen mark fails", async () => {
    mocked.list.mockResolvedValue({ notifications: [item()], unreadCount: 1 });
    mocked.markSeen.mockRejectedValue(new Error("offline"));

    render();
    await userEvent.click(await screen.findByRole("button", { name: /1 unread/ }));

    const panel = await screen.findByRole("dialog", { name: "Notifications" });
    expect(within(panel).getByText("Certificate earned")).toBeInTheDocument();
  });

  it("explains an empty feed", async () => {
    render();
    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));

    expect(await screen.findByText(/Nothing yet/)).toBeInTheDocument();
  });

  it("offers a retry when the feed fails to load", async () => {
    mocked.list.mockRejectedValueOnce(new Error("network"));
    mocked.list.mockResolvedValueOnce({ notifications: [item()], unreadCount: 0 });

    render();
    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));

    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(mocked.list).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("Certificate earned")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    render();
    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    expect(await screen.findByRole("dialog", { name: "Notifications" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument();
    });
  });

  it("renders an item with no destination as plain text, not a dead link", async () => {
    mocked.list.mockResolvedValue({
      notifications: [item({ to: undefined })],
      unreadCount: 0,
    });

    render();
    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));

    const panel = await screen.findByRole("dialog", { name: "Notifications" });
    expect(within(panel).getByText("Certificate earned")).toBeInTheDocument();
    expect(within(panel).queryByRole("link")).not.toBeInTheDocument();
  });
});
