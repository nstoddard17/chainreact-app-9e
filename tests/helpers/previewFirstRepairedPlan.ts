import type { WorkflowPlan } from "@/contracts/guidanceSession";

/**
 * REACT-AGENT-PREVIEW-FIRST-SERVER-ENFORCEMENT-1 — the ONE repaired-plan fixture shared by the
 * route test and the UI-contract test.
 *
 * The route suite proves the server turns a clarification-only reply into THIS plan's preview; the
 * UI suite runs the SAME plan through the SAME transforms production uses (`planToDraftPreview` +
 * `buildPreviewSetupFields` over the real registry metas) and proves the setup card renders real
 * controls for it. Sharing the fixture is what makes the two suites one contract instead of two
 * unrelated units — a drift in either half breaks a test.
 *
 * The `requiredInputs` are the REAL contract-required fields of the four registered capabilities
 * (pinned by tests/unit/services/ai-guidance/previewFirstGenuineDecisions.test.ts).
 */
export const PREVIEW_FIRST_PRODUCTION_PROMPT =
  "When someone submits our Typeform contact form, add them to Mailchimp, create a HubSpot " +
  "contact, and send me a Gmail message summarizing their answers. Use the submitted email, " +
  "first name, last name, company, and message wherever appropriate.";

export const PREVIEW_FIRST_REPAIRED_PLAN: WorkflowPlan = {
  schemaVersion: 1,
  title: "Typeform contact form intake",
  summary: "New Typeform response adds a subscriber, creates a contact, and emails a summary.",
  notApplied: true,
  steps: [
    {
      ref: "s0",
      role: "trigger",
      provider: "typeform",
      type: "new_response_in_form",
      purpose: "watch the form",
      requiredInputs: ["formId"],
    },
    {
      ref: "s1",
      role: "action",
      provider: "mailchimp",
      type: "add_subscriber",
      purpose: "add the subscriber",
      requiredInputs: ["audience_id", "status"],
    },
    {
      ref: "s2",
      role: "action",
      provider: "hubspot",
      type: "create_contact",
      purpose: "create the contact",
      requiredInputs: ["duplicateHandling"],
    },
    {
      ref: "s3",
      role: "action",
      provider: "gmail",
      type: "send_email",
      purpose: "email the summary",
      requiredInputs: ["to"],
    },
  ],
};
