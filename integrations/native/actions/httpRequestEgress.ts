import { lookup as dnsLookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";

/**
 * Slice 3.SEC-3 — Egress hardening for `native:http_request`.
 *
 * Background: the SEC-1 audit (F-C2) flagged `native:http_request` as an
 * unrestricted egress sink. Combined with the variable resolver, any
 * upstream value can be POSTed to an attacker-controlled URL, and any
 * private/internal/metadata endpoint can be reached if the runtime
 * environment's network permits.
 *
 * This module hardens the REQUEST side only. Response-side filtering
 * (sensitive header redaction, 256 KiB body cap) already exists in
 * httpRequest.ts. Output-side leakage prevention via OutputMeta.sensitive
 * is SEC-7, out of scope here.
 *
 * Policy (block-only; no user-configurable allowlist in this slice):
 *
 *   1. Scheme MUST be http: or https:. Defense in depth — the handler's
 *      `parseUrlSafely` already enforces this, but a fail-closed check
 *      here catches future drift if the upstream check is ever weakened.
 *
 *   2. Hostname denylist (case-insensitive). Hits these BEFORE DNS so
 *      we don't trigger lookups for known-bad targets:
 *        - `localhost`, `*.localhost`
 *        - cloud metadata service hostnames
 *
 *   3. Hostname is parsed as an IP literal (IPv4 / IPv6). If yes, the
 *      address is classified against the blocked-range table directly
 *      with no DNS round-trip.
 *
 *   4. Otherwise the hostname is resolved via `dns.lookup` (returns A
 *      and AAAA records). EVERY resolved address must pass classifier.
 *      A single private-IP address in the resolved set rejects the
 *      request — guards against split-horizon / partially-private
 *      domains.
 *
 *   5. DNS failure (NXDOMAIN, timeout, network error) FAILS CLOSED.
 *      The audit's no-go gates require this — silent fallback would
 *      allow an attacker to register a domain whose DNS deliberately
 *      times out to bypass the classifier.
 *
 * DNS rebinding caveat: this validates resolved IPs immediately before
 * the fetch is dispatched. There is a small TOCTOU window where DNS
 * could return a public IP to the check and a private IP to fetch's
 * own resolution. A full mitigation requires either (a) socket-level
 * pinning via `undici.Agent` with a custom `connect` that re-validates
 * the connected IP, or (b) issuing the request against the IP literal
 * with an explicit Host header. Both are out of scope for v1; the
 * audit slice tracks this as a SEC-3.x follow-up.
 *
 * Redirect handling: the handler sets `redirect: "manual"` on its
 * fetch so a 3xx response is returned with status code 301..308 and
 * the `Location` header preserved (sensitive-header sanitization does
 * NOT strip `Location`). Workflow authors who want to follow a redirect
 * must issue a new http_request node against the resolved URL — at
 * which point this guard fires again. This eliminates the
 * "public → 169.254.169.254" redirect bypass without requiring a
 * stateful per-request redirect chain.
 */

/**
 * Error thrown when a request destination is blocked by the egress
 * policy. Carries a stable `code` so callers and tests can branch on
 * the kind of failure without parsing `message`. The default message
 * deliberately does NOT echo the full URL — paths and query strings
 * can carry secrets injected by the variable resolver.
 */
export class HttpRequestBlockedDestinationError extends Error {
  readonly code = "HTTP_REQUEST_BLOCKED_DESTINATION";

  constructor(
    message: string = "Request destination is blocked by egress policy.",
  ) {
    super(message);
    this.name = "HttpRequestBlockedDestinationError";
  }
}

/**
 * Pluggable DNS resolver. Returns ONLY the address strings (IPv4 and
 * IPv6 mixed). Empty array means "no addresses resolved" — treated as
 * a block. Throws on any resolver error (NXDOMAIN, timeout, network) —
 * the caller fails closed.
 */
export type DnsResolver = (host: string) => Promise<readonly string[]>;

/**
 * Default resolver: Node's `dns.lookup` returns all A + AAAA records
 * via `{ all: true }`. Using `lookup` (not `resolve4` / `resolve6`) so
 * `/etc/hosts` overrides + the OS resolver stack are honored — that's
 * what `fetch` itself uses, so we're checking the same thing fetch will
 * connect to.
 */
const DEFAULT_RESOLVER: DnsResolver = async (host) => {
  const addrs = await dnsLookup(host, { all: true, verbatim: true });
  return addrs.map((a) => a.address);
};

/**
 * Hostnames blocked BEFORE DNS resolution. Lowercase, no trailing dot.
 *
 * `localhost` covers IPv4 loopback resolution via `/etc/hosts`; the
 * IP-literal classifier handles `127.0.0.1` and `::1` directly.
 *
 * The cloud metadata hostnames are pre-DNS so an attacker can't bypass
 * by registering a public DNS name that points to `169.254.169.254`
 * (which is ALSO blocked at the IP layer, defense in depth).
 */
const BLOCKED_HOSTNAMES: ReadonlySet<string> = new Set([
  "localhost",
  // AWS / GCP / Azure share the link-local metadata IP. Some Azure
  // deployments expose it via these DNS names too.
  "metadata.google.internal",
  "metadata.azure.com",
  "metadata",
  // EC2's internal alias for the metadata service.
  "instance-data.ec2.internal",
  // Belt-and-suspenders for the well-known metadata IP under DNS too.
  "169.254.169.254",
]);

/**
 * Classify an IP address string as blocked or allowed.
 *
 * Recognizes both IPv4 and IPv6 literals. Returns true to block. Used
 * directly on IP-literal hostnames AND on every resolved address.
 *
 * IPv4-mapped IPv6 (`::ffff:a.b.c.d`) is normalized to its IPv4 form
 * before classification — an attacker cannot bypass the IPv4 ranges by
 * wrapping in IPv6 syntax.
 *
 * Invalid IP strings return true (block) — fail-closed for unknown.
 */
export function isBlockedIp(address: string): boolean {
  if (typeof address !== "string" || address.length === 0) return true;

  if (isIPv4(address)) return isBlockedIPv4(address);
  if (isIPv6(address)) return isBlockedIPv6(address);

  // Not a recognized IP format — fail closed.
  return true;
}

/**
 * IPv4 classification. Block ranges (one comment per RFC bucket):
 *
 *   - 0.0.0.0/8 (unspecified / "this network", RFC 1122)
 *   - 10.0.0.0/8 (RFC 1918 private)
 *   - 100.64.0.0/10 (RFC 6598 CGNAT) — common in cloud overlays
 *   - 127.0.0.0/8 (loopback)
 *   - 169.254.0.0/16 (link-local, RFC 3927; includes 169.254.169.254 metadata)
 *   - 172.16.0.0/12 (RFC 1918 private)
 *   - 192.0.0.0/24 (IANA IPv4 special-purpose)
 *   - 192.0.2.0/24 (RFC 5737 TEST-NET-1)
 *   - 192.168.0.0/16 (RFC 1918 private)
 *   - 198.18.0.0/15 (RFC 2544 benchmark)
 *   - 198.51.100.0/24 (RFC 5737 TEST-NET-2)
 *   - 203.0.113.0/24 (RFC 5737 TEST-NET-3)
 *   - 224.0.0.0/4 (multicast, RFC 5771)
 *   - 240.0.0.0/4 (reserved, includes 255.255.255.255 broadcast)
 */
function isBlockedIPv4(address: string): boolean {
  const parts = address.split(".");
  if (parts.length !== 4) return true;
  const octets = parts.map((p) => Number(p));
  for (const o of octets) {
    if (!Number.isInteger(o) || o < 0 || o > 255) return true;
  }
  const [a, b] = octets as [number, number, number, number];

  // 0.0.0.0/8
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 100.64.0.0/10
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8
  if (a === 127) return true;
  // 169.254.0.0/16 — covers 169.254.169.254 metadata
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 + 192.0.2.0/24
  if (a === 192 && b === 0) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 198.51.100.0/24
  if (a === 198 && b === 51 && octets[2] === 100) return true;
  // 203.0.113.0/24
  if (a === 203 && b === 0 && octets[2] === 113) return true;
  // 224.0.0.0/4 (multicast)
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 (reserved + 255.255.255.255 broadcast)
  if (a >= 240) return true;

  return false;
}

/**
 * IPv6 classification. Block ranges:
 *
 *   - ::1/128 (loopback)
 *   - ::/128 (unspecified)
 *   - fc00::/7 (unique local addresses, RFC 4193)
 *   - fe80::/10 (link-local, RFC 4291)
 *   - ff00::/8 (multicast, RFC 4291)
 *   - 2001:db8::/32 (documentation, RFC 3849)
 *   - ::ffff:a.b.c.d (IPv4-mapped, normalize and re-check IPv4 rules)
 *
 * IPv6 strings are normalized to lowercase + colon-separated; we look
 * at the first hextet(s) and the IPv4-mapped prefix.
 */
function isBlockedIPv6(address: string): boolean {
  const lower = address.toLowerCase();

  // ::1 loopback (any expansion).
  if (lower === "::1") return true;
  if (lower === "::") return true; // unspecified

  // IPv4-mapped IPv6: ::ffff:a.b.c.d  OR ::ffff:<hex>:<hex>
  if (lower.startsWith("::ffff:")) {
    const tail = lower.slice("::ffff:".length);
    if (isIPv4(tail)) return isBlockedIPv4(tail);
    // Hex-encoded IPv4 form (::ffff:c0a8:0101 == 192.168.1.1).
    const hex = tail.split(":");
    if (hex.length === 2 && /^[0-9a-f]{1,4}$/.test(hex[0]!) && /^[0-9a-f]{1,4}$/.test(hex[1]!)) {
      const hi = parseInt(hex[0]!, 16);
      const lo = parseInt(hex[1]!, 16);
      const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      return isBlockedIPv4(v4);
    }
  }

  // Documentation range 2001:db8::/32
  if (lower.startsWith("2001:db8:") || lower === "2001:db8::") return true;

  // Parse the first hextet for fc00::/7, fe80::/10, ff00::/8 checks.
  // Handles both compressed (`fc00::`) and full (`fc00:0:0:...`) forms.
  // `::abc` (leading compression with no head hextet) means the first
  // hextet is 0 — that's the unspecified prefix, handled above.
  const head = lower.startsWith("::") ? "0" : lower.split(":")[0]!;
  if (!/^[0-9a-f]{1,4}$/.test(head)) return true;
  const headValue = parseInt(head, 16);

  // ff00::/8 — multicast (top 8 bits == 0xff)
  if ((headValue & 0xff00) === 0xff00) return true;
  // fc00::/7 — unique local (top 7 bits == 0xfc)
  if ((headValue & 0xfe00) === 0xfc00) return true;
  // fe80::/10 — link-local (top 10 bits == 0xfe80)
  if ((headValue & 0xffc0) === 0xfe80) return true;

  return false;
}

export interface ValidateOptions {
  /** Override the DNS resolver. Tests pass an in-memory mock. */
  resolver?: DnsResolver;
}

/**
 * Main entry point. Throws `HttpRequestBlockedDestinationError` if the
 * destination is blocked. Returns normally for allowed destinations.
 *
 * Takes a parsed `URL` (not a string) so the caller has already done
 * scheme + URL syntax validation; this function is solely about the
 * host's network reachability.
 */
export async function validateEgressDestination(
  url: URL,
  opts: ValidateOptions = {},
): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpRequestBlockedDestinationError();
  }

  const rawHost = url.hostname;
  if (typeof rawHost !== "string" || rawHost.length === 0) {
    throw new HttpRequestBlockedDestinationError();
  }

  // URL hostnames may include a trailing dot ("example.com.") that
  // signals the FQDN to a DNS resolver. Normalize before denylist
  // comparison so an attacker cannot bypass via "localhost." form.
  const normalizedHost = rawHost.toLowerCase().replace(/\.$/, "");

  // Strip bracketed IPv6 form: URL.hostname returns the brackets in
  // some Node versions; strip them so isIPv6 works on the literal.
  const unbracketed = normalizedHost.startsWith("[") && normalizedHost.endsWith("]")
    ? normalizedHost.slice(1, -1)
    : normalizedHost;

  // 1. Hostname denylist (pre-DNS). The `.localhost` reserved TLD per
  // RFC 6761 is treated the same as bare `localhost`.
  if (
    BLOCKED_HOSTNAMES.has(unbracketed) ||
    unbracketed.endsWith(".localhost")
  ) {
    throw new HttpRequestBlockedDestinationError();
  }

  // 2. IP literal: check directly, no DNS round-trip.
  if (isIPv4(unbracketed) || isIPv6(unbracketed)) {
    if (isBlockedIp(unbracketed)) {
      throw new HttpRequestBlockedDestinationError();
    }
    return;
  }

  // 3. Domain: resolve and validate every address. Fail-closed on
  // resolver error (NXDOMAIN, timeout, network refused).
  const resolver = opts.resolver ?? DEFAULT_RESOLVER;
  let addresses: readonly string[];
  try {
    addresses = await resolver(unbracketed);
  } catch {
    throw new HttpRequestBlockedDestinationError();
  }

  if (addresses.length === 0) {
    throw new HttpRequestBlockedDestinationError();
  }

  for (const addr of addresses) {
    if (isBlockedIp(addr)) {
      throw new HttpRequestBlockedDestinationError();
    }
  }
}
