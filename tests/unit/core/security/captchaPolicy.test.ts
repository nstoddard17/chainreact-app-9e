/**
 * @jest-environment node
 *
 * Environment matrix for the central CAPTCHA policy (LOCAL-AUTH-CAPTCHA-BYPASS-1).
 *
 * The policy is the REAL one — never mocked here. The axis that decides the
 * mode is the Supabase project the build targets (the backend that actually
 * enforces captcha), never the browser hostname alone; the hostname can only
 * REVOKE a local bypass (LAN visit to a dev server), never grant one.
 */

import {
  classifySupabaseTarget,
  resolveCaptchaMode,
  type CaptchaPolicyInput,
} from "@/core/security/turnstile";

const PROD_SUPABASE = "https://qcepijemjlkssfkvzlio.supabase.co";
const DEV_SUPABASE = "https://syvnzqzctnywakgyykmz.supabase.co";
const LOCAL_STACK = "http://127.0.0.1:54321";

function mode(input: Partial<CaptchaPolicyInput>): string {
  return resolveCaptchaMode({
    nodeEnv: "production",
    supabaseUrl: PROD_SUPABASE,
    hostname: undefined,
    ...input,
  });
}

describe("production backend — always required, never hostname-derived", () => {
  it("production build on the production domain", () => {
    expect(mode({ hostname: "chainreact.app" })).toBe("required");
  });

  it("production backend viewed from localhost is STILL required (no silent bypass)", () => {
    expect(mode({ nodeEnv: "development", hostname: "localhost" })).toBe("required");
    expect(mode({ nodeEnv: "development", hostname: "127.0.0.1" })).toBe("required");
  });

  it("a spoofed/unexpected hostname cannot disable captcha on the production backend", () => {
    expect(mode({ hostname: "localhost" })).toBe("required");
    expect(mode({ hostname: "evil.example" })).toBe("required");
  });
});

describe("local loopback development — disabled only with BOTH conditions", () => {
  it.each(["localhost", "127.0.0.1", "::1", "[::1]"])(
    "local stack + next dev + loopback host %s → disabled",
    (hostname) => {
      expect(mode({ nodeEnv: "development", supabaseUrl: LOCAL_STACK, hostname })).toBe(
        "disabled",
      );
    },
  );

  it("LAN IP visiting a local dev server → required (hostname revokes the bypass)", () => {
    expect(
      mode({ nodeEnv: "development", supabaseUrl: LOCAL_STACK, hostname: "192.168.1.50" }),
    ).toBe("required");
  });

  it("local stack WITHOUT a dev server (production build) → required", () => {
    expect(mode({ nodeEnv: "production", supabaseUrl: LOCAL_STACK, hostname: "localhost" })).toBe(
      "required",
    );
  });

  it("SSR/first render (hostname unknown) under next dev + local stack → disabled, no hydration fork", () => {
    expect(mode({ nodeEnv: "development", supabaseUrl: LOCAL_STACK, hostname: undefined })).toBe(
      "disabled",
    );
  });
});

describe("hosted v2-dev — the approved branch-scoped bypass", () => {
  it("dev project + production build (the v2-dev lane) → disabled", () => {
    expect(
      mode({ supabaseUrl: DEV_SUPABASE, hostname: "dev.chainreact.app" }),
    ).toBe("disabled");
  });

  it("dev project + local dev server on loopback → disabled (dev:devdb flow)", () => {
    expect(mode({ nodeEnv: "development", supabaseUrl: DEV_SUPABASE, hostname: "localhost" })).toBe(
      "disabled",
    );
  });

  it("dev project + local dev server viewed from a LAN IP → required", () => {
    expect(
      mode({ nodeEnv: "development", supabaseUrl: DEV_SUPABASE, hostname: "10.0.0.7" }),
    ).toBe("required");
  });
});

