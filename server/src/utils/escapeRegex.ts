/**
 * Escapes regex metacharacters so user-supplied search text is matched
 * literally. Without this a search for "(" throws an invalid-regex error and a
 * search for ".*" scans the whole collection.
 */
export const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
