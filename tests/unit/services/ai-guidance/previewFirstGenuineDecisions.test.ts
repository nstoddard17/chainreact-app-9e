/**
 * @jest-environment node
 *
 * REACT-AGENT-PREVIEW-FIRST-CLARIFICATION-FIX-1 — which decisions are GENUINE, read from the real
 * registry rather than asserted from a spec.
 *
 * The production prompt
 *   "When someone submits our Typeform contact form, add them to Mailchimp, create a HubSpot
 *    contact, and send me a Gmail message summarizing their answers. Use the submitted email,
 *    first name, last name, company, and message wherever appropriate."
 * has exactly one supported four-node shape. This suite pins WHICH fields of that shape genuinely
 * have to be decided by the user (they become preview setup fields) and — just as important — which
 * decisions must NOT be invented, because no registered action declares them.
 *
 * Everything here reads `getActionMeta` / `getTriggerMeta`, so if a provider contract changes the
 * test fails instead of quietly letting the agent ask for a field that no longer exists.
 */
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";

const TYPEFORM_TRIGGER = "typeform:new_response_in_form";
const MAILCHIMP_ADD = "mailchimp:add_subscriber";
const HUBSPOT_CREATE = "hubspot:create_contact";
const GMAIL_SEND = "gmail:send_email";

function requiredActionFields(key: string): string[] {
  const meta = getActionMeta(key);
  expect(meta).toBeTruthy();
  return meta!.fields.filter((f) => f.required).map((f) => f.name).sort();
}
function actionFieldNames(key: string): string[] {
  return (getActionMeta(key)?.fields ?? []).map((f) => f.name);
}

describe("the four-node shape is fully supported by the catalog", () => {
  it("every node of the proposed topology is a REAL registered capability", () => {
    expect(getTriggerMeta(TYPEFORM_TRIGGER)).toBeTruthy();
    expect(getActionMeta(MAILCHIMP_ADD)).toBeTruthy();
    expect(getActionMeta(HUBSPOT_CREATE)).toBeTruthy();
    expect(getActionMeta(GMAIL_SEND)).toBeTruthy();
  });

  it("Mailchimp has NO subscriber-upsert action — the plan must use add_subscriber, not an invented one", () => {
    // The remediation spec described "Add or Update Subscriber". No such registered action exists;
    // add_subscriber and update_subscriber are separate. The agent must not invent an upsert.
    expect(getActionMeta("mailchimp:add_or_update_subscriber")).toBeFalsy();
    expect(getActionMeta("mailchimp:upsert_subscriber")).toBeFalsy();
    expect(getActionMeta("mailchimp:add_subscriber")).toBeTruthy();
    expect(getActionMeta("mailchimp:update_subscriber")).toBeTruthy();
  });

  it("HubSpot has NO contact-upsert action either — create_contact carries the duplicate rule", () => {
    expect(getActionMeta("hubspot:create_or_update_contact")).toBeFalsy();
    expect(getActionMeta("hubspot:upsert_contact")).toBeFalsy();
    expect(getActionMeta(HUBSPOT_CREATE)).toBeTruthy();
  });
});

describe("genuine decisions — required by a real action contract", () => {
  it("Typeform: the form is required (the trigger and its dynamic outputs depend on it)", () => {
    const meta = getTriggerMeta(TYPEFORM_TRIGGER)!;
    const required = meta.fields.filter((f) => f.required).map((f) => f.name);
    expect(required).toContain("formId");
  });

  it("Mailchimp: audience AND consent status are required — both are real user decisions", () => {
    const required = requiredActionFields(MAILCHIMP_ADD);
    expect(required).toContain("audience_id");
    expect(required).toContain("status"); // legal/consent decision — never silently chosen
    expect(required).toContain("email"); // satisfied by mapping from the trigger, not by asking
  });

  it("HubSpot: duplicate handling IS a required contract field, so it stays a setup decision", () => {
    const required = requiredActionFields(HUBSPOT_CREATE);
    expect(required).toContain("duplicateHandling");
    expect(required).toContain("email");
  });

  it("Gmail: the recipient is the only genuine setup decision — subject is required-by-key with a safe default, and the body is optional, so the agent can write both", () => {
    const meta = getActionMeta(GMAIL_SEND)!;
    const required = requiredActionFields(GMAIL_SEND);
    expect(required).toContain("to");
    // WORKFLOW-TEST-RUNTIME-1 — `subject` is now declared required because the runtime
    // schema requires the KEY to be present (it may be an empty string). Its
    // defaultValue "" means readiness never surfaces it as a setup gap, so it is
    // still NOT a genuine user decision — the agent writes it, it never asks for it.
    expect(required).toContain("subject");
    const subject = meta.fields.find((f) => f.name === "subject")!;
    expect(subject.defaultValue).toBe("");
    // Bodies stay per-field optional; the "at least one body" rule is the CROSS-FIELD
    // requiredAnyOf (WORKFLOW-LIVE-TEST-2) — again content the agent can write itself.
    expect(required).not.toContain("textBody");
    expect(required).not.toContain("htmlBody");
    expect(meta.requiredAnyOf).toEqual([
      expect.objectContaining({ fields: ["textBody", "htmlBody"] }),
    ]);
  });
});

describe("decisions that must NOT be invented", () => {
  it("Mailchimp add_subscriber declares NO duplicate-handling field — asking for one is fabrication", () => {
    const names = actionFieldNames(MAILCHIMP_ADD).map((n) => n.toLowerCase());
    expect(names).not.toContain("duplicatehandling");
    expect(names.some((n) => n.includes("duplicate"))).toBe(false);
  });

  it("HubSpot create_contact HAS a company field — so no separate company step is ever needed", () => {
    // This is the exact condition the spec names: only discuss creating a company RECORD when the
    // chosen action cannot store company information on the contact. It can.
    expect(actionFieldNames(HUBSPOT_CREATE)).toContain("company");
  });

  it("HubSpot create_contact accepts the submitted name fields directly", () => {
    const names = actionFieldNames(HUBSPOT_CREATE);
    expect(names).toContain("firstname");
    expect(names).toContain("lastname");
    expect(names).toContain("email");
  });

  it("Mailchimp add_subscriber accepts the submitted name fields directly", () => {
    const names = actionFieldNames(MAILCHIMP_ADD);
    expect(names).toContain("first_name");
    expect(names).toContain("last_name");
  });
});
