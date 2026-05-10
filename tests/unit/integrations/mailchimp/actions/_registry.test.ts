/**
 * @jest-environment node
 *
 * Registry-coverage test — confirms that all 10 Mailchimp Commit 3
 * action handlers are registered in
 * services/execution/handlers/_registry.ts AND match the manifest's
 * declaration of `capabilities.actions: true`.
 *
 * Anti-test: a forgotten registration would silently break workflows
 * (the engine looks up handlers via `getActionHandler`; a missing
 * handler returns undefined and the workflow fails at dispatch time).
 */
import { mailchimpManifest } from "@/integrations/mailchimp/manifest";
import {
  getActionHandler,
  listRegisteredHandlers,
} from "@/services/execution/handlers/_registry";

const EXPECTED_ACTIONS = [
  "add_subscriber",
  "update_subscriber",
  "remove_subscriber",
  "add_tag",
  "remove_tag",
  "get_subscriber",
  "create_segment",
  "create_audience",
  "create_custom_event",
  "add_note",
] as const;

describe("Mailchimp action registry coverage", () => {
  it("manifest declares capabilities.actions: true", () => {
    expect(mailchimpManifest.capabilities.actions).toBe(true);
  });

  it.each(EXPECTED_ACTIONS)(
    "registers handler for mailchimp:%s",
    (type) => {
      const handler = getActionHandler("mailchimp", type);
      expect(handler).toBeDefined();
      expect(typeof handler).toBe("function");
    },
  );

  it("registers exactly the 10 Batch 1 Mailchimp actions", () => {
    const mcEntries = listRegisteredHandlers().filter(
      (e) => e.provider === "mailchimp",
    );
    expect(mcEntries.map((e) => e.type).sort()).toEqual(
      [...EXPECTED_ACTIONS].sort(),
    );
  });

  it("does not register Mailchimp action types outside the Batch 1 allowlist", () => {
    // Anti-test: catches a typo'd registration like `add_subsriber`
    // (mis-spelled) that would otherwise sneak through.
    const mcTypes = listRegisteredHandlers()
      .filter((e) => e.provider === "mailchimp")
      .map((e) => e.type);
    for (const t of mcTypes) {
      expect(EXPECTED_ACTIONS).toContain(t);
    }
  });
});
