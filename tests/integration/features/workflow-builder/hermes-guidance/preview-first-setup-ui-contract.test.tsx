/**
 * REACT-AGENT-PREVIEW-FIRST-SERVER-ENFORCEMENT-1 — the repaired plan reaches REAL setup controls.
 *
 * The route suite proves a clarification-only reply is repaired into `PREVIEW_FIRST_REPAIRED_PLAN`
 * (the shared fixture) and returned as a preview. This suite proves the OTHER half of the contract:
 * that same plan, run through the SAME production transforms —
 *
 *   plan -> planToDraftPreview -> previewDraft.missingInputs
 *   real registry metas -> buildPreviewSetupFields -> setupFieldsByType
 *
 * — reaches working controls: Typeform form and Mailchimp audience as resolver-backed dropdowns,
 * Mailchimp status and HubSpot duplicate handling as their real static enum selects, and Gmail
 * recipient — whose REAL contract type is `string-array`, not text — deferred with a WORKING route
 * into the full chips editor. Nothing is hand-mocked: the fields come from the actual `.meta.ts`
 * contracts, so a contract change breaks this test instead of silently breaking the panel.
 *
 * REACT-AGENT-PREAPPLY-SETUP-UX-1 moved those controls from the PRE-APPLY card into the guided
 * CONFIGURE stage, so this suite now drives `BuilderNodeSetupCard`. The pre-apply half is still
 * covered here too, in its new form: the same real metadata must produce a compact SUMMARY with an
 * immediately-available Apply and no controls at all.
 */
const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
}));

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BuilderNodeSetupCard } from "@/features/workflow-builder/panels/BuilderNodeSetupCard";
import { BuilderPreviewSetupCard } from "@/features/workflow-builder/panels/BuilderPreviewSetupCard";
import type { CheckWorkflowSetupTarget } from "@/core/workflows/checkWorkflowReview";
import { planToDraftPreview } from "@/services/ai-guidance/preview/planToDraftPreview";
import { buildPreviewSetupFields } from "@/core/workflows/previewSetupFields";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";
import { PREVIEW_FIRST_REPAIRED_PLAN } from "../../../../helpers/previewFirstRepairedPlan";

// ── The REAL production transforms over the REAL registry metadata ────────────────────────────────
const maybePreviewDraft = planToDraftPreview(PREVIEW_FIRST_REPAIRED_PLAN);
if (!maybePreviewDraft) throw new Error("fixture plan must convert to a preview");
const previewDraft = maybePreviewDraft;
const setupFieldsByType = buildPreviewSetupFields(
  [
    getActionMeta("mailchimp:add_subscriber")!,
    getActionMeta("hubspot:create_contact")!,
    getActionMeta("gmail:send_email")!,
  ],
  [getTriggerMeta("typeform:new_response_in_form")!],
);

/**
 * The Configure stage's targets, derived from the SAME preview the planner produced: one target per
 * node that still has missing inputs, carrying the node's real provider/type so the card resolves
 * the real registry fields.
 */
const targets: readonly CheckWorkflowSetupTarget[] = previewDraft.nodes
  .filter((n) => (n.missingInputs ?? []).length > 0)
  .map((n) => ({
    nodeId: n.previewId,
    label: `${n.provider}:${n.type}`,
    provider: n.provider,
    type: n.type,
    missingFieldNames: n.missingInputs ?? [],
  }));

const FORM = "node-setup-preview-step-1-formId";
const AUDIENCE = "node-setup-preview-step-2-audience_id";
const STATUS = "node-setup-preview-step-2-status";
const DUPLICATE = "node-setup-preview-step-3-duplicateHandling";

function Host(props: {
  onFieldInteract?: (nodeId: string, fieldName: string, interaction: "focus" | "change") => void;
}) {
  return (
    <BuilderNodeSetupCard
      nodes={targets}
      setupFieldsByType={setupFieldsByType}
      onUpdateStep={() => {}}
      {...(props.onFieldInteract ? { onFieldInteract: props.onFieldInteract } : {})}
    />
  );
}

beforeEach(() => {
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation(async (source: string) => {
    if (source === "typeform:forms") {
      return {
        ok: true as const,
        source,
        items: [{ value: "form_1", label: "Contact form" }],
        hasMore: false,
      };
    }
    if (source === "mailchimp:audiences") {
      return {
        ok: true as const,
        source,
        items: [{ value: "aud_1", label: "Newsletter" }],
        hasMore: false,
      };
    }
    throw new Error(`unexpected source ${source}`);
  });
});

