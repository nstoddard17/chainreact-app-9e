/**
 * @jest-environment node
 *
 * Slice 3.SEC-3 — tests for the http_request egress policy.
 *
 * Two layers tested here:
 *   1. `isBlockedIp` — pure IP classifier. Exhaustive table tests over
 *      every blocked IPv4/IPv6 bucket and a sample of allowed addresses.
 *   2. `validateEgressDestination` — full URL validator with injected
 *      DNS resolver. Covers scheme guard, hostname denylist, IP-literal
 *      hosts, domain hosts that resolve to public / private / mixed
 *      IP sets, DNS failure (fail-closed), empty resolution.
 *
 * Handler integration (fetch never invoked when blocked, redirect:
 * manual, etc.) is tested separately in `httpRequest.test.ts`.
 */

import {
  HttpRequestBlockedDestinationError,
  isBlockedIp,
  validateEgressDestination,
  type DnsResolver,
} from "@/integrations/native/actions/httpRequestEgress";

// ─── isBlockedIp — IPv4 ──────────────────────────────────────────────────────

describe("isBlockedIp — IPv4 blocked ranges", () => {
  const BLOCKED_IPV4: ReadonlyArray<[string, string]> = [
    ["0.0.0.0", "0.0.0.0/8 unspecified"],
    ["0.1.2.3", "0.0.0.0/8"],
    ["10.0.0.1", "10.0.0.0/8 RFC1918"],
    ["10.255.255.255", "10.0.0.0/8 upper"],
    ["100.64.0.1", "100.64.0.0/10 CGNAT"],
    ["100.127.255.255", "100.64.0.0/10 upper"],
    ["127.0.0.1", "loopback"],
    ["127.255.255.255", "loopback upper"],
    ["169.254.0.1", "link-local"],
    ["169.254.169.254", "AWS/GCP/Azure metadata"],
    ["172.16.0.1", "172.16.0.0/12 lower"],
    ["172.31.255.255", "172.16.0.0/12 upper"],
    ["192.0.0.1", "192.0.0.0/24 IANA special"],
    ["192.0.2.1", "TEST-NET-1 (caught by 192.0.0.0/24)"],
    ["192.168.0.1", "RFC1918 192.168/16"],
    ["192.168.255.255", "RFC1918 192.168/16 upper"],
    ["198.18.0.1", "RFC2544 benchmark lower"],
    ["198.19.255.255", "RFC2544 benchmark upper"],
    ["198.51.100.1", "TEST-NET-2"],
    ["203.0.113.1", "TEST-NET-3"],
    ["224.0.0.1", "multicast lower"],
    ["239.255.255.255", "multicast upper"],
    ["240.0.0.1", "reserved /4 lower"],
    ["255.255.255.255", "broadcast"],
  ];

  for (const [addr, reason] of BLOCKED_IPV4) {
    it(`blocks ${addr} — ${reason}`, () => {
      expect(isBlockedIp(addr)).toBe(true);
    });
  }
});

describe("isBlockedIp — IPv4 allowed addresses (sample)", () => {
  const ALLOWED_IPV4 = [
    "1.1.1.1",        // Cloudflare public
    "8.8.8.8",        // Google public
    "93.184.216.34",  // example.com
    "172.15.0.1",     // just outside 172.16/12
    "172.32.0.1",     // just above 172.31
    "192.169.0.1",    // just outside 192.168/16
    "192.167.255.255",// just below 192.168/16
    "100.63.255.255", // just below CGNAT
    "100.128.0.1",    // just above CGNAT
    "169.253.255.255",// just below 169.254/16
    "169.255.0.1",    // just above 169.254/16
    "11.0.0.1",       // just above 10/8
    "9.255.255.255",  // just below 10/8
    "126.255.255.255",// just below 127/8
    "128.0.0.1",      // just above 127/8
    "223.255.255.255",// just below 224/4 multicast
  ];

  for (const addr of ALLOWED_IPV4) {
    it(`allows ${addr}`, () => {
      expect(isBlockedIp(addr)).toBe(false);
    });
  }
});

