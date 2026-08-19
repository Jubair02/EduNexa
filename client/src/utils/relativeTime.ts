const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now" / "12 minutes ago" / "3 days ago", falling back to a date. */
export const relativeTime = (value: string | Date): string => {
  const date = typeof value === "string" ? new Date(value) : value;
  const elapsed = Date.now() - date.getTime();

  if (Number.isNaN(elapsed)) return "";
  if (elapsed < MINUTE) return "just now";

  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (elapsed < 7 * DAY) {
    const days = Math.floor(elapsed / DAY);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};
