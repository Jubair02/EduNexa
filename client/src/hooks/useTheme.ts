import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "lms_theme";

const isPreference = (value: unknown): value is ThemePreference =>
  value === "system" || value === "light" || value === "dark";

const readStored = (): ThemePreference => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isPreference(stored) ? stored : "system";
  } catch {
    // Private browsing can make localStorage throw; the default still works.
    return "system";
  }
};

/**
 * Writes the choice onto <html>. "system" removes the attribute entirely so the
 * `prefers-color-scheme` rules in index.css take over — the CSS carries all
 * three states, so nothing here needs to know the palette.
 */
const apply = (preference: ThemePreference): void => {
  const root = document.documentElement;
  if (preference === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", preference);
  }
};

/**
 * The stored theme preference, and the theme actually in effect.
 *
 * `resolved` is what the user is looking at right now, which is what a toggle
 * label has to reflect: with "system" chosen it follows the operating system
 * and changes underneath us, so it is watched rather than assumed.
 */
export const useTheme = () => {
  const [preference, setPreference] = useState<ThemePreference>(readStored);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
  );

  useEffect(() => {
    apply(preference);
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Not persisting is survivable; the session still honours the choice.
    }
  }, [preference]);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolved: "light" | "dark" =
    preference === "system" ? (systemPrefersDark ? "dark" : "light") : preference;

  /**
   * Flips to the opposite of what is on screen. Choosing explicitly leaves
   * "system" behind, which is the honest outcome of a manual override.
   */
  const toggle = useCallback(() => {
    setPreference(resolved === "dark" ? "light" : "dark");
  }, [resolved]);

  return { preference, resolved, setPreference, toggle };
};

/**
 * Applies the stored preference before React mounts, so a dark-mode user never
 * sees a flash of the light palette on first paint.
 */
export const initTheme = (): void => apply(readStored());
