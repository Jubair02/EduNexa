/**
 * Last line of defence before a URL from the API reaches the DOM.
 *
 * The server restricts stored URLs to http(s), but a URL that reaches an
 * anchor href or an iframe src is one validation gap away from executing
 * script, so it is re-checked at the point of render. Anything that isn't
 * plainly http(s) becomes null and the caller renders nothing rather than a
 * live `javascript:` link.
 */
const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

export const safeUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    return SAFE_PROTOCOLS.has(url.protocol) && url.hostname ? value : null;
  } catch {
    return null;
  }
};
