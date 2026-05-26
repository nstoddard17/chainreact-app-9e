/**
 * Tests for features/workflow-builder/utils/classifyNodeStatus.
 *
 * Pure helper; no React, no slices. Covers the two branches the helper
 * actually emits today (configured / unconfigured) + the forward-
 * compatible runStatus passthrough that future slices will use once
 * per-node run-state projection lands.
 */
import { classifyNodeStatus } from "@/features/workflow-builder/utils/classifyNodeStatus";

describe("classifyNodeStatus", () => {
  it("returns 'configured' when a type is present", () => {
    expect(classifyNodeStatus({ type: "slack.message.channel" })).toBe(
      "configured",
    );
    expect(classifyNodeStatus({ type: "native:manual.run" })).toBe(
      "configured",
    );
  });

  it("returns 'unconfigured' when type is the empty string", () => {
    expect(classifyNodeStatus({ type: "" })).toBe("unconfigured");
  });

  it("passes runStatus through unchanged when present (forward-compat for the future per-node run-state projection)", () => {
    // Today the canvas never passes runStatus; later slices will. This
    // contract guards that classifyNodeStatus stays a pure branch table
    // — it does not invent run state, it relays it.
    expect(
      classifyNodeStatus({ type: "slack.message.channel", runStatus: "running" }),
    ).toBe("running");
    expect(
      classifyNodeStatus({ type: "", runStatus: "failed" }),
    ).toBe("failed");
    expect(
      classifyNodeStatus({ type: "slack.message.channel", runStatus: "passed" }),
    ).toBe("passed");
    expect(
      classifyNodeStatus({ type: "slack.message.channel", runStatus: "listening" }),
    ).toBe("listening");
    expect(
      classifyNodeStatus({ type: "slack.message.channel", runStatus: "paused" }),
    ).toBe("paused");
  });
});
