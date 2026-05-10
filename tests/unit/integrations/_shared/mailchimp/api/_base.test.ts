/**
 * @jest-environment node
 *
 * Tests for `_shared/mailchimp/api/_base.ts` — the per-datacenter
 * API host routing foundation. Slice 14 Commit 2.
 *
 * Verifies:
 *   - `mailchimpLoginBase()` defaults to `https://login.mailchimp.com`
 *     and honors the `MAILCHIMP_LOGIN_BASE` env override.
 *   - `mailchimpApiOrigin(dc)` constructs `https://${dc}.api.mailchimp.com`
 *     by default, accepts the `MAILCHIMP_API_BASE_OVERRIDE` env override
 *     for e2e mocks (single localhost port serves all DCs), and throws
 *     `MissingDataCenterError` on empty / null / undefined dc.
 *   - `mailchimpApiUrl(dc, path)` builds full URLs with the
 *     `/3.0/<path>` versioned prefix, normalizes leading-slash
 *     differences, and propagates the dc-missing failure.
 *   - `MAILCHIMP_API_VERSION` is pinned to `"3.0"`.
 */
import {
  MAILCHIMP_API_VERSION,
  mailchimpApiOrigin,
  mailchimpApiUrl,
  mailchimpLoginBase,
} from "@/integrations/_shared/mailchimp/api/_base";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";

afterEach(() => {
  delete process.env.MAILCHIMP_LOGIN_BASE;
  delete process.env.MAILCHIMP_API_BASE_OVERRIDE;
});

describe("MAILCHIMP_API_VERSION", () => {
  it("is pinned to '3.0' (matches manifest apiVersion)", () => {
    expect(MAILCHIMP_API_VERSION).toBe("3.0");
  });
});

describe("mailchimpLoginBase", () => {
  it("defaults to https://login.mailchimp.com (production-safe)", () => {
    delete process.env.MAILCHIMP_LOGIN_BASE;
    expect(mailchimpLoginBase()).toBe("https://login.mailchimp.com");
  });

  it("honors MAILCHIMP_LOGIN_BASE override (e2e mock surface)", () => {
    process.env.MAILCHIMP_LOGIN_BASE = "http://localhost:9885";
    expect(mailchimpLoginBase()).toBe("http://localhost:9885");
  });
});

describe("mailchimpApiOrigin", () => {
  it("constructs the per-dc origin from the dc prefix", () => {
    // The canonical Mailchimp wire-format: every account has a
    // `dc` value like 'us21' or 'eu1', and the REST API is served
    // from `https://${dc}.api.mailchimp.com`. This is the test that
    // proves V2's dc-routing model works.
    expect(mailchimpApiOrigin("us21")).toBe("https://us21.api.mailchimp.com");
    expect(mailchimpApiOrigin("eu1")).toBe("https://eu1.api.mailchimp.com");
    expect(mailchimpApiOrigin("us1")).toBe("https://us1.api.mailchimp.com");
  });

  it("honors MAILCHIMP_API_BASE_OVERRIDE (e2e single-port mock)", () => {
    // For the e2e mock server: a single localhost port serves
    // every Mailchimp account regardless of dc. The override
    // collapses `${dc}.api.mailchimp.com` → the override base.
    process.env.MAILCHIMP_API_BASE_OVERRIDE = "http://localhost:9885";
    expect(mailchimpApiOrigin("us21")).toBe("http://localhost:9885");
    expect(mailchimpApiOrigin("eu1")).toBe("http://localhost:9885");
  });

  it("throws MissingDataCenterError on empty string dc", () => {
    expect(() => mailchimpApiOrigin("")).toThrow(MissingDataCenterError);
  });

  it("throws MissingDataCenterError on null dc", () => {
    expect(() => mailchimpApiOrigin(null)).toThrow(MissingDataCenterError);
  });

  it("throws MissingDataCenterError on undefined dc", () => {
    expect(() => mailchimpApiOrigin(undefined)).toThrow(MissingDataCenterError);
  });

  it("dc-missing error wins over the env override (fail-loud even when override would succeed)", () => {
    // Anti-test. The env override is a wire-host substitution; it
    // does NOT excuse a missing dc value. Even with the override
    // in play, callers must thread an actual dc through — the
    // override exists to redirect traffic, not to mask data drift.
    process.env.MAILCHIMP_API_BASE_OVERRIDE = "http://localhost:9885";
    expect(() => mailchimpApiOrigin(null)).toThrow(MissingDataCenterError);
  });
});

describe("mailchimpApiUrl", () => {
  it("builds the full versioned URL with leading-slash path", () => {
    expect(mailchimpApiUrl("us21", "/lists/abc/members")).toBe(
      "https://us21.api.mailchimp.com/3.0/lists/abc/members",
    );
  });

  it("normalizes paths without a leading slash", () => {
    expect(mailchimpApiUrl("us21", "lists/abc")).toBe(
      "https://us21.api.mailchimp.com/3.0/lists/abc",
    );
  });

  it("handles the root path '/'", () => {
    expect(mailchimpApiUrl("us21", "/")).toBe(
      "https://us21.api.mailchimp.com/3.0/",
    );
  });

  it("uses the env override for the origin half", () => {
    process.env.MAILCHIMP_API_BASE_OVERRIDE = "http://localhost:9885";
    expect(mailchimpApiUrl("us21", "/lists")).toBe(
      "http://localhost:9885/3.0/lists",
    );
  });

  it("throws MissingDataCenterError when dc is empty (path doesn't matter)", () => {
    expect(() => mailchimpApiUrl("", "/lists")).toThrow(MissingDataCenterError);
  });

  it("throws MissingDataCenterError when dc is null", () => {
    expect(() => mailchimpApiUrl(null, "/lists")).toThrow(MissingDataCenterError);
  });
});
