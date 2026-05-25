/**
 * @jest-environment node
 *
 * Tests for the Facebook provider manifest — Slice 3.FACEBOOK-2.
 */
import { facebookManifest } from "@/integrations/facebook/manifest";
import { GRAPH_API_VERSION } from "@/integrations/_shared/facebook/version";
import { getProvider, providerSupports } from "@/integrations/_registry";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";

describe("facebook manifest", () => {
  it("is registered in the provider registry under id 'facebook'", () => {
    expect(getProvider("facebook")).toBe(facebookManifest);
  });

  it("declares the Pages-only scope set (no Ads / Groups / monetization)", () => {
    expect(facebookManifest.scopes.required).toEqual([
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "pages_manage_engagement",
      "read_insights",
      "pages_messaging",
    ]);
    expect(facebookManifest.scopes.optional).toEqual([]);
    for (const s of facebookManifest.scopes.required) {
      expect(s).not.toMatch(/ads_|business_management|groups_|monetization/);
    }
  });

  it("is NOT refreshable (long-lived user token, no refresh token — D-FB5)", () => {
    expect(facebookManifest.refreshable).toBe(false);
  });

  it("uses tokenScope user with accountIdField 'id' (the /me user id)", () => {
    expect(facebookManifest.tokenScope).toBe("user");
    expect(facebookManifest.accountIdField).toBe("id");
  });

  it("pins one Graph version via the shared constant", () => {
    expect(facebookManifest.apiVersion).toBe(GRAPH_API_VERSION);
    expect(facebookManifest.apiVersion).toMatch(/^v\d+\.\d+$/);
  });

  it("declares FACEBOOK-2 capabilities (oauth + actions; no triggers yet)", () => {
    expect(facebookManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: false,
      pollingTrigger: false,
      actions: true,
    });
    expect(providerSupports("facebook", "oauth")).toBe(true);
    expect(providerSupports("facebook", "actions")).toBe(true);
    expect(providerSupports("facebook", "webhookTrigger")).toBe(false);
    expect(providerSupports("facebook", "pollingTrigger")).toBe(false);
  });

  it("registers the full 8-action Facebook surface", () => {
    const registered = listRegisteredHandlers().filter(
      (h) => h.provider === "facebook",
    );
    expect(registered.map((r) => r.type).sort()).toEqual([
      "comment_on_post",
      "create_post",
      "delete_post",
      "get_page_insights",
      "send_message",
      "update_post",
      "upload_photo",
      "upload_video",
    ]);
  });

  it("uses a 12h health-check interval (Others bucket)", () => {
    expect(facebookManifest.healthCheckIntervalMs).toBe(12 * 60 * 60 * 1000);
  });

  it("displayName 'Facebook'; isEnabled true; oauthFlows ['v2']", () => {
    expect(facebookManifest.displayName).toBe("Facebook");
    expect(facebookManifest.isEnabled).toBe(true);
    expect(facebookManifest.isExperimental).toBe(false);
    expect(facebookManifest.oauthFlows).toEqual(["v2"]);
  });
});
