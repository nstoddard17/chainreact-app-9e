/**
 * @jest-environment node
 */
import {
  actionContributesToRequest,
  analyzeRequestedOutcomes,
  classifyActionEffect,
  isMeaningfulAction,
} from "@/core/workflows/actionEffect";

describe("classifyActionEffect — normalized effect from action type + optional ActionMeta facts", () => {
  it("maps verbs to effect concepts (append/send/create/upload/delete)", () => {
    expect(classifyActionEffect("google-sheets", "append_row").effectCategory).toBe("append");
    expect(classifyActionEffect("slack", "send_channel_message").effectCategory).toBe("send");
    expect(classifyActionEffect("hubspot", "create_contact").effectCategory).toBe("create");
    expect(classifyActionEffect("google-drive", "upload_file").effectCategory).toBe("upload");
    expect(classifyActionEffect("google-sheets", "delete_row").effectCategory).toBe("delete");
  });

  it("flags recipient-visible sends and destructive deletes", () => {
    expect(classifyActionEffect("slack", "send_channel_message").recipientVisible).toBe(true);
    expect(classifyActionEffect("hubspot", "send_email").recipientVisible).toBe(true);
    expect(classifyActionEffect("google-sheets", "delete_row").destructive).toBe(true);
    expect(classifyActionEffect("google-sheets", "append_row").destructive).toBe(false);
  });

  it("treats injected ActionMeta facts as AUTHORITATIVE (destructive / recipient-visible)", () => {
    // A neutrally-named action the verb heuristic can't classify — facts decide.
    const neutral = classifyActionEffect("stripe", "refund_charge", { isDestructive: true, riskLevel: "high" });
    expect(neutral.destructive).toBe(true);
    expect(neutral.effectCategory).toBe("delete");
    const email = classifyActionEffect("hubspot", "log_activity", { category: "email" });
    expect(email.recipientVisible).toBe(true);
    expect(email.effectCategory).toBe("send");
  });

  it("extracts distinctive business-object nouns, ignoring structural containers", () => {
    expect(classifyActionEffect("hubspot", "create_task").objectTokens).toEqual(["task"]);
    expect(classifyActionEffect("hubspot", "create_contact").objectTokens).toEqual(["contact"]);
    // structural nouns (row / message / channel / file) are not distinctive → empty
    expect(classifyActionEffect("google-sheets", "append_row").objectTokens).toEqual([]);
    expect(classifyActionEffect("slack", "send_channel_message").objectTokens).toEqual([]);
  });

  it("pure reads and native steps are not meaningful (need no justification)", () => {
    expect(isMeaningfulAction(classifyActionEffect("gmail", "get_message"))).toBe(false);
    expect(isMeaningfulAction(classifyActionEffect("native", "filter"))).toBe(false);
    expect(isMeaningfulAction(classifyActionEffect("slack", "send_channel_message"))).toBe(true);
  });
});

describe("analyzeRequestedOutcomes — natural-language → effect concepts (mechanism-tolerant)", () => {
  it("maps mechanism wording to the same concept as the action ('log' → append, 'notify' → send)", () => {
    const a = analyzeRequestedOutcomes("log it in Google Sheets");
    expect(a.concepts.has("append")).toBe(true);
    const b = analyzeRequestedOutcomes("notify the team in Slack");
    expect(b.concepts.has("send")).toBe(true);
    const c = analyzeRequestedOutcomes("save the file to Google Drive");
    expect(c.concepts.has("upload")).toBe(true);
    const d = analyzeRequestedOutcomes("email the customer");
    expect(d.concepts.has("send")).toBe(true);
  });
});

describe("actionContributesToRequest — conservative outcome matching", () => {
  const req = analyzeRequestedOutcomes("When a Typeform response is submitted, add a row to Google Sheets.");

  it("a semantically-equivalent action contributes ('add a row' → append_row)", () => {
    expect(actionContributesToRequest(classifyActionEffect("google-sheets", "append_row"), req)).toBe(true);
  });

  it("an unrequested destructive action does NOT contribute (delete_row)", () => {
    expect(actionContributesToRequest(classifyActionEffect("google-sheets", "delete_row"), req)).toBe(false);
  });

  it("an unrequested recipient-visible send does NOT contribute (send_email)", () => {
    expect(actionContributesToRequest(classifyActionEffect("hubspot", "send_email"), req)).toBe(false);
  });

  it("an unknown/uncertain action purpose does NOT contribute (conservative)", () => {
    expect(actionContributesToRequest(classifyActionEffect("google-sheets", "frobnicate_data"), req)).toBe(false);
  });

  it("a distinctive business object must be named ('create a HubSpot contact')", () => {
    const contactReq = analyzeRequestedOutcomes("create a HubSpot contact");
    expect(actionContributesToRequest(classifyActionEffect("hubspot", "create_contact"), contactReq)).toBe(true);
    // create_task shares the 'create' concept but the object 'task' was never named → no contribution.
    expect(actionContributesToRequest(classifyActionEffect("hubspot", "create_task"), contactReq)).toBe(false);
  });
});
