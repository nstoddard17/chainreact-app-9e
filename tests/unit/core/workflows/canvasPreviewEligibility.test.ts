/**
 * canvasPreviewEligibility — deterministic "Show on canvas" guard
 * (BUILDER-AGENT-RAIL-CANVAS-PREVIEW-GUARD).
 *
 * Proves a plan that merely restates (or is a subset of) the current graph is NOT a meaningful canvas
 * preview (so the UI won't ghost duplicate nodes), while a genuinely additive/different plan is.
 */
import {
  isPlanMeaningfulCanvasPreview,
  type CanvasPreviewGraphNode,
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