describe("unknown / missing environments — fail closed", () => {
  it("unknown Supabase backend (preview pointed somewhere else) → required", () => {
    expect(mode({ supabaseUrl: "https://zzzzunknownproject.supabase.co" })).toBe("required");
    expect(
      mode({ nodeEnv: "development", supabaseUrl: "https://zzzzunknownproject.supabase.co", hostname: "localhost" }),
    ).toBe("required");
  });

  it("missing environment data → required", () => {
    expect(mode({ supabaseUrl: undefined })).toBe("required");
    expect(mode({ supabaseUrl: undefined, nodeEnv: undefined, hostname: "anything.example" })).toBe(
      "required",
    );
  });

  it("malformed Supabase URL → required", () => {
    expect(mode({ supabaseUrl: "not a url" })).toBe("required");
  });

  it("missing nodeEnv never grants a local bypass", () => {
    expect(mode({ nodeEnv: undefined, supabaseUrl: LOCAL_STACK, hostname: "localhost" })).toBe(
      "required",
    );
  });
});

describe("classifySupabaseTarget — the authoritative base axis (BYPASS-2)", () => {
  it("classifies the production project", () => {
    expect(classifySupabaseTarget(PROD_SUPABASE)).toBe("production");
    expect(classifySupabaseTarget(`${PROD_SUPABASE}/`)).toBe("production");
  });

  it("classifies the approved development project", () => {
    expect(classifySupabaseTarget(DEV_SUPABASE)).toBe("development");
  });

  it.each([
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "http://localhost:54321/",
    "http://127.0.0.1:64321",
    "http://[::1]:54321",
  ])("classifies the local stack regardless of port/slash/IPv6 form: %s", (url) => {
    expect(classifySupabaseTarget(url)).toBe("local-stack");
  });

  it("classifies unknown, malformed, and missing URLs as unknown (fail closed upstream)", () => {
    expect(classifySupabaseTarget("https://zzzzunknownproject.supabase.co")).toBe("unknown");
    expect(classifySupabaseTarget("not a url")).toBe("unknown");
    expect(classifySupabaseTarget(undefined)).toBe("unknown");
    expect(classifySupabaseTarget("https://myapp-preview.vercel.app")).toBe("unknown");
  });
});

describe("local-stack URL variants resolve like the local stack", () => {
  it.each(["http://localhost:54321", "http://127.0.0.1:54321", "http://[::1]:54321"])(
    "next dev + loopback host + %s → disabled",
    (supabaseUrl) => {
      expect(mode({ nodeEnv: "development", supabaseUrl, hostname: "localhost" })).toBe(
        "disabled",
      );
    },
  );
});

describe("SSR/first-render consistency — undefined hostname never differs from loopback", () => {
  // The client's first render must match the server render (no hydration
  // fork), and a loopback visitor must then see NO post-mount flip. Only a
  // NON-loopback hostname may change the result — and only toward "required".
  const targets: Array<[string, string | undefined]> = [
    ["production", PROD_SUPABASE],
    ["development", DEV_SUPABASE],
    ["local-stack", LOCAL_STACK],
    ["unknown", "https://zzzzunknownproject.supabase.co"],
    ["missing", undefined],
  ];
  it.each(targets)("%s target under next dev: undefined === localhost", (_label, supabaseUrl) => {
    const ssr = mode({ nodeEnv: "development", supabaseUrl, hostname: undefined });
    const hydrated = mode({ nodeEnv: "development", supabaseUrl, hostname: "localhost" });
    expect(hydrated).toBe(ssr);
  });

  it("a hostname can only tighten, never loosen", () => {
    for (const [, supabaseUrl] of targets) {
      const base = mode({ nodeEnv: "development", supabaseUrl, hostname: undefined });
      const lan = mode({ nodeEnv: "development", supabaseUrl, hostname: "192.168.0.9" });
      if (base === "required") expect(lan).toBe("required");
    }
  });
});

describe("jest convenience", () => {
  it("NODE_ENV=test → disabled (unreachable in real builds; keeps suites at pre-policy behavior)", () => {
    expect(mode({ nodeEnv: "test", supabaseUrl: undefined })).toBe("disabled");
  });
});
