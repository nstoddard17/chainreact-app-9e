/**
 * CR-FAILREASON-1 — HumanizedErrorSchema action taxonomy + back-compat.
 *
 * The persisted `workflow_runs.error_classification` JSONB is validated by this
 * schema on read. The action enum was extended from 3 values to 5; every
 * previously-persisted row (old 3 values, or no action at all) must still parse.
 */
import { HumanizedErrorSchema } from "@/contracts/workflow";

const base = { title: "t", description: "d", severity: "error" as const };

describe("HumanizedErrorSchema.action — CR-FAILREASON-1", () => {
  it.each([
    "reconnect",
    "open_node",
    "retry_later",
    "upgrade_plan",
    "contact_support",
  ])("accepts the new full taxonomy value %s", (action) => {
    expect(HumanizedErrorSchema.safeParse({ ...base, action }).success).toBe(true);
  });

  it.each(["reconnect", "open_node", "upgrade_plan"])(
    "still parses a previously-persisted row with legacy action %s (back-compat)",
    (action) => {
      expect(HumanizedErrorSchema.safeParse({ ...base, action }).success).toBe(true);
    },
  );

  it("parses a legacy row with NO action (pre-action classification)", () => {
    const parsed = HumanizedErrorSchema.safeParse(base);
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown action value", () => {
    expect(
      HumanizedErrorSchema.safeParse({ ...base, action: "do_something" }).success,
    ).toBe(false);
  });
});
