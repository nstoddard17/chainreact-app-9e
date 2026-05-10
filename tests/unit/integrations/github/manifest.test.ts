/**
 * @jest-environment node
 *
 * Tests for the GitHub provider manifest. Validation against
 * ProviderManifestSchema happens at module load (it would throw on
 * import if malformed); these tests assert the specific manifest
 * values that downstream code depends on.
 *
 * Slice 14b Commit 2 — `oauth: true`, all other capabilities `false`.
 * Subsequent commits flip `actions` (Commit 3) and `webhookTrigger`
 * (Commit 4) — those tests live in their respective commits.
 */
import { ProviderManifestSchema } from "@/contracts/integration";
import { getProvider, providerSupports } from "@/integrations/_registry";
import { githubManifest } from "@/integrations/github/manifest";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";

describe("github manifest", () => {
  it("validates against ProviderManifestSchema", () => {
    expect(() => ProviderManifestSchema.parse(githubManifest)).not.toThrow();
  });

  it("is registered in the provider registry under id 'github'", () => {
    expect(getProvider("github")).toBe(githubManifest);
  });

  it("uses provider id 'github' and displayName 'GitHub'", () => {
    expect(githubManifest.id).toBe("github");
    expect(githubManifest.displayName).toBe("GitHub");
  });

  it("declares scopes.required: ['repo', 'read:org', 'gist'] (Slice 14b Batch 1 — minimized V1 scope set)", () => {
    // Slice 14b plan doc §"Confirmed scope decisions": V1 declares
    // `repo` required, `read:org` + `gist` optional. V2 collapses to
    // all-required so a single consent prompt covers every Batch 1
    // surface (any org-owned repo op needs `read:org`; create_gist
    // needs `gist`). The `repo` scope already grants
    // webhook-management permissions per current GitHub docs — V2
    // does NOT request `admin:repo_hook` separately.
    expect(githubManifest.scopes.required).toEqual([
      "repo",
      "read:org",
      "gist",
    ]);
    expect(githubManifest.scopes.optional).toEqual([]);
    expect(githubManifest.scopes.deprecated).toEqual([]);
  });

  it("does NOT include 'admin:repo_hook' (covered by 'repo' scope per GitHub docs)", () => {
    // Anti-test. The `repo` scope grants full repo access including
    // webhook management. Adding `admin:repo_hook` separately would
    // increase the consent ask without adding capabilities.
    expect(githubManifest.scopes.required).not.toContain("admin:repo_hook");
  });

  it("does NOT include 'user' (only public profile fields needed for /user lookup)", () => {
    // Anti-test. The `/user` endpoint returns the authenticated
    // user's `login`, `name`, `id`, `avatar_url` without the `user`
    // scope. Slice 14b Batch 1 doesn't expose any actions that need
    // private profile fields, so we don't request `user`.
    expect(githubManifest.scopes.required).not.toContain("user");
  });

  it("is refreshable: false (GitHub OAuth App tokens have no refresh grant)", () => {
    // V1's `authSchemes.ts:83` is authoritative: GitHub is
    // 'non_refreshable'. V1's `oauthConfig.ts:155-159` declares
    // `refreshTokenExpirationSupported: true` but that's dead config
    // — the auth-scheme registry wins. V2 doesn't replicate the dead
    // config; the manifest is the source of truth.
    expect(githubManifest.refreshable).toBe(false);
  });

  it("uses tokenScope: 'user' with accountIdField: 'login'", () => {
    // Single GitHub integration per (user, login). The `login`
    // returned by `GET /user` (e.g. `"octocat"`) is the stable
    // GitHub username discriminator.
    expect(githubManifest.tokenScope).toBe("user");
    expect(githubManifest.accountIdField).toBe("login");
  });

  it("declares honest capabilities for Slice 14b Commit 3 (oauth + actions)", () => {
    // Slice 14b Commit 2 landed manifest + OAuth + dispatcher
    // registration. Commit 3 (this) lands 6 action handlers + flips
    // `actions: true`. Commit 4 will land the `new_commit` webhook
    // trigger + X-Hub-Signature-256 verification + flip
    // `webhookTrigger: true`. Honest-state convention: flags flip in
    // lockstep with the registrations they describe.
    expect(githubManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: false,
      pollingTrigger: false,
      actions: true,
    });
    expect(providerSupports("github", "oauth")).toBe(true);
    expect(providerSupports("github", "actions")).toBe(true);
    expect(providerSupports("github", "webhookTrigger")).toBe(false);
    expect(providerSupports("github", "pollingTrigger")).toBe(false);
  });

  it("when actions: true, the action-handler registry contains all 6 GitHub actions", () => {
    if (githubManifest.capabilities.actions) {
      const registered = listRegisteredHandlers().filter(
        (h) => h.provider === "github",
      );
      expect(registered.map((r) => r.type).sort()).toEqual([
        "add_comment",
        "create_branch",
        "create_gist",
        "create_issue",
        "create_pull_request",
        "create_repository",
      ]);
    }
  });

  it("declares apiVersion '2022-11-28' (matches V1 lifecycle + actions pin)", () => {
    // V1 sends `X-GitHub-Api-Version: 2022-11-28` on every REST call
    // (lifecycle + actions). V2 mirrors via the manifest + the
    // `_shared/github/api/_base.ts` const for cross-file consistency.
    expect(githubManifest.apiVersion).toBe("2022-11-28");
  });

  it("declares 4h health-check interval (matches V2's developer-tools tier — Slack)", () => {
    // Mid-tier between Google/Microsoft (6h) and "other" (12h).
    // Aligns with Slack's tier — developer-tools providers benefit
    // from a tighter cadence to surface revocations faster.
    expect(githubManifest.healthCheckIntervalMs).toBe(4 * 60 * 60 * 1000);
  });

  it("declares oauthFlows: ['v2'] (GitHub's current OAuth 2.0 flow)", () => {
    expect(githubManifest.oauthFlows).toEqual(["v2"]);
  });

  it("isEnabled: true (no experimental flag)", () => {
    expect(githubManifest.isEnabled).toBe(true);
    expect(githubManifest.isExperimental).toBe(false);
  });
});
