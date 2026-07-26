/**
 * The setup card renders the six enrichment outcomes
 * (REACT-AGENT-PREVIEW-PROVENANCE-CLOSEOUT-1).
 *
 * The mapping work is worthless if the user cannot see what happened. These tests pin that each
 * outcome renders with its OWN distinguishable copy — mapped, needs-you, ambiguous (with the
 * choices), missing, waiting-for-schema, and invalid-after-a-resource-change — and that a resolver
 * failure surfaces as safe copy plus a retry rather than a provider error.
 */
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: () => Promise.resolve({ ok: true, source: "s", items: [], hasMore: false }),
}));

import { fireEvent, render, screen } from "@testing-library/react";
import {
  BuilderPreviewSetupCard,
  type BuilderPreviewSetupCardProps,
} from "@/features/workflow-builder/panels/BuilderPreviewSetupCard";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import type { PreviewSetupFieldsByType } from "@/core/workflows/previewSetupFields";

const setupFieldsByType: PreviewSetupFieldsByType = {
  "some_crm:create_person": [
    { name: "email", label: "Email", type: "text", required: true },
    { name: "firstName", label: "First name", type: "text", required: false },
    { name: "company", label: "Company", type: "text", required: false },
  ],
  "mailchimp:add_subscriber": [
    { name: "audienceId", label: "Audience", type: "text", required: true },
  ],
};

function preview(missing: readonly string[] = [], mcMissing: readonly string[] = []): DraftPreview {
  return {
    version: 1,
    title: "Add people to the CRM",
    summary: "",
    notice: "Preview only — your workflow has not changed.",
    notApplied: true,
    nodes: [
      { previewId: "crm", role: "action", provider: "some_crm", type: "create_person", label: "Create person", purpose: "", missingInputs: missing, notApplied: true },
      { previewId: "mc", role: "action", provider: "mailchimp", type: "add_subscriber", label: "Add subscriber", purpose: "", missingInputs: mcMissing, notApplied: true },
    ],
    edges: [],
  } as DraftPreview;
}

type Enrichment = NonNullable<BuilderPreviewSetupCardProps["enrichment"]>;

const NO_ENRICHMENT: Enrichment = {
  mapped: {},
  mappedLabels: {},
  notes: [],
  invalidated: [],
  awaitingResource: false,
  message: null,
  retry: () => {},
  status: "ready",
};

function renderCard(enrichment: Partial<Enrichment>, p: DraftPreview = preview()) {
  return render(
    <BuilderPreviewSetupCard
      preview={p}
      setupFieldsByType={setupFieldsByType}
      previewConfig={{}}
      onPreviewConfigChange={() => {}}
      onApply={() => {}}
      enrichment={{ ...NO_ENRICHMENT, ...enrichment }}
    />,
  );
}

describe("mapped (#23)", () => {
  it("shows the field and the upstream field it came from", () => {
    renderCard({
      mapped: { "crm.email": "{{trig.columns.contact_email}}" },
      mappedLabels: { "crm.email": "Work email" },
    });
    const row = screen.getByTestId("preview-readiness-crm-email");
    expect(row).toHaveAttribute("data-readiness", "mapped");
    expect(row).toHaveTextContent("Email");
    expect(row).toHaveTextContent("Mapped from upstream: Work email");
  });
});

describe("genuine user decision (#24, #30)", () => {
  it("asks for the audience rather than guessing one", () => {
    renderCard({}, preview([], ["audienceId"]));
    const row = screen.getByTestId("preview-readiness-mc-audienceId");
    expect(row).toHaveAttribute("data-readiness", "needs_user");
    expect(row).toHaveTextContent("Select audience");
  });
});

describe("ambiguous (#25)", () => {
  it("lists the candidates instead of choosing", () => {
    renderCard({
      notes: [
        { nodeId: "crm", field: "email", kind: "ambiguous", candidates: ["Work email", "Personal email"] },
      ],
    });
    const row = screen.getByTestId("preview-readiness-crm-email");
    expect(row).toHaveAttribute("data-readiness", "ambiguous");
    expect(row).toHaveTextContent("Choose one:");
    const choices = screen.getAllByTestId("preview-readiness-candidate-crm-email");
    expect(choices.map((c) => c.textContent)).toEqual(["Work email", "Personal email"]);
  });
});

describe("missing (#26)", () => {
  it("explains the resource has no such field", () => {
    renderCard({ notes: [{ nodeId: "crm", field: "company", kind: "missing" }] });
    const row = screen.getByTestId("preview-readiness-crm-company");
    expect(row).toHaveAttribute("data-readiness", "missing");
    expect(row).toHaveTextContent("The selected resource does not contain a company field.");
  });
});

describe("waiting for the schema", () => {
  it("tells the user to pick the source first", () => {
    renderCard({ awaitingResource: true, status: "waiting_for_config" }, preview(["firstName"]));
    const row = screen.getByTestId("preview-readiness-crm-firstName");
    expect(row).toHaveAttribute("data-readiness", "waiting");
    expect(row).toHaveTextContent("Select the upstream resource first so this field can be mapped.");
  });
});

describe("invalid after a resource change (#27)", () => {
  it("says the previously-mapped field is gone, and does not silently repoint it", () => {
    renderCard({
      mapped: { "crm.company": "{{trig.columns.employer}}" },
      invalidated: [{ nodeId: "crm", field: "company" }],
    });
    const row = screen.getByTestId("preview-readiness-crm-company");
    expect(row).toHaveAttribute("data-readiness", "invalid");
    expect(row).toHaveTextContent("no longer contains the previously mapped field");
  });
});

describe("resolver trouble is safe copy, never a provider error", () => {
  it("shows the message and a working retry for a retryable failure", () => {
    const retry = jest.fn();
    renderCard({ status: "retryable_error", message: "Couldn't load the fields right now.", retry });
    const notice = screen.getByTestId("preview-schema-notice");
    expect(notice).toHaveTextContent("Couldn't load the fields right now.");
    fireEvent.click(screen.getByTestId("preview-schema-retry"));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("offers no retry when reconnecting is the actual fix", () => {
    renderCard({ status: "reconnect_required", message: "Reconnect the integration to continue." });
    expect(screen.getByTestId("preview-schema-notice")).toBeInTheDocument();
    expect(screen.queryByTestId("preview-schema-retry")).not.toBeInTheDocument();
  });
});

describe("backwards compatibility", () => {
  it("renders no readiness rows at all when no enrichment is supplied", () => {
    render(
      <BuilderPreviewSetupCard
        preview={preview(["email"])}
        setupFieldsByType={setupFieldsByType}
        previewConfig={{}}
        onPreviewConfigChange={() => {}}
        onApply={() => {}}
      />,
    );
    expect(screen.queryByTestId("preview-readiness-crm-email")).not.toBeInTheDocument();
    // The pre-existing control still renders exactly as before.
    expect(screen.getByTestId("preview-setup-crm-email")).toBeInTheDocument();
  });
});
