/**
 * URL vetting for anything that will later be rendered as a link, an iframe
 * `src`, or an image `src`.
 *
 * `z.url()` only checks that the URL parses, so it happily accepts
 * `javascript:alert(1)` and `data:text/html,…`. Both become stored XSS the
 * moment a browser renders them, so every URL that crosses the API boundary is
 * restricted to http(s) here.
 */
const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

export const isSafeHttpUrl = (value: string): boolean => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (!SAFE_PROTOCOLS.has(url.protocol)) return false;
  // A protocol-only URL ("https://") parses but points nowhere.
  return url.hostname.length > 0;
};
