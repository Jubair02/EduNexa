import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HelpPage } from "@/pages/help/HelpPage";
import { HELP_TOPICS, matchesQuery } from "@/pages/help/helpTopics";
import { makeAdmin, makeUser, renderWithProviders } from "./helpers";

const student = makeUser({ role: "student", firstName: "Lea" });
const instructor = makeUser({ role: "instructor", firstName: "Ina" });

const render = (authUser: Parameters<typeof renderWithProviders>[1] = {}) =>
  renderWithProviders(<HelpPage />, authUser);

describe("help content", () => {
  it("has a unique id per topic, so anchors and keys are stable", () => {
    const ids = HELP_TOPICS.map((topic) => topic.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every topic a question and at least one paragraph", () => {
    for (const topic of HELP_TOPICS) {
      expect(topic.question.length, topic.id).toBeGreaterThan(5);
      expect(topic.answer.length, topic.id).toBeGreaterThan(0);
      for (const paragraph of topic.answer) {
        expect(paragraph.trim().length, topic.id).toBeGreaterThan(0);
      }
    }
  });

  it("promises no support channel that does not exist", () => {
    // The app has no support inbox, no phone line and no reset email. Inventing
    // one in help text sends people somewhere that will never answer.
    const everything = HELP_TOPICS.flatMap((topic) => topic.answer)
      .join(" ")
      .toLowerCase();
    expect(everything).not.toMatch(/support@|help@|contact us at|@edunexa/);
    expect(everything).not.toMatch(/call us|hotline|live chat/);
  });

  it("searches question text, answer text and keywords", () => {
    const topic = HELP_TOPICS.find((t) => t.id === "forgot-password");
    expect(topic).toBeDefined();
    if (!topic) return;

    expect(matchesQuery(topic, "password")).toBe(true);
    expect(matchesQuery(topic, "PASSWORD")).toBe(true);
    // "locked out" is only in the keywords, not the question.
    expect(matchesQuery(topic, "locked out")).toBe(true);
    // "administrator" is only in the answer body.
    expect(matchesQuery(topic, "administrator")).toBe(true);
    expect(matchesQuery(topic, "")).toBe(true);
    expect(matchesQuery(topic, "quantum tunnelling")).toBe(false);
  });

  it("covers each role, plus questions that apply to everyone", () => {
    const audiences = new Set(HELP_TOPICS.map((topic) => topic.audience));
    expect(audiences).toContain(null);
    expect(audiences).toContain("student");
    expect(audiences).toContain("instructor");
    expect(audiences).toContain("admin");
  });
});

describe("HelpPage", () => {
  it("opens on the signed-in role's questions", () => {
    render({ authUser: student });

    // The student filter is pre-selected…
    expect(screen.getByRole("button", { name: "Students" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    // …so student questions show and instructor ones do not.
    expect(screen.getByText("How do I join a course?")).toBeInTheDocument();
    expect(
      screen.queryByText("How do I publish a course so students can see it?")
    ).not.toBeInTheDocument();
    // Account questions apply to everyone, so they stay visible.
    expect(
      screen.getByText("I have forgotten my password. How do I get back in?")
    ).toBeInTheDocument();
  });

  it("shows every topic to a visitor who is not signed in", () => {
    render({ authUser: null });

    expect(screen.getByRole("button", { name: "All topics" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText("How do I join a course?")).toBeInTheDocument();
    expect(
      screen.getByText("How do I publish a course so students can see it?")
    ).toBeInTheDocument();
  });

  it("tells a locked-out visitor how to get back in", () => {
    // The whole reason this page is public: you cannot sign in to read it.
    render({ authUser: null });

    const question = screen.getByText(
      "I have forgotten my password. How do I get back in?"
    );
    const topic = question.closest("details");
    expect(topic).not.toBeNull();
    expect(topic).toHaveTextContent(/does not send password-reset emails/);
    expect(topic).toHaveTextContent(/Ask an administrator/);
  });

  it("switches audience when a filter is chosen", async () => {
    render({ authUser: student });

    await userEvent.click(screen.getByRole("button", { name: "Instructors" }));

    expect(
      screen.getByText("How do I publish a course so students can see it?")
    ).toBeInTheDocument();
    expect(screen.queryByText("How do I join a course?")).not.toBeInTheDocument();
  });

  it("filters by search across all sections", async () => {
    render({ authUser: null });

    await userEvent.type(screen.getByRole("searchbox", { name: "Search help" }), "certificate");

    expect(screen.getByText("When do I get my certificate?")).toBeInTheDocument();
    expect(screen.getByText("Can a certificate be revoked?")).toBeInTheDocument();
    expect(screen.queryByText("Which video links work?")).not.toBeInTheDocument();
  });

  it("offers a way out of an empty search", async () => {
    render({ authUser: student });

    const box = screen.getByRole("searchbox", { name: "Search help" });
    await userEvent.type(box, "zzzznothing");

    expect(screen.getByText(/Nothing here matches/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show all topics" }));

    expect(box).toHaveValue("");
    expect(screen.getByText("How do I join a course?")).toBeInTheDocument();
    expect(
      screen.getByText("How do I publish a course so students can see it?")
    ).toBeInTheDocument();
  });

  it("shows shortcuts that match the viewer's role", () => {
    const view = render({ authUser: student });
    const links = screen.getByRole("list", { name: undefined });
    expect(links).toBeDefined();
    expect(screen.getByRole("link", { name: /Your certificates/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Manage users/ })).not.toBeInTheDocument();
    view.unmount();

    render({ authUser: makeAdmin() });
    expect(screen.getByRole("link", { name: /Manage users/ })).toHaveAttribute(
      "href",
      "/admin/users"
    );
    expect(screen.queryByRole("link", { name: /Your certificates/ })).not.toBeInTheDocument();
  });

  it("offers no account shortcuts to a visitor who has no account", () => {
    render({ authUser: null });

    expect(screen.queryByRole("link", { name: /Manage users/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Your certificates/ })).not.toBeInTheDocument();
    // The generic ones are still useful.
    expect(screen.getByRole("link", { name: /Browse courses/ })).toHaveAttribute(
      "href",
      "/courses"
    );
  });

  it("is honest that there is nobody to email", () => {
    render({ authUser: instructor });

    const stuck = screen.getByText("Still stuck?").closest("div")?.parentElement;
    expect(stuck).toBeDefined();
    expect(screen.getByText(/no built-in support inbox/)).toBeInTheDocument();
  });

  it("renders answers collapsed, as native disclosures", () => {
    const { container } = render({ authUser: student });

    const disclosures = container.querySelectorAll("details");
    expect(disclosures.length).toBeGreaterThan(5);
    for (const disclosure of disclosures) {
      // Closed by default keeps the page scannable; <details>/<summary> means
      // keyboard and screen-reader support come for free.
      expect(disclosure.open).toBe(false);
      expect(disclosure.querySelector("summary")?.textContent?.trim()).toBeTruthy();
      expect(disclosure.id).toBeTruthy();
    }
  });
});
