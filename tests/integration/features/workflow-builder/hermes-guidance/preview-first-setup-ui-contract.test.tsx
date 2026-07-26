/**
 * REACT-AGENT-PREVIEW-FIRST-SERVER-ENFORCEMENT-1 — the repaired plan reaches REAL setup controls.
 *
 * The route suite proves a clarification-only reply is repaired into `PREVIEW_FIRST_REPAIRED_PLAN`
 * (the shared fixture) and returned as a preview. This suite proves the OTHER half of the contract:
 * that same plan, run through the SAME production transforms —
 *
 *   plan → planToDraftPreview → previewDraft.missingInputs
 *   real registry metas → buildPreviewSetupFields → setupFieldsByType
 *
 * — renders a working `BuilderPreviewSetupCard`: Typeform form and Mailchimp audience as
 * resolver-backed dropdowns, Mailchimp status and HubSpot duplicate handling as their real static
 * enum selects, and Gmail recipient — whose REAL contract type is `string-array`, not text — as a
 * deferred item with a WORKING "Add to draft & open step" route into the full chips editor. Nothing
 * is hand-mocked into the card: the fields come from the actual `.meta.ts` contracts, so a contract
 * change breaks this test instead of silently breaking the panel.
 *
 * Regression pins carried here (spec §7): values entered stay in ephemeral previewConfig (apply is
 * the only path into the draft — covered by builder-apply-preview.test.tsx), and the card offers
 * apply on the CURRENT workflow (no second workflow — same suite).
 */
const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
}));

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { BuilderPreviewSetupCard } from "@/features/workflow-builder/panels/BuilderPreviewSetupCard";
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

const FORM = "preview-setup-preview-step-1-formId";
const AUDIENCE = "preview-setup-preview-step-2-audience_id";
const STATUS = "preview-setup-preview-step-2-status";
const DUPLICATE = "preview-setup-preview-step-3-duplicateHandling";

function HostWithOpen(props: { onOpenStepEditor: (previewId: string, fieldName: string) => void }) {
  const [previewConfig, setPreviewConfig] = useState<Record<string, Record<string, unknown>>>({});
  return (
    <BuilderPreviewSetupCard
      preview={previewDraft}
      setupFieldsByType={setupFieldsByType}
      previewConfig={previewConfig}
      providerLabels={{ typeform: "Typeform", mailchimp: "Mailchimp", hubspot: "HubSpot", gmail: "Gmail" }}
      onPreviewConfigChange={(previewId, fieldName, value) =>
        setPreviewConfig((prev) => ({ ...prev, [previewId]: { ...prev[previewId], [fieldName]: value } }))
      }
      onApply={() => {}}
      onOpenStepEditor={props.onOpenStepEditor}
      workflowId="wf-current"
    />
  );
}

function Host() {
  const [previewConfig, setPreviewConfig] = useState<Record<string, Record<string, unknown>>>({});
  return (
    <BuilderPreviewSetupCard
      preview={previewDraft}
      setupFieldsByType={setupFieldsByType}
      previewConfig={previewConfig}
      providerLabels={{ typeform: "Typeform", mailchimp: "Mailchimp", hubspot: "HubSpot", gmail: "Gmail" }}
      onPreviewConfigChange={(previewId, fieldName, value) =>
        setPreviewConfig((prev) => ({ ...prev, [previewId]: { ...prev[previewId], [fieldName]: value } }))
      }
      onApply={() => {}}
      workflowId="wf-current"
    />
  );
}

beforeEach(() => {
  mockFetchOptionsSource.mockReset().mockImplementation(async (source: string) => {
    if (source === "typeform:forms") {
      return { ok: true, source, items: [{ value: "form_abc", label: "Contact form" }], hasMore: false };
    }
    if (source === "mailchimp:audiences") {
      return { ok: true, source, items: [{ value: "aud_1", label: "Newsletter" }], hasMore: false };
    }
    throw new Error(`unexpected source ${source}`);
  });
});

describe("the repaired plan's preview renders real setup controls", () => {
  it("shows all four nodes and a setup section (not a chat questionnaire)", () => {
    render(<Host />);
    expect(screen.getByTestId("builder-preview-setup-rail")).toBeInTheDocument();
    expect(screen.getByText(/Finish these details before applying:/i)).toBeInTheDocument();
    // Four nodes made it from plan → preview.
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
    // to the full step editor and, since REACT-AGENT-RESOLVER-RECOVERY-1, that deferral is a
    // WORKING action ("Add to draft & open step" → additive apply + reveal), not dead copy. The
    // field stays required, so readiness still blocks until the user sets it in the editor.
    const onOpenStepEditor = jest.fn();
    render(<HostWithOpen onOpenStepEditor={onOpenStepEditor} />);
    const deferred = screen.getAllByTestId("preview-setup-after-apply");
    expect(deferred.some((el) => (el.textContent ?? "").includes("to"))).toBe(true);
    const open = await screen.findByTestId("preview-setup-preview-step-4-after-apply-open");
    fireEvent.click(open);
    expect(onOpenStepEditor).toHaveBeenCalledWith("preview-step-4", "to");
  });

  it("selections persist in ephemeral previewConfig and other values survive each other", async () => {
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

  it("the card applies to the CURRENT workflow (single explicit apply action, no second workflow)", () => {
    render(<Host />);
    // One explicit apply affordance; the apply pipeline itself (current-workflow additive apply,
    // no new workflow, checkpoint) is pinned by builder-apply-preview.test.tsx.
    expect(screen.getByTestId("builder-preview-setup-apply")).toBeInTheDocument();
  });
});
