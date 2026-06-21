/**
 * @jest-environment node
 *
 * AI guidance context / memory scope guard (HERMES-AGENT-MEMORY-SCOPE-GUARD).
 * Proves buildSafeGuidanceContext enforces the team-safety contract: a foreign member's PRIVATE
 * connection becomes a generic notice (no owner identity); account-shared creds are summarizable;
 * the caller's OWN connections are summarizable for them; a personal provider can never appear as
 * "shared"; scopes are tracked; and the output NEVER carries identity/secrets/excluded data.
 */
import {
  buildSafeGuidanceContext,
  FOREIGN_PRIVATE_CONNECTION_NOTICE,
  type GuidanceContextInput,
} from "@/services/ai-guidance/guidanceContextPolicy";
import type { GeneralizedWorkflow } from "@/contracts/aiGuidance";

function generalized(providers: Array<{ kind: string; provider: string; type: string }>): GeneralizedWorkflow {
  const nodes = providers.map((p, i) => ({ ref: `n${i}`, ...p }));
  return { nodeCount: nodes.length, edgeCount: 0, nodes, edges: [] };
}

const VIEWER = "user-viewer";
const OTHER = "user-other";

function base(overrides: Partial<GuidanceContextInput> = {}): GuidanceContextInput {
  return { viewerUserId: VIEWER, account: { type: "team" }, ...overrides };
}

describe("buildSafeGuidanceContext — foreign private connection notice", () => {
  it("sets the generic notice when a team workflow by ANOTHER member uses a personal-provider node", () => {
    const ctx = buildSafeGuidanceContext(
      base({ workflow: { createdByUserId: OTHER, generalized: generalized([{ kind: "action", provider: "gmail", type: "send_email" }]) } }),
    );
    expect(ctx.privateConnectionNotice).toBe(FOREIGN_PRIVATE_CONNECTION_NOTICE);
    // No owner identity / userId leaks.
    expect(JSON.stringify(ctx)).not.toContain(OTHER);
    expect(JSON.stringify(ctx)).not.toContain(VIEWER);
  });

  it("does NOT set the notice when the viewer IS the creator (their own private connection)", () => {
    const ctx = buildSafeGuidanceContext(
      base({ workflow: { createdByUserId: VIEWER, generalized: generalized([{ kind: "action", provider: "gmail", type: "send_email" }]) } }),
    );
    expect(ctx.privateConnectionNotice).toBeUndefined();
  });

  it("does NOT set the notice for a personal account (no teammates)", () => {
    const ctx = buildSafeGuidanceContext(
      base({ account: { type: "personal" }, workflow: { createdByUserId: OTHER, generalized: generalized([{ kind: "action", provider: "gmail", type: "send_email" }]) } }),
    );
    expect(ctx.privateConnectionNotice).toBeUndefined();
  });

  it("does NOT set the notice when a foreign team workflow uses only ACCOUNT-shared providers", () => {
    const ctx = buildSafeGuidanceContext(
      base({ workflow: { createdByUserId: OTHER, generalized: generalized([{ kind: "action", provider: "slack", type: "send_message" }]) } }),
    );
    expect(ctx.privateConnectionNotice).toBeUndefined();
  });
});

describe("buildSafeGuidanceContext — credential availability summaries", () => {
  it("summarizes account-shared providers but DROPS any personal provider passed in by mistake", () => {
    const ctx = buildSafeGuidanceContext(base({ sharedCredentialProviders: ["slack", "notion", "gmail", "google-drive"] }));
    expect(ctx.sharedCredentialProviders).toEqual(["notion", "slack"]); // personal gmail/drive dropped; sorted
  });

  it("passes through the caller's OWN connection providers and marks the user scope", () => {
    const ctx = buildSafeGuidanceContext(base({ ownConnectionProviders: ["gmail", "gmail", "slack"] }));
    expect(ctx.ownConnectionProviders).toEqual(["gmail", "slack"]); // deduped + sorted
    expect(ctx.scopesIncluded).toContain("user");
  });

  it("omits credential fields entirely when none provided", () => {
    const ctx = buildSafeGuidanceContext(base());
    expect(ctx.sharedCredentialProviders).toBeUndefined();
    expect(ctx.ownConnectionProviders).toBeUndefined();
  });
});

describe("buildSafeGuidanceContext — scopes + account summary", () => {
  it("always includes account + global; adds workflow only when a workflow is provided", () => {
    const noWf = buildSafeGuidanceContext(base());
    expect(noWf.scopesIncluded).toEqual(["account", "global"]);
    const withWf = buildSafeGuidanceContext(base({ workflow: { createdByUserId: VIEWER, generalized: generalized([{ kind: "trigger", provider: "slack", type: "x" }]) } }));
    expect(withWf.scopesIncluded).toContain("workflow");
  });

  it("carries account type + optional role only (never the account id)", () => {
    const ctx = buildSafeGuidanceContext(base({ account: { type: "organization", role: "admin" } }));
    expect(ctx.account).toEqual({ type: "organization", role: "admin" });
  });
});

describe("buildSafeGuidanceContext — exclusion contract (no identity / secrets / raw data)", () => {
  it("output never contains userId, tokens, secrets, emails, or raw row markers", () => {
    const ctx = buildSafeGuidanceContext(
      base({
        account: { type: "team", role: "member" },
        workflow: { createdByUserId: OTHER, generalized: generalized([{ kind: "action", provider: "gmail", type: "send_email" }]) },
        sharedCredentialProviders: ["slack"],
        ownConnectionProviders: ["gmail"],
      }),
    );
    const s = JSON.stringify(ctx);
    for (const needle of [VIEWER, OTHER, "token", "secret", "@", "access_token", "refresh_token", "owner_user_id", "connected_by"]) {
      expect(s).not.toContain(needle);
    }
  });
});
