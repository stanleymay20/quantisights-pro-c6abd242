const NAVIGATION_BASE = "https://navigation.quantivis.invalid";

const decodeForValidation = (value: string) => {
  let decoded = value;
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return null;
    }
  }
  return decoded;
};

/**
 * Return a normalized same-origin application path, or the supplied fallback.
 * Backslashes and control characters are rejected before URL parsing because
 * browsers may normalize them into authority separators.
 */
export const safeInternalNavigation = (value: string | null | undefined, fallback: string) => {
  if (!value || value !== value.trim() || !value.startsWith("/")) return fallback;

  const decoded = decodeForValidation(value);
  if (!decoded || decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded)) return fallback;
  if (decoded.startsWith("//")) return fallback;

  try {
    const url = new URL(value, NAVIGATION_BASE);
    if (url.origin !== NAVIGATION_BASE || url.username || url.password) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
};

export const safeHttpsUrl = (value: string | null | undefined) => {
  if (!value || value !== value.trim() || /[\u0000-\u001f\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
};
