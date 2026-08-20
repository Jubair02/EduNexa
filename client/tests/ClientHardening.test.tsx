/**
 * Phase 8 client hardening: the render-time and session-time protections, each
 * pinned by the failure it prevents.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LessonContent } from "@/components/courses/LessonContent";
import { CourseThumbnail } from "@/components/CourseThumbnail";
import { Dialog } from "@/components/ui/dialog";
import { AuthProvider } from "@/context/AuthContext";
import { useAuth } from "@/hooks/useAuth";
import { SESSION_EXPIRED_EVENT } from "@/services/api";
import { authService } from "@/services/auth.service";
import type { Lesson } from "@/types";
import { safeUrl } from "@/utils/safeUrl";
import { setToken } from "@/utils/token";
import { makeUser } from "./helpers";

vi.mock("@/services/auth.service", () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
}));

const mockedAuth = vi.mocked(authService);

const makeLesson = (overrides: Partial<Lesson> = {}): Lesson => ({
  id: "l-1",
  module: "m-1",
  course: "c-1",
  title: "Suspect Lesson",
  type: "text",
  order: 1,
  isPublished: true,
  isPreview: false,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
  ...overrides,
});

const HOSTILE_URLS = [
  "javascript:alert(document.cookie)",
  "JAVASCRIPT:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
];

describe("safeUrl", () => {
  it("passes http(s) and rejects script-bearing schemes", () => {
    expect(safeUrl("https://example.com/file.pdf")).toBe("https://example.com/file.pdf");
    expect(safeUrl("http://example.com")).toBe("http://example.com");

    for (const hostile of HOSTILE_URLS) {
      expect(safeUrl(hostile), hostile).toBeNull();
    }
    expect(safeUrl("")).toBeNull();
    expect(safeUrl(null)).toBeNull();
    expect(safeUrl(undefined)).toBeNull();

    // A relative path resolves against our own origin, so it carries no
    // scheme risk and is allowed through unchanged.
    expect(safeUrl("/files/handout.pdf")).toBe("/files/handout.pdf");
  });
});

describe("LessonContent never renders a script-bearing URL", () => {
  it.each(HOSTILE_URLS)("refuses %s as a video URL", (hostile) => {
    const { container } = render(
      <LessonContent lesson={makeLesson({ type: "video", videoUrl: hostile })} />
    );

    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("source")).toBeNull();
    expect(container.innerHTML).not.toContain("javascript:");
    expect(container.innerHTML).not.toContain("data:text/html");
    expect(screen.getByText(/can't be displayed/i)).toBeInTheDocument();
  });

  it.each(HOSTILE_URLS)("refuses %s as a file URL", (hostile) => {
    const { container } = render(
      <LessonContent lesson={makeLesson({ type: "pdf", fileUrl: hostile })} />
    );

    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText(/can't be displayed/i)).toBeInTheDocument();
  });

  it("still renders a legitimate PDF and document link", () => {
    const pdf = render(
      <LessonContent
        lesson={makeLesson({
          type: "pdf",
          fileUrl: "https://res.cloudinary.com/demo/raw/upload/notes.pdf",
          fileName: "notes.pdf",
        })}
      />
    );
    expect(pdf.container.querySelector("iframe")).toHaveAttribute(
      "src",
      "https://res.cloudinary.com/demo/raw/upload/notes.pdf"
    );
    pdf.unmount();

    const doc = render(
      <LessonContent
        lesson={makeLesson({
          type: "document",
          fileUrl: "https://example.com/handout.docx",
          fileName: "handout.docx",
        })}
      />
    );
    expect(doc.container.querySelector("a")).toHaveAttribute(
      "href",
      "https://example.com/handout.docx"
    );
    // External links must not hand the opener over.
    expect(doc.container.querySelector("a")).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders text lesson bodies as text, never as markup", () => {
    const { container } = render(
      <LessonContent
        lesson={makeLesson({
          type: "text",
          content: "<img src=x onerror=alert(1)><script>alert(2)</script>",
        })}
      />
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    // The markup is visible as literal characters, which is the whole point.
    expect(
      screen.getByText("<img src=x onerror=alert(1)><script>alert(2)</script>")
    ).toBeInTheDocument();
  });
});

describe("CourseThumbnail", () => {
  it("falls back to the placeholder for an unsafe thumbnail URL", () => {
    const { container } = render(
      <CourseThumbnail
        course={{
          title: "Suspect Course",
          thumbnail: { url: "data:text/html,<script>alert(1)</script>" },
        }}
      />
    );

    expect(container.querySelector("img")).toBeNull();
  });

  it("renders a real thumbnail", () => {
    render(
      <CourseThumbnail
        course={{ title: "Good Course", thumbnail: { url: "https://cdn.example.com/a.png" } }}
      />
    );

    expect(screen.getByAltText("Good Course thumbnail")).toHaveAttribute(
      "src",
      "https://cdn.example.com/a.png"
    );
  });
});

describe("Dialog accessibility", () => {
  const Harness = () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open it
        </button>
        <button type="button">Behind the overlay</button>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Confirm something"
          description="This explains the choice."
        >
          <button type="button">First</button>
          <button type="button">Second</button>
        </Dialog>
      </>
    );
  };

  it("wires the title and description to the dialog for screen readers", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open it" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Confirm something");
    expect(dialog).toHaveAccessibleDescription("This explains the choice.");
  });

  it("moves focus in, traps Tab inside, and restores focus on close", async () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open it" });
    await userEvent.click(opener);

    // Focus lands on the panel itself, so the dialog is announced.
    expect(screen.getByRole("dialog")).toHaveFocus();

    // Tab walks the panel's controls in DOM order…
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Second" })).toHaveFocus();

    // …then wraps, instead of escaping to "Behind the overlay".
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();

    // Shift+Tab off the first control wraps backwards to the last.
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Second" })).toHaveFocus();

    // The page behind cannot scroll while the dialog is up.
    expect(document.body.style.overflow).toBe("hidden");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});

const SessionProbe = () => {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p>loading</p>;
  return <p>{user ? `signed in as ${user.firstName}` : "signed out"}</p>;
};

describe("session expiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("drops the session when the API reports the token is no longer valid", async () => {
    setToken("stale-token");
    mockedAuth.me.mockResolvedValue(makeUser({ firstName: "Lea" }));

    render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>
    );

    expect(await screen.findByText("signed in as Lea")).toBeInTheDocument();

    // What the axios interceptor does on a 401 from any authenticated call.
    act(() => {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    });

    await waitFor(() => {
      expect(screen.getByText("signed out")).toBeInTheDocument();
    });
  });

  it("discards a token the API rejects at startup", async () => {
    setToken("expired-token");
    mockedAuth.me.mockRejectedValue(new Error("401"));

    render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>
    );

    expect(await screen.findByText("signed out")).toBeInTheDocument();
    expect(localStorage.getItem("lms_auth_token")).toBeNull();
  });
});
