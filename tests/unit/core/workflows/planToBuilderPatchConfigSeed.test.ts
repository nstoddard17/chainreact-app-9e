/** @jest-environment node */
/**
 * Plan-config seeding on Apply (REACT-CONFIG-COVERAGE-1).
 *
 * Pins that `planToBuilderPatch` seeds BOTH sources into the applied node's config:
 *   - the server-sanitized plan-step `config` (values the user supplied in their request), and
 *   - guided-setup card values (`previewConfig`), which OVERRIDE plan values per key;
 * that secret-shaped keys can never seed, that explicit `false`/`0` survive, and that unsupplied
 * fields stay absent (no guessing).
 */
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import { planToBuilderPatch } from "@/core/workflows/planToBuilderPatch";
import type { PreviewSetupFieldsByType } from "@/core/workflows/previewSetupFields";

const SETUP_FIELDS: PreviewSetupFieldsByType = {
  "gmail:new_email": [
    { name: "subject", label: "Subject", type: "text", required: false },
    { name: "subjectExactMatch", label: "Exact", type: "boolean", required: false },
  ],
  "slack:send_channel_message": [
    { name: "text", label: "Message", type: "textarea", required: true },
  ],
};

function plan(): WorkflowPlan {
  return {
    schemaVersion: 1,
    title: "T",
    summary: "S",
    steps: [
      {
        ref: "s0",
        role: "trigger",
        provider: "gmail",
        type: "new_email",
        purpose: "",
        config: {
          from: ["vendor@example.com"], // no supported card control — must still seed
          subject: "Invoice",
          subjectExactMatch: false,
          maxCount: 0,
          apiToken: "sk-nope", // secret-shaped key — must never seed
        },
      },
      { ref: "s1", role: "action", provider: "slack", type: "send_channel_message", purpose: "" },
    ],
    notApplied: true,
  };
}

describe("planToBuilderPatch — plan-config seeding", () => {
  it("seeds user-request values including unsupported-control fields, preserving false/0, dropping secret keys", () => {
    const patch = planToBuilderPatch(plan(), { setupFieldsByType: SETUP_FIELDS });
    expect(patch).not.toBeNull();
    const trigger = patch!.nodes[0]!;
    expect(trigger.config).toEqual({
      from: ["vendor@example.com"],
      subject: "Invoice",
      subjectExactMatch: false,
      maxCount: 0,
    });
    // Unsupplied step → no config at all (no guessing).
    expect(patch!.nodes[1]!.config).toBeUndefined();
  });

  it("guided-setup card values override plan values per key; other plan values persist", () => {
    const patch = planToBuilderPatch(plan(), {
      setupFieldsByType: SETUP_FIELDS,
      previewConfig: { "preview-step-1": { subject: "Receipt" } },
    });
    const trigger = patch!.nodes[0]!;
    expect(trigger.config!.subject).toBe("Receipt"); // card wins
    expect(trigger.config!.from).toEqual(["vendor@example.com"]); // plan value persists
    expect(trigger.config!.subjectExactMatch).toBe(false);
  });

  it("create-and-edit parity note: the same values flow through addNode-equivalent seeding here; the edit path is covered by configMergePreservation.test.ts", () => {
    // Guard: an empty plan-config step with card input still seeds the card input (pre-existing path).
    const p = plan();
    const noCfg: WorkflowPlan = { ...p, steps: p.steps.map(({ config: _c, ...rest }) => rest) };
    const patch = planToBuilderPatch(noCfg, {
      setupFieldsByType: SETUP_FIELDS,
      previewConfig: { "preview-step-2": { text: "hello" } },
    });
    expect(patch!.nodes[1]!.config).toEqual({ text: "hello" });
  });
});
