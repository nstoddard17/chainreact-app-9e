import { canExplainDiagnosis } from "@/features/workflow-builder/ai/canExplainDiagnosis";
import type { AgentWorkflowDiagnosis } from "@/lib/api/ai";

/**
 * Slice 4.AI-DIAG-2c — gate for the paid "Explain with AI" affordance. Show only
 * when access is OK AND the diagnosis isn't fully clean/ready (issues, warnings,
 * or actionable next steps to explain).
 */

function dx(over: Partial<AgentWorkflowDiagnosis>): AgentWorkflowDiagnosis {
  return { workflowId: "wf-1", access: "OK", ...over };
}

describe("canExplainDiagnosis", () => {
  it("HIDES on a clean/ready diagnosis (ready, no findings, no next steps)", () => {
    expect(
      canExplainDiagnosis(
        dx({ overallReady: true, findings: [], nextSteps: [] }),
      ),
    ).toBe(false);
  });

  it("HIDES on a ready diagnosis whose fields are simply omitted", () => {
    expect(canExplainDiagnosis(dx({ overallReady: true }))).toBe(false);
  });

  it("HIDES on a ready diagnosis with a SUCCEEDED latest run (nothing to explain)", () => {
    expect(
      canExplainDiagnosis(
        dx({
          overallReady: true,
          findings: [],
          nextSteps: [],
          latestRun: {
            runId: "r1",
            status: "succeeded",
            visibility: "SUCCEEDED_VISIBLE",
            classificationAvailable: false,
          },
        }),
      ),
    ).toBe(false);
  });

  it("SHOWS when not overall-ready (blocking issue)", () => {
    expect(
      canExplainDiagnosis(
        dx({
          overallReady: false,
          findings: [
            { source: "connection", code: "DISCONNECTED", severity: "error", title: "x" },
          ],
          nextSteps: ["Reconnect Slack."],
        }),
      ),
    ).toBe(true);
  });

  it("SHOWS when ready but a WARNING finding exists (e.g. token may refresh)", () => {
    expect(
      canExplainDiagnosis(
        dx({
          overallReady: true,
          findings: [
            { source: "connection", code: "TOKEN_EXPIRED", severity: "warning", title: "x" },
          ],
          nextSteps: [],
        }),
      ),
    ).toBe(true);
  });

  it("SHOWS when ready but a recent run FAILED (finding present)", () => {
    expect(
      canExplainDiagnosis(
        dx({
          overallReady: true,
          findings: [
            { source: "run", code: "RECENT_RUN_FAILED", severity: "warning", title: "x" },
          ],
          nextSteps: ["Reconnect Gmail in Integrations."],
        }),
      ),
    ).toBe(true);
  });

  it("SHOWS when actionable next steps exist even if findings array is empty", () => {
    expect(
      canExplainDiagnosis(dx({ overallReady: true, findings: [], nextSteps: ["Do a thing."] })),
    ).toBe(true);
  });

  it.each(["NOT_FOUND", "NO_ACCESS"] as const)(
    "HIDES on access wall %s regardless of any other field",
    (access) => {
      expect(
        canExplainDiagnosis({
          workflowId: "wf-1",
          access,
          // even if (impossibly) populated, an access wall never offers Explain
          overallReady: false,
          findings: [
            { source: "graph", code: "no_trigger", severity: "error", title: "x" },
          ],
          nextSteps: ["x"],
        }),
      ).toBe(false);
    },
  );
});
