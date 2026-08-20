import { AlertTriangle, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * A failed dynamic `import()` — the route chunk is gone or unreachable.
 *
 * This is the common case in practice rather than a coding bug: a tab left open
 * across a deploy asks for the old hashed filename, which no longer exists.
 * Reloading fetches the new index and fixes it, so that error gets its own
 * message and a reload button instead of the generic "something broke".
 */
const isChunkLoadError = (error: Error): boolean =>
  error.name === "ChunkLoadError" ||
  /Loading chunk|dynamically imported module|Importing a module script failed/i.test(
    error.message
  );

/**
 * Catches render-time crashes so a broken screen does not take the whole app
 * down to a blank page. Errors thrown in event handlers and async code do not
 * reach this — React only reports failures during render, lifecycle and effects.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // No error-reporting service is wired up, so the console is the record.
    console.error("[ui] Unhandled render error:", error, info.componentStack);
  }

  private readonly reload = (): void => {
    window.location.reload();
  };

  private readonly goHome = (): void => {
    // A full navigation, not a router push: the router lives inside this
    // boundary, and its state is what just failed.
    window.location.assign("/");
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isStale = isChunkLoadError(error);

    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-soft bg-surface p-8 text-center shadow-[0_1px_2px_rgba(35,26,38,0.06)]">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary-soft">
            <AlertTriangle className="size-6 text-primary" aria-hidden="true" />
          </div>

          <h1 className="mt-5 font-display text-2xl font-semibold text-ink">
            {isStale ? "A new version is available" : "Something went wrong"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {isStale
              ? "EduNexa was updated while this page was open. Reload to get the latest version."
              : "This page ran into an unexpected error. Reloading usually clears it — nothing you had saved is affected."}
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button onClick={this.reload}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Reload the page
            </Button>
            {!isStale && (
              <Button variant="outline" onClick={this.goHome}>
                Go to my dashboard
              </Button>
            )}
          </div>

          {import.meta.env.DEV && (
            <pre className="mt-6 max-h-48 overflow-auto rounded-xl bg-paper p-3 text-left text-xs text-muted">
              {error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
