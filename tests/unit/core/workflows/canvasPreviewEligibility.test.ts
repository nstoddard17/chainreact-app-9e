/**
 * canvasPreviewEligibility — deterministic "Show on canvas" guard
 * (BUILDER-AGENT-RAIL-CANVAS-PREVIEW-GUARD).
 *
 * Proves a plan that merely restates (or is a subset of) the current graph is NOT a meaningful canvas
 * preview (so the UI won't ghost duplicate nodes), while a genuinely additive/different plan is.
 */
import {
  isPlanMeaningfulCanvasPreview,
  draftPreviewSignature,
  type CanvasPreviewGraphNode,
  type DraftPreviewSignatureInput,
} from "@/core/workflows/canvasPreviewEligibility";

const MANUAL = { provider: "native", type: "manual.run" };
const SLACK = { provider: "slack", type: "send_channel_message" };

const currentManualSlack: CanvasPreviewGraphNode[] = [
  { kind: "trigger", ...MANUAL },
  { kind: "action", ...SLACK },
];

function plan(steps: { role: string; provider: string; type: string }[]) {
  return { steps };
}

describe("isPlanMeaningfulCanvasPreview", () => {
  it("returns FALSE when the plan restates the existing trigger/action shape (same provider:type sequence)", () => {
    expect(
      isPlanMeaningfulCanvasPreview({
        currentGraph: currentManualSlack,
        plan: plan([
          { role: "trigger", ...MANUAL },
          { role: "action", ...SLACK },
        ]),
      }),
    ).toBe(false);
  });

  it("is order-insensitive and case/whitespace-insensitive for the same shape", () => {
    expect(
      isPlanMeaningfulCanvasPreview({
        currentGraph: currentManualSlack,
        plan: plan([
          { role: "action", provider: "SLACK", type: " send_channel_message " },
          { role: "trigger", provider: "Native", type: "manual.run" },
        ]),
      }),
    ).toBe(false);
  });

  it("returns FALSE for a subset plan (every proposed node already exists)", () => {
    expect(
      isPlanMeaningfulCanvasPreview({
        currentGraph: currentManualSlack,
        plan: plan([{ role: "action", ...SLACK }]),
      }),
    ).toBe(false);
  });

  it("returns TRUE when the plan adds a new step the graph does not have (additive)", () => {
    expect(
      isPlanMeaningfulCanvasPreview({
        currentGraph: currentManualSlack,
        plan: plan([
          { role: "trigger", ...MANUAL },
          { role: "action", ...SLACK },
          { role: "action", provider: "gmail", type: "send_email" },
        ]),
      }),
    ).toBe(true);
  });

  it("returns TRUE for a meaningfully different provider:type", () => {
    expect(
      isPlanMeaningfulCanvasPreview({
        currentGraph: currentManualSlack,
        plan: plan([
          { role: "trigger", provider: "gmail", type: "new_email" },
          { role: "action", ...SLACK },
        ]),
      }),
    ).toBe(true);
  });

  it("returns TRUE when building onto an empty canvas", () => {
    expect(
      isPlanMeaningfulCanvasPreview({
        currentGraph: [],
        plan: plan([{ role: "trigger", ...MANUAL }]),
      }),
    ).toBe(true);
  });

  it("fails safe (FALSE) for an empty / absent plan", () => {
    expect(isPlanMeaningfulCanvasPreview({ currentGraph: currentManualSlack, plan: plan([]) })).toBe(false);
    expect(isPlanMeaningfulCanvasPreview({ currentGraph: currentManualSlack, plan: null })).toBe(false);
    expect(isPlanMeaningfulCanvasPreview({ currentGraph: currentManualSlack, plan: undefined })).toBe(false);
  });
});

describe("draftPreviewSignature — HERMES-AGENT-PREVIEW-SHOWN-DEDUP", () => {
  function preview(over: Partial<DraftPreviewSignatureInput> = {}): DraftPreviewSignatureInput {
    return {
      version: 1,
      title: "Starter: Slack alert",
      nodes: [
        { previewId: "preview-step-1", role: "trigger", provider: "native", type: "manual.run" },
        { previewId: "preview-step-2", role: "action", provider: "slack", type: "send_channel_message" },
      ],
      edges: [{ fromPreviewId: "preview-step-1", toPreviewId: "preview-step-2" }],
      ...over,
    };
  }

  it("is STABLE: identical structure → identical signature", () => {
    expect(draftPreviewSignature(preview())).toBe(draftPreviewSignature(preview()));
  });

  it("DIFFERS when the node chain changes (different suggestion → button stays visible)", () => {
    const a = draftPreviewSignature(preview());
    const b = draftPreviewSignature(
      preview({
        nodes: [
          { previewId: "preview-step-1", role: "trigger", provider: "gmail", type: "new_email" },
          { previewId: "preview-step-2", role: "action", provider: "slack", type: "send_channel_message" },
        ],
      }),
    );
    expect(a).not.toBe(b);
  });

  it("DIFFERS on title or version change", () => {
    expect(draftPreviewSignature(preview())).not.toBe(draftPreviewSignature(preview({ title: "Other" })));
    expect(draftPreviewSignature(preview())).not.toBe(draftPreviewSignature(preview({ version: 2 })));
  });

  it("is case/whitespace-insensitive on provider:type (same shape → same signature)", () => {
    const a = draftPreviewSignature(preview());
    const b = draftPreviewSignature(
      preview({
        nodes: [
          { previewId: "preview-step-1", role: "trigger", provider: "Native", type: " manual.run " },
          { previewId: "preview-step-2", role: "action", provider: "SLACK", type: "send_channel_message" },
        ],
      }),
    );
    expect(a).toBe(b);
  });

  it("returns null for an empty/absent preview (so 'nothing shown' never matches a real suggestion)", () => {
    expect(draftPreviewSignature(null)).toBeNull();
    expect(draftPreviewSignature(undefined)).toBeNull();
    expect(draftPreviewSignature(preview({ nodes: [] }))).toBeNull();
  });
});
