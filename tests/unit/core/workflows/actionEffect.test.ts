/**
 * @jest-environment node
 */
import {
  actionContributesToRequest,
  analyzeRequestedOutcomes,
  classifyActionEffect,
  isMeaningfulAction,
  parseRequestedOutcomes,
  requestedActionText,
  uncoveredOutcomes,
  type RequestedOutcome,
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

describe("requestedActionText — separates the trigger clause from downstream actions", () => {
  it("strips a leading 'When …,' trigger clause", () => {
    expect(requestedActionText("When Typeform receives a response, create a HubSpot contact")).toBe(
      "create a HubSpot contact",
    );
    expect(requestedActionText("After a file is uploaded, save a copy to Dropbox")).toBe(
      "save a copy to Dropbox",
    );
  });

  it("leaves a request with no leading trigger clause unchanged", () => {
    expect(requestedActionText("create a HubSpot contact and notify Slack")).toBe(
      "create a HubSpot contact and notify Slack",
    );
  });

  it("returns empty for a pure trigger phrase (no downstream action)", () => {
    expect(requestedActionText("When a new Typeform response arrives")).toBe("");
  });
});

describe("parseRequestedOutcomes — multiple downstream outcomes, trigger verbs excluded", () => {
  const concepts = (text: string) => parseRequestedOutcomes(text).map((o) => o.concept);

  it("preserves MULTIPLE outcomes for the same provider", () => {
    expect(concepts("When Typeform receives a response, create a HubSpot contact and update its lifecycle stage")).toEqual(
      ["create", "update"],
    );
    expect(concepts("When a Slack reaction is added, post a message and create a Slack channel")).toEqual([
      "send",
      "create",
    ]);
  });

  it("(#7) trigger verbs (labeled / added / deleted / created / uploaded) do NOT become action requirements", () => {
    expect(concepts("When a contact is labeled, create a task")).toEqual(["create"]); // not 'update'
    expect(concepts("When a row is added, notify Slack")).toEqual(["send"]); // not 'append'
    expect(concepts("When a message is deleted, create a task")).toEqual(["create"]); // not 'delete'
    expect(concepts("When a HubSpot contact is created, add a row to Google Sheets")).toEqual(["append"]); // not 'create'
  });

  it("(#10) maps mechanism / semantic wording to the right concept", () => {
    expect(concepts("log it in Sheets")).toEqual(["append"]);
    expect(concepts("notify Slack")).toEqual(["send"]);
    expect(concepts("update the lifecycle stage")).toEqual(["update"]);
    expect(concepts("format the row")).toEqual(["update"]);
  });

  it("(#12) vague / uncertain wording creates NO required outcome", () => {
    expect(concepts("do the needful")).toEqual([]);
    expect(concepts("When a form is submitted, handle the response somehow")).toEqual([]);
  });
});

describe("uncoveredOutcomes — injective concept coverage (one action can't cover two outcomes)", () => {
  const o = (concept: RequestedOutcome["concept"]): RequestedOutcome => ({ concept, confidence: "high", text: concept });

  it("reports a requested concept with no matching action as uncovered", () => {
    const uncovered = uncoveredOutcomes(
      [o("create"), o("update")],
      [classifyActionEffect("hubspot", "create_contact")],
    );
    expect(uncovered.map((u) => u.concept)).toEqual(["update"]);
  });

  it("full coverage when each outcome has a distinct matching action", () => {
    const uncovered = uncoveredOutcomes(
      [o("create"), o("update")],
      [classifyActionEffect("hubspot", "create_contact"), classifyActionEffect("hubspot", "update_contact")],
    );
    expect(uncovered).toEqual([]);
  });

  it("two same-concept outcomes require TWO distinct actions (one can't satisfy both)", () => {
    const oneAction = uncoveredOutcomes(
      [o("send"), o("send")],
      [classifyActionEffect("slack", "send_channel_message")],
    );
    expect(oneAction).toHaveLength(1);
    const twoActions = uncoveredOutcomes(
      [o("send"), o("send")],
      [classifyActionEffect("slack", "send_channel_message"), classifyActionEffect("slack", "send_direct_message")],
    );
    expect(twoActions).toEqual([]);
  });
});
