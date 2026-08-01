/**
 * @jest-environment node
 *
 * WORKFLOW-LIVE-TEST-2 §2 — the shared pre-flight both testing modes run FIRST.
 *
 * The contract: when a workflow is incomplete, testing makes no external call, creates no run and
 * starts no trigger polling — it produces an actionable summary the user can act on. These tests
 * pin the pure decision. The wiring (button click → open the issues rail, never dispatch) is
 * covered in HeaderRunControls.test.tsx.
 */
import {
  evaluateTestPreflight,
  testPreflightSummary,
} from "@/features/workflow-builder/validation/testPreflight";
import {
  buildRequiredFieldsByType,
  type RequiredFieldsByType,
} from "@/core/workflows/requiredFields";
import { collectBuilderValidationIssues } from "@/features/workflow-builder/validation/collectBuilderValidationIssues";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";
import type { WorkflowNode, WorkflowEdge } from "@/contracts/workflow";

describe("testPreflightSummary — copy", () => {
  it("reads naturally for one item and for many", () => {
    expect(testPreflightSummary(1)).toBe("Finish 1 setup item before testing this workflow.");
    expect(testPreflightSummary(4)).toBe("Finish 4 setup items before testing this workflow.");
  });
});

describe("evaluateTestPreflight — decision", () => {
  it("passes when there are no issues at all", () => {
    expect(evaluateTestPreflight([])).toEqual({ ok: true });
  });

  it("passes when only WARNINGS are present (a soft signal must not block testing)", () => {
    const result = evaluateTestPreflight([
      {
        id: "broken_variable_reference:a1:body",
        code: "broken_variable_reference",
        severity: "warning",
        message: "A step uses data from a step that no longer exists.",
        nodeId: "a1",
      },
    ]);
    expect(result).toEqual({ ok: true });
  });

  it("blocks on errors, counts them, and carries each item's step + field to focus", () => {
    const result = evaluateTestPreflight([
      {
        id: "missing_required_field:a2:spreadsheetId",
        code: "missing_required_field",
        severity: "error",
        message: "Append Row needs a Spreadsheet.",
        nodeId: "a2",
        fieldName: "spreadsheetId",
        fieldLabel: "Spreadsheet",
      },
      {
        id: "missing_required_group:a6:textBody+htmlBody",
        code: "missing_required_group",
        severity: "error",
        message: "Send Email: Add a text body or HTML body.",
        nodeId: "a6",
        fieldName: "textBody",
        fieldLabel: "Text body",
      },
      {
        id: "broken_variable_reference:a1:body",
        code: "broken_variable_reference",
        severity: "warning",
        message: "soft",
        nodeId: "a1",
      },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.issueCount).toBe(2); // the warning is excluded
    expect(result.summary).toBe("Finish 2 setup items before testing this workflow.");
    expect(result.items.map((i) => [i.nodeId, i.fieldName, i.fieldLabel])).toEqual([
      ["a2", "spreadsheetId", "Spreadsheet"],
      ["a6", "textBody", "Text body"],
    ]);
  });

  it("keeps graph-level issues (no node to open) in the list without inventing a target", () => {
    const result = evaluateTestPreflight([
      { id: "no_trigger", code: "no_trigger", severity: "error", message: "Add a trigger." },
    ]);
    if (result.ok) throw new Error("unreachable");
    expect(result.items[0]!.nodeId).toBeUndefined();
    expect(result.items[0]!.fieldName).toBeUndefined();
  });
});

describe("evaluateTestPreflight — against a REAL incomplete Google Review Test graph", () => {
  const reqs: RequiredFieldsByType = buildRequiredFieldsByType(
    [
      getActionMeta("google-drive:upload_file")!,
      getActionMeta("google-sheets:append_row")!,
      getActionMeta("google-calendar:create_event")!,
      getActionMeta("gmail:add_label")!,
      getActionMeta("gmail:create_draft_reply")!,
      getActionMeta("gmail:send_email")!,
    ],
    [getTriggerMeta("gmail:new_email")!],
  );

  const nodes: WorkflowNode[] = [
    { id: "trigger", kind: "trigger", provider: "gmail", type: "new_email", position: { x: 0, y: 0 }, config: { subject: "ChainReact Google Review", subjectExactMatch: false } },
    { id: "a1", kind: "action", provider: "google-drive", type: "upload_file", position: { x: 0, y: 1 }, config: { filename: "f.txt", mimeType: "text/plain", content: "c" } },
    { id: "a2", kind: "action", provider: "google-sheets", type: "append_row", position: { x: 0, y: 2 }, config: { values: ["a"] } },
    { id: "a3", kind: "action", provider: "google-calendar", type: "create_event", position: { x: 0, y: 3 }, config: { summary: "s" } },
    { id: "a4", kind: "action", provider: "gmail", type: "add_label", position: { x: 0, y: 4 }, config: { messageId: "{{trigger.id}}" } },
    { id: "a5", kind: "action", provider: "gmail", type: "create_draft_reply", position: { x: 0, y: 5 }, config: { originalMessageId: "{{trigger.id}}", textBody: "b" } },
    { id: "a6", kind: "action", provider: "gmail", type: "send_email", position: { x: 0, y: 6 }, config: { subject: "s", textBody: "b" } },
  ] as WorkflowNode[];
  const edges: WorkflowEdge[] = [
    { id: "e1", from: "trigger", to: "a1" },
    { id: "e2", from: "a1", to: "a2" },
    { id: "e3", from: "a2", to: "a3" },
    { id: "e4", from: "a3", to: "a4" },
    { id: "e5", from: "a4", to: "a5" },
    { id: "e6", from: "a5", to: "a6" },
  ];

  const preflightFor = (ns: WorkflowNode[]) =>
    evaluateTestPreflight(
      collectBuilderValidationIssues({
        pendingNodes: ns,
        pendingEdges: edges,
        requiredFieldsByType: reqs,
      }),
    );

  it("blocks the reviewer's freshly-copied workflow and names every step that needs setup", () => {
    const result = preflightFor(nodes);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    // Sheets (file, tab, range, value-input — SHEETS-GUIDED-CONFIG-1 added the
    // builder-required Tab picker; the advanced `range` stays runtime-required),
    // Calendar (start, end, 3 guest choices), Gmail label (the label),
    // Gmail send (the recipient).
    expect(result.issueCount).toBe(11);
    expect(result.summary).toBe("Finish 11 setup items before testing this workflow.");
    expect(new Set(result.items.map((i) => i.nodeId))).toEqual(new Set(["a2", "a3", "a4", "a6"]));
    // Every blocking item points at a step the user can open.
    expect(result.items.every((i) => i.nodeId !== undefined)).toBe(true);
  });

  it("passes once every reviewer-selected value is filled in", () => {
    const complete = nodes.map((n) => {
      // sheetName: the guided-Sheets arc (SHEETS-GUIDED-CONFIG-1) made the Tab
      // a builder-required selection on append_row, so a complete config now
      // carries it alongside the derived range.
      if (n.id === "a2") return { ...n, config: { ...n.config, spreadsheetId: "s", sheetName: "Sheet1", range: "Sheet1!A:Z", valueInputOption: "USER_ENTERED" } };
      if (n.id === "a3") return { ...n, config: { ...n.config, startDateTime: "2026-08-01T10:00:00Z", endDateTime: "2026-08-01T10:30:00Z", sendNotifications: "none", guestsCanInviteOthers: false, guestsCanSeeOtherGuests: false } };
      if (n.id === "a4") return { ...n, config: { ...n.config, labelIds: ["Label_1"] } };
      if (n.id === "a6") return { ...n, config: { ...n.config, to: ["someone"] } };
      return n;
    }) as WorkflowNode[];
    expect(preflightFor(complete)).toEqual({ ok: true });
  });

  it("catches the cross-field body gap that used to read as Ready", () => {
    const noBody = nodes.map((n) =>
      n.id === "a6" ? ({ ...n, config: { subject: "s", to: ["someone"] } } as WorkflowNode) : n,
    );
    const result = preflightFor(noBody);
    if (result.ok) throw new Error("unreachable");
    expect(result.items.some((i) => i.message.includes("Add a text body or HTML body."))).toBe(true);
  });
});
