/**
 * Integration-style coverage for the template-created setup UX
 * (Slice 4.TEMPLATE-SETUP-UX-1).
 *
 * Renders the real field renderers against config values taken from the prewired
 * complex official templates ("Support escalation from email" + "New team member
 * onboarding") and asserts the builder explains each field in plain English:
 *   - variable-only prefilled fields render "Pre-filled from earlier step" + a
 *     friendly source label, and NEVER a raw {{...}} in the hint;
 *   - mixed variable text is recognized as pre-filled (not unresolved);
 *   - blank required account-resource fields show a "Choose your <field>" prompt;
 *   - an unresolved reference is NOT painted as pre-filled / complete;
 *   - normal literal fields render with no setup hint at all;
 *   - the marketplace card meta for a prewired definition exposes no {{...}}.
 *
 * The upstream-variable hook is mocked so the references resolve deterministically
 * (in the real builder the same sources come from the loaded provider metadata).
 */
import { render, screen } from "@testing-library/react";
import type { VariableSource } from "@/features/workflow-builder/hooks/useUpstreamVariables";

// Sources mirroring the prewired "Support escalation from email" upstream outputs:
// the Gmail trigger (subject/from/id) + a HubSpot create-contact-style action (email).
const SOURCES: VariableSource[] = [
  {
    sourceId: "trigger",
    displayName: "New labeled email",
    kind: "trigger",
    provider: "gmail",
    outputs: [
      { name: "subject", type: "string" },
      { name: "from", type: "string" },
      { name: "id", type: "string" },
    ],
  },
  {
    sourceId: "a1",
    displayName: "Create Contact",
    kind: "action",
    provider: "hubspot",
    outputs: [{ name: "email", type: "string" }],
  },
];

jest.mock(
  "@/features/workflow-builder/hooks/useActiveNodeUpstreamVariables",
  () => ({
    useActiveNodeUpstreamVariables: () => ({
      sources: SOURCES,
      loading: false,
      latestValuesBySource: {},
    }),
  }),
);

// Imported AFTER the mock is registered.
import { TextField } from "@/features/workflow-builder/config-modal/fields/TextField";
import { TextareaField } from "@/features/workflow-builder/config-modal/fields/TextareaField";
import { SelectField } from "@/features/workflow-builder/config-modal/fields/SelectField";
import { deriveTemplateCardMeta } from "@/core/workflows/templateCardMeta";
import type { TemplateDefinition } from "@/contracts/workflowTemplate";
import type { FieldMeta } from "@/contracts/actionMeta";

function field(overrides: Partial<FieldMeta>): FieldMeta {
  return { name: "f", label: "Field", type: "text", required: false, ...overrides } as FieldMeta;
}

describe("template setup UX — variable-only prefilled fields", () => {
  it("renders 'Pre-filled from earlier step' + friendly source label for a whole-value trigger ref", () => {
    render(
      <TextField
        field={field({ name: "subject", label: "Subject", required: true })}
        value="{{trigger.subject}}"
        onChange={jest.fn()}
      />,
    );
    const hint = screen.getByTestId("field-prefill-hint");
    expect(hint).toHaveTextContent("Pre-filled from earlier step");
    expect(hint).toHaveTextContent("Subject from the trigger");
    expect(hint.textContent ?? "").not.toContain("{{");
    // No "needs setup" prompt for a field that is already wired.
    expect(screen.queryByTestId("field-setup-required")).not.toBeInTheDocument();
  });

  it("labels an action-output reference with the upstream step name", () => {
    render(
      <TextField
        field={field({ name: "email", label: "Email", required: true })}
        value="{{a1.email}}"
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByTestId("field-prefill-source")).toHaveTextContent(
      "Email from the Create Contact step",
    );
  });

  it("recognizes mixed variable text as pre-filled (not unresolved), with no raw braces in the hint", () => {
    render(
      <TextareaField
        field={field({ name: "text", label: "Message", type: "textarea", required: true })}
        value="New support request: {{trigger.subject}} (from {{trigger.from}})"
        onChange={jest.fn()}
      />,
    );
    const hint = screen.getByTestId("field-prefill-hint");
    expect(hint).toHaveTextContent("Pre-filled from earlier step");
    // Mixed string -> no single precise source label.
    expect(screen.queryByTestId("field-prefill-source")).not.toBeInTheDocument();
    expect(hint.textContent ?? "").not.toContain("{{");
  });
});

describe("template setup UX — blank required account-resource fields", () => {
  it("shows a 'Choose your <field>' prompt, not a failure message", () => {
    render(
      <SelectField
        field={field({
          name: "channel",
          label: "Channel",
          type: "select",
          required: true,
          options: [
            { value: "c1", label: "#general" },
            { value: "c2", label: "#alerts" },
          ],
        })}
        value=""
        onChange={jest.fn()}
      />,
    );
    const prompt = screen.getByTestId("field-setup-required");
    expect(prompt).toHaveTextContent("Choose your channel to finish setting up this step.");
    expect(prompt.textContent ?? "").not.toMatch(/fail|error|could not/i);
    expect(screen.queryByTestId("field-prefill-hint")).not.toBeInTheDocument();
  });
});

describe("template setup UX — unresolved references are not 'complete'", () => {
  it("does NOT render the pre-filled badge for a reference to an unknown step", () => {
    render(
      <TextField
        field={field({ name: "text", label: "Message", required: true })}
        value="{{ghost.value}}"
        onChange={jest.fn()}
      />,
    );
    // No "pre-filled / complete" affordance...
    expect(screen.queryByTestId("field-prefill-hint")).not.toBeInTheDocument();
    // ...and the existing inline reference warning still surfaces it.
    expect(screen.getByTestId("field-text-warnings")).toBeInTheDocument();
  });
});

describe("template setup UX — normal literal fields are unchanged", () => {
  it("renders no setup hint for a plain static value", () => {
    render(
      <TextField
        field={field({ name: "title", label: "Title", required: true })}
        value="Weekly report"
        onChange={jest.fn()}
      />,
    );
    expect(screen.queryByTestId("field-prefill-hint")).not.toBeInTheDocument();
    expect(screen.queryByTestId("field-setup-required")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Weekly report");
  });
});

describe("template setup UX — marketplace card hides raw expressions", () => {
  it("deriveTemplateCardMeta exposes no {{...}} for a prewired definition", () => {
    const def: TemplateDefinition = {
      nodes: [
        { id: "trigger", kind: "trigger", provider: "gmail", type: "new_labeled_email", position: { x: 400, y: 100 }, config: {} },
        { id: "a1", kind: "action", provider: "hubspot", type: "create_ticket", position: { x: 400, y: 260 }, config: { subject: "{{trigger.subject}}" } },
        { id: "a2", kind: "action", provider: "slack", type: "send_channel_message", position: { x: 400, y: 420 }, config: { text: "New support request: {{trigger.subject}} (from {{trigger.from}})" } },
      ],
      edges: [
        { id: "e1", from: "trigger", to: "a1" },
        { id: "e2", from: "a1", to: "a2" },
      ],
    } as unknown as TemplateDefinition;
    const card = deriveTemplateCardMeta(def);
    expect(JSON.stringify(card)).not.toContain("{{");
  });
});