// ─── isBlockedIp — IPv6 ──────────────────────────────────────────────────────

describe("isBlockedIp — IPv6 blocked ranges", () => {
  const BLOCKED_IPV6: ReadonlyArray<[string, string]> = [
    ["::1", "loopback"],
    ["::", "unspecified"],
    ["fc00::1", "fc00::/7 unique local lower"],
    ["fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "fc00::/7 unique local upper"],
    ["fe80::1", "fe80::/10 link-local"],
    ["fe80::abcd:1234", "fe80::/10 link-local another form"],
    ["ff00::1", "ff00::/8 multicast"],
    ["ff02::1", "multicast all-nodes"],
    ["2001:db8::1", "2001:db8::/32 documentation"],
    ["2001:db8:abcd::1", "2001:db8::/32 documentation deeper"],
    // IPv4-mapped IPv6 — should re-check IPv4 rules.
    ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
    ["::ffff:10.0.0.1", "IPv4-mapped RFC1918"],
    ["::ffff:169.254.169.254", "IPv4-mapped metadata"],
    ["::ffff:192.168.1.1", "IPv4-mapped RFC1918 .168"],
  ];

  for (const [addr, reason] of BLOCKED_IPV6) {
    it(`blocks ${addr} — ${reason}`, () => {
      expect(isBlockedIp(addr)).toBe(true);
    });
  }
});

describe("isBlockedIp — IPv6 allowed addresses (sample)", () => {
  const ALLOWED_IPV6 = [
    "2606:4700:4700::1111", // Cloudflare public
    "2001:4860:4860::8888", // Google public DNS
    "2606:2800:220:1:248:1893:25c8:1946", // example.com
    "::ffff:8.8.8.8",       // IPv4-mapped public
    "fb00::1",              // just below fc00/7
    "fec0::1",              // just above fe80/10
  ];

  for (const addr of ALLOWED_IPV6) {
    it(`allows ${addr}`, () => {
      expect(isBlockedIp(addr)).toBe(false);
    });
  }
});

describe("isBlockedIp — invalid input fails closed", () => {
  it("blocks empty string", () => {
    expect(isBlockedIp("")).toBe(true);
  });
  it("blocks garbage", () => {
    expect(isBlockedIp("not-an-ip")).toBe(true);
  });
  it("blocks IPv4 with out-of-range octet", () => {
    expect(isBlockedIp("256.0.0.1")).toBe(true);
  });
  it("blocks IPv4 with negative octet", () => {
    expect(isBlockedIp("-1.0.0.1")).toBe(true);
  });
});

// ─── validateEgressDestination — scheme + denylist ───────────────────────────

describe("validateEgressDestination — scheme guard (defense in depth)", () => {
  const ALWAYS_FAIL: DnsResolver = async () => {
    throw new Error("should not be called");
  };

  it("rejects file: URLs", async () => {
    await expect(
      validateEgressDestination(new URL("file:///etc/passwd"), { resolver: ALWAYS_FAIL }),
    ).rejects.toBeInstanceOf(HttpRequestBlockedDestinationError);
  });

  it("rejects ftp: URLs", async () => {
    await expect(
      validateEgressDestination(new URL("ftp://example.com/x"), { resolver: ALWAYS_FAIL }),
    ).rejects.toBeInstanceOf(HttpRequestBlockedDestinationError);
  });
});

describe("validateEgressDestination — hostname denylist", () => {
  const ALWAYS_PUBLIC: DnsResolver = async () => ["1.1.1.1"];

  for (const host of [
    "localhost",
    "LOCALHOST",
    "localhost.",
    "anything.localhost",
    "metadata.google.internal",
    "metadata.azure.com",
    "metadata",
    "instance-data.ec2.internal",
    "169.254.169.254", // also caught by IP literal but lives in denylist for symmetry
  ]) {
    it(`blocks ${host} BEFORE issuing DNS`, async () => {
      const resolver = jest.fn(ALWAYS_PUBLIC);
      await expect(
        validateEgressDestination(new URL(`https://${host}/path`), { resolver }),
      ).rejects.toBeInstanceOf(HttpRequestBlockedDestinationError);
      // Denylist hits trigger zero DNS calls (except for the 169.254.169.254
      // case which IS an IP literal — same outcome, no DNS).
      expect(resolver).not.toHaveBeenCalled();
    });
  }
});

// ─── validateEgressDestination — IP-literal hosts ────────────────────────────

describe("validateEgressDestination — IPv4 literal hosts", () => {
  const NEVER_RESOLVE: DnsResolver = async () => {
    throw new Error("should not be called");
  };

  it("blocks https://127.0.0.1/", async () => {
    await expect(
      validateEgressDestination(new URL("https://127.0.0.1/"), { resolver: NEVER_RESOLVE }),
    ).rejects.toBeInstanceOf(HttpRequestBlockedDestinationError);
  });

  it("blocks https://10.0.0.5/api", async () => {
    await expect(
      validateEgressDestination(new URL("https://10.0.0.5/api"), { resolver: NEVER_RESOLVE }),
    ).rejects.toBeInstanceOf(HttpRequestBlockedDestinationError);
  });

  it("blocks https://192.168.1.1/", async () => {
    await expect(
      validateEgressDestination(new URL("https://192.168.1.1/"), { resolver: NEVER_RESOLVE }),
    ).rejects.toBeInstanceOf(HttpRequestBlockedDestinationError);
  });

  it("blocks https://169.254.169.254/latest/meta-data/", async () => {
    await expect(
      validateEgressDestination(
        new URL("https://169.254.169.254/latest/meta-data/"),
        { resolver: NEVER_RESOLVE },
      ),
    ).rejects.toBeInstanceOf(HttpRequestBlockedDestinationError);
  });

  it("allows https://1.1.1.1/ (public IPv4 literal)", async () => {
    await expect(
      validateEgressDestination(new URL("https://1.1.1.1/"), { resolver: NEVER_RESOLVE }),
    ).resolves.toBeUndefined();
  });
});

describe("validateEgressDestination — IPv6 literal hosts (bracketed)", () => {
  const NEVER_RESOLVE: DnsResolver = async () => {
    throw new Error("should not be called");
  };

  it("blocks https://[::1]/", async () => {
    await expect(
      validateEgressDestination(new URL("https://[::1]/"), { resolver: NEVER_RESOLVE }),
    ).rejects.toBeInstanceOf(HttpRequestBlockedDestinationError);
  });

  it("blocks https://[fc00::1]/", async () => {
    await expect(
      validateEgressDestination(new URL("https://[fc00::1]/"), { resolver: NEVER_RESOLVE }),
    ).rejects.toBeInstanceOf(HttpRequestBlockedDestinationError);
  });

  it("blocks https://[fe80::1234]/", async () => {
    await expect(
      validateEgressDestination(new URL("https://[fe80::1234]/"), { resolver: NEVER_RESOLVE }),
    ).rejects.toBeInstanceOf(HttpRequestBlockedDestinationError);
  });

  it("allows https://[2606:4700:4700::1111]/ (public Cloudflare IPv6)", async () => {
    await expect(
      validateEgressDestination(new URL("https://[2606:4700:4700::1111]/"), {
        resolver: NEVER_RESOLVE,
      }),
    ).resolves.toBeUndefined();
  });
});

// ─── validateEgressDestination — DNS resolution ──────────────────────────────

describe("validateEgressDestination — DNS-resolved hosts", () => {
  it("allows a domain that resolves only to public IPs", async () => {
    const resolver: DnsResolver = async () => ["93.184.216.34"];
    await expect(
      validateEgressDestination(new URL("https://example.com/path"), { resolver }),
    ).resolves.toBeUndefined();
  });

  it("blocks a domain that resolves to a private IPv4", async () => {
    const resolver: DnsResolver = async () => ["10.0.0.5"];
    await expect(
      validateEgressDestination(new URL("https://attacker.example/"), { resolver }),
    ).rejects.toBeInstanceOf(HttpRequestBlockedDestinationError);
  });

  it("blocks a domain that resolves to 169.254.169.254 metadata", async () => {
    const resolver: DnsResolver = async () => ["169.254.169.254"];
    await expect(
      validateEgressDestination(new URL("https://innocent-name.example/"), { resolver }),
    ).rejects.toBeInstanceOf(HttpRequestBlockedDestinationError);
  });

  it("blocks a domain whose A records are MIXED (one public, one private)", async () => {
    // Defense against split-horizon: a single private address rejects.
    const resolver: DnsResolver = async () => ["1.1.1.1", "10.0.0.5"];
    await expect(
      validateEgressDestination(new URL("https://mixed.example/"), { resolver }),
    ).rejects.toBeInstanceOf(HttpRequestBlockedDestinationError);
  });

  it("blocks a domain that resolves to an IPv6 link-local", async () => {
    const resolver: DnsResolver = async () => ["fe80::abcd"];
    await expect(
      validateEgressDestination(new URL("https://v6-attacker.example/"), { resolver }),
    ).rejects.toBeInstanceOf(HttpRequestBlockedDestinationError);
  });
});

describe("validateEgressDestination — fail-closed on resolver errors", () => {
  it("blocks when DNS throws (NXDOMAIN / timeout / network error)", async () => {
    const resolver: DnsResolver = async () => {
      throw new Error("ENOTFOUND");
    };
    await expect(
      validateEgressDestination(new URL("https://nonexistent.example/"), { resolver }),
    ).rejects.toBeInstanceOf(HttpRequestBlockedDestinationError);
  });

  it("blocks when DNS returns an empty address list", async () => {
    const resolver: DnsResolver = async () => [];
    await expect(
      validateEgressDestination(new URL("https://empty.example/"), { resolver }),
    ).rejects.toBeInstanceOf(HttpRequestBlockedDestinationError);
  });
});

describe("validateEgressDestination — host normalization", () => {
  it("normalizes trailing-dot FQDN so `localhost.` is blocked the same as `localhost`", async () => {
    const resolver = jest.fn<Promise<readonly string[]>, [string]>(async () => ["1.1.1.1"]);
    await expect(
      validateEgressDestination(new URL("https://localhost./"), { resolver }),
    ).rejects.toBeInstanceOf(HttpRequestBlockedDestinationError);
    expect(resolver).not.toHaveBeenCalled();
  });

  it("normalizes case so `LOCALHOST` is blocked", async () => {
    const resolver = jest.fn<Promise<readonly string[]>, [string]>(async () => ["1.1.1.1"]);
    await expect(
      validateEgressDestination(new URL("https://LOCALHOST/"), { resolver }),
    ).rejects.toBeInstanceOf(HttpRequestBlockedDestinationError);
    expect(resolver).not.toHaveBeenCalled();
  });
});

// ─── Error shape ────────────────────────────────────────────────────────────

describe("HttpRequestBlockedDestinationError", () => {
  it("carries a stable .code field for downstream branching", () => {
    const e = new HttpRequestBlockedDestinationError();
    expect(e.code).toBe("HTTP_REQUEST_BLOCKED_DESTINATION");
    expect(e.name).toBe("HttpRequestBlockedDestinationError");
  });

  it("default message does NOT echo a URL (paths can leak resolved-variable secrets)", () => {
    const e = new HttpRequestBlockedDestinationError();
    expect(e.message).toBe("Request destination is blocked by egress policy.");
    expect(e.message).not.toContain("http://");
    expect(e.message).not.toContain("https://");
    expect(e.message).not.toContain("?");
  });
});
