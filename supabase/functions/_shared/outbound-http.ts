const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home",
];

function normalizeHostname(hostname: string): string {
  const lower = hostname.trim().toLowerCase();
  return lower.startsWith("[") && lower.endsWith("]") ? lower.slice(1, -1) : lower;
}

function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return numbers;
}

function isBlockedIpv4(value: string): boolean {
  const ip = parseIpv4(value);
  if (!ip) return false;
  const [a, b, c] = ip;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isBlockedIpv6(value: string): boolean {
  const ip = normalizeHostname(value);
  if (!ip.includes(":")) return false;

  if (ip === "::" || ip === "::1") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true;

  const firstSegment = Number.parseInt(ip.split(":", 1)[0] || "0", 16);
  if (Number.isFinite(firstSegment)) {
    if (firstSegment >= 0xfe80 && firstSegment <= 0xfebf) return true; // link-local
    if (firstSegment >= 0xff00 && firstSegment <= 0xffff) return true; // multicast
  }

  if (ip.toLowerCase().startsWith("2001:db8:")) return true; // documentation range

  const mapped = ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (mapped && isBlockedIpv4(mapped)) return true;

  return false;
}

export function isBlockedOutboundAddress(value: string): boolean {
  return isBlockedIpv4(value) || isBlockedIpv6(value);
}

function assertPublicHostnameSyntax(hostname: string): void {
  const host = normalizeHostname(hostname);
  if (!host) throw new Error("Outbound URL is missing a hostname");
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new Error("Outbound URL targets a local or internal hostname");
  }
  if (isBlockedOutboundAddress(host)) {
    throw new Error("Outbound URL targets a private, local, reserved, or non-routable address");
  }
}

async function resolvePublicAddresses(hostname: string): Promise<void> {
  const host = normalizeHostname(hostname);
  if (parseIpv4(host) || host.includes(":")) {
    assertPublicHostnameSyntax(host);
    return;
  }

  const addresses = new Set<string>();
  for (const recordType of ["A", "AAAA"] as const) {
    try {
      const resolved = await Deno.resolveDns(host, recordType);
      resolved.forEach((address) => addresses.add(address));
    } catch {
      // One address family may legitimately have no records. The other family
      // must still resolve below or the destination is rejected.
    }
  }

  if (addresses.size === 0) {
    throw new Error("Outbound hostname could not be resolved to a public address");
  }
  for (const address of addresses) {
    if (isBlockedOutboundAddress(address)) {
      throw new Error("Outbound hostname resolves to a private, local, reserved, or non-routable address");
    }
  }
}

export async function validatePublicHttpsUrl(input: string | URL): Promise<URL> {
  const url = input instanceof URL ? new URL(input.toString()) : new URL(input);
  if (url.protocol !== "https:") {
    throw new Error("Outbound connector URLs must use HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("Outbound connector URLs must not embed credentials");
  }
  assertPublicHostnameSyntax(url.hostname);
  await resolvePublicAddresses(url.hostname);
  return url;
}

export interface SafeOutboundFetchOptions extends RequestInit {
  maxRedirects?: number;
}

/**
 * Fetch an administrator-configured external URL without granting a redirect or
 * DNS path into private infrastructure. Redirects are manual and same-origin
 * only so bearer/header/query credentials cannot be forwarded to another host.
 */
export async function safeOutboundFetch(
  input: string | URL,
  init: SafeOutboundFetchOptions = {},
): Promise<Response> {
  const { maxRedirects = MAX_REDIRECTS, ...requestInit } = init;
  let current = await validatePublicHttpsUrl(input);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetch(current.toString(), {
      ...requestInit,
      redirect: "manual",
    });

    if (!REDIRECT_STATUSES.has(response.status)) return response;
    if (redirectCount === maxRedirects) {
      response.body?.cancel().catch(() => {});
      throw new Error("Outbound connector exceeded redirect limit");
    }

    const location = response.headers.get("location");
    if (!location) {
      response.body?.cancel().catch(() => {});
      throw new Error("Outbound connector redirect is missing Location header");
    }

    const next = await validatePublicHttpsUrl(new URL(location, current));
    if (next.origin !== current.origin) {
      response.body?.cancel().catch(() => {});
      throw new Error("Cross-origin redirects are not allowed for credentialed connectors");
    }

    response.body?.cancel().catch(() => {});
    current = next;
  }

  throw new Error("Outbound connector redirect handling failed");
}