describe("the repaired plan's preview renders real setup controls", () => {
  it("shows the setup section for the nodes that need it (not a chat questionnaire)", () => {
    render(<Host />);
    expect(screen.getByTestId("builder-node-setup-rail")).toBeInTheDocument();
    // Four nodes made it from plan -> preview.
    expect(previewDraft.nodes.map((n) => `${n.provider}:${n.type}`)).toEqual([
      "typeform:new_response_in_form",
      "mailchimp:add_subscriber",
      "hubspot:create_contact",
      "gmail:send_email",
    ]);
  });

  it("Typeform form is a resolver-backed dropdown loaded through typeform:forms", async () => {
    render(<Host />);
    const select = (await screen.findByTestId(FORM)) as HTMLSelectElement;
    await waitFor(() => expect(select.querySelectorAll("option").length).toBe(2));
    expect(select).toHaveTextContent("Contact form");
    expect(mockFetchOptionsSource.mock.calls.some((c) => c[0] === "typeform:forms")).toBe(true);
  });

  it("Mailchimp audience is a resolver-backed dropdown loaded through mailchimp:audiences", async () => {
    render(<Host />);
    const select = (await screen.findByTestId(AUDIENCE)) as HTMLSelectElement;
    await waitFor(() => expect(select.querySelectorAll("option").length).toBe(2));
    expect(select).toHaveTextContent("Newsletter");
  });

  it("Mailchimp status renders the REAL consent enum from the action contract", async () => {
    render(<Host />);
    const select = (await screen.findByTestId(STATUS)) as HTMLSelectElement;
    const values = [...select.querySelectorAll("option")].map((o) => o.getAttribute("value"));
    // The registered contract's own options — never invented, never silently defaulted.
    expect(values).toEqual(expect.arrayContaining(["subscribed", "pending", "unsubscribed", "cleaned", "transactional"]));
  });

  it("HubSpot duplicate handling renders the REAL enum from the action contract", async () => {
    render(<Host />);
    const select = (await screen.findByTestId(DUPLICATE)) as HTMLSelectElement;
    const values = [...select.querySelectorAll("option")].map((o) => o.getAttribute("value"));
    expect(values).toEqual(expect.arrayContaining(["fail"]));
    expect(values.length).toBeGreaterThan(2); // placeholder + the contract's choices
  });

  it("Gmail recipient (a string-array contract field) is deferred WITH a working step-editor route", async () => {
    // REAL contract: gmail:send_email.to is `string-array` (multiple recipients, chips editor) — a
    // control the compact rail card intentionally does not fake as plain text. The card defers it
    // to the full step editor, and that deferral is a WORKING action, not dead copy. The field
    // stays required, so readiness still blocks until the user sets it in the editor.
    const onFieldInteract = jest.fn();
    render(<Host onFieldInteract={onFieldInteract} />);
    const deferred = screen.getByTestId("node-setup-preview-step-4-unsupported");
    expect(deferred.textContent ?? "").toContain("to");
    fireEvent.click(await screen.findByTestId("node-setup-preview-step-4-unsupported-open"));
    expect(onFieldInteract).toHaveBeenCalledWith("preview-step-4", "to", "focus");
  });

  it("selections persist locally and other values survive each other", async () => {
    render(<Host />);
    const status = (await screen.findByTestId(STATUS)) as HTMLSelectElement;
    fireEvent.change(status, { target: { value: "subscribed" } });
    const audience = (await screen.findByTestId(AUDIENCE)) as HTMLSelectElement;
    await waitFor(() => expect(audience.querySelectorAll("option").length).toBe(2));
    fireEvent.change(audience, { target: { value: "aud_1" } });
    // Every earlier value survives the later ones.
    expect((screen.getByTestId(STATUS) as HTMLSelectElement).value).toBe("subscribed");
    expect((screen.getByTestId(AUDIENCE) as HTMLSelectElement).value).toBe("aud_1");
  });

  it("each node commits to the CURRENT draft through its own explicit Update step", () => {
    render(<Host />);
    // The apply pipeline itself (current-workflow additive apply, no new workflow, checkpoint) is
    // pinned by builder-apply-preview.test.tsx.
    expect(screen.getByTestId("node-setup-preview-step-2-update")).toBeInTheDocument();
  });
});

/**
 * REACT-AGENT-PREAPPLY-SETUP-UX-1 — the same real registry metadata, at the PREVIEW stage.
 *
 * Everything the Configure stage renders as a control must appear here as a NAME only. This is the
 * regression guard for the reported bug: real metadata must not be able to reintroduce pickers,
 * resolvers or recovery UI before the workflow exists.
 */
describe("the same repaired plan renders a compact pre-apply summary", () => {
  it("names every step and lists outstanding setup without rendering a single control", () => {
    render(
      <BuilderPreviewSetupCard
        preview={previewDraft}
        setupFieldsByType={setupFieldsByType}
        onApply={() => {}}
      />,
    );
    const steps = screen.getByTestId("preview-summary-steps");
    expect(steps.querySelectorAll("li")).toHaveLength(previewDraft.nodes.length);
    expect(screen.getByTestId("preview-setup-required")).toBeInTheDocument();

    // No controls of any kind, and no resolver was consulted.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(mockFetchOptionsSource).not.toHaveBeenCalled();

    // Exactly one action, and it is Apply.
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute("data-testid", "builder-preview-setup-apply");
  });
});
