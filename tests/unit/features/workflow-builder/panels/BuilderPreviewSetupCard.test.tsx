/**
 * BuilderPreviewSetupCard — guided preview setup re-homed into the React rail
 * (HERMES-AGENT-GUIDED-PREVIEW-SETUP-RAIL-UX + -ASYNC-OPTIONS).
 *
 * Proves the rail setup card renders supported local controls for the latest preview's missing fields,
 * renders async optionsSource fields as a dropdown loaded through the EXISTING resolver helper
 * (`fetchOptionsSource` → GET /api/options/[source]; NEVER Hermes), handles loading/empty/error/
 * deferred states, updates ONLY the ephemeral previewConfig via onPreviewConfigChange (no store/Hermes),
 * and applies via the existing explicit onApply. Recipient-class fields render as local/async controls;
 * secret/connection fields are excluded upstream (never in setupFieldsByType) so they never render here.
 */
const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
}));

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuilderPreviewSetupCard } from "@/features/workflow-builder/panels/BuilderPreviewSetupCard";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import type { PreviewSetupFieldsByType } from "@/core/workflows/previewSetupFields";

beforeEach(() => {
  mockFetchOptionsSource.mockReset();
});

function preview(missing: readonly string[]): DraftPreview {
  return {
    version: 1,
    title: "Lead follow-up",
    summary: "Watch then notify.",
    notice: "Preview only — your workflow has not changed.",
    notApplied: true,
    nodes: [
      { previewId: "preview-step-1", role: "trigger", provider: "gmail", type: "new_email", label: "gmail:new_email", purpose: "watch", notApplied: true },
      { previewId: "preview-step-2", role: "action", provider: "slack", type: "send_message", label: "slack:send_message", purpose: "notify", missingInputs: missing, notApplied: true },
    ],
    edges: [{ previewId: "preview-edge-1", fromPreviewId: "preview-step-1", toPreviewId: "preview-step-2", notApplied: true }],
  };
}

const setupFieldsByType: PreviewSetupFieldsByType = {
  "slack:send_message": [
    { name: "text", label: "Message", type: "textarea", required: true },
    // A recipient-class field that renders as a local text control (e.g. typed destination).
    { name: "to", label: "To", type: "text", required: true },
    { name: "count", label: "Count", type: "number", required: false },
    { name: "silent", label: "Silent", type: "boolean", required: false },
    { name: "mode", label: "Mode", type: "select", required: false, options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
  ],
};

describe("BuilderPreviewSetupCard", () => {
  it("renders supported controls (text/textarea/number/boolean/select incl. recipient) for missing fields", () => {
    render(
      <BuilderPreviewSetupCard
        preview={preview(["text", "to", "count", "silent", "mode"])}
        setupFieldsByType={setupFieldsByType}
        previewConfig={{}}
        onPreviewConfigChange={() => {}}
        onApply={() => {}}
      />,
    );
    expect(screen.getByTestId("builder-preview-setup-rail")).toBeInTheDocument();
    for (const name of ["text", "to", "count", "silent", "mode"]) {
      expect(screen.getByTestId(`preview-setup-preview-step-2-${name}`)).toBeInTheDocument();
    }
    expect(screen.getByText(/Finish these details before applying:/i)).toBeInTheDocument();
  });

  // REACT-AGENT-RAIL-NODE-DISPLAY-NAMES-1 — a preview node's `label` is the raw `provider:type`
  // capability key by contract. It is an internal identifier and must never be a step's NAME.
  it("names each step with its registry display name, never the raw provider:type key", () => {
    render(
      <BuilderPreviewSetupCard
        preview={preview(["text"])}
        setupFieldsByType={setupFieldsByType}
        nodeDisplayNames={{ "slack:send_message": "Send Channel Message" }}
        previewConfig={{}}
        onPreviewConfigChange={() => {}}
        onApply={() => {}}
      />,
    );
    const card = screen.getByTestId("builder-preview-setup-rail");
    expect(card).toHaveTextContent("Send Channel Message");
    expect(card).not.toHaveTextContent("slack:send_message");
  });

  it("falls back to the title-cased type key when no display-name map is supplied", () => {
    render(
      <BuilderPreviewSetupCard
        preview={preview(["text"])}
        setupFieldsByType={setupFieldsByType}
        previewConfig={{}}
        onPreviewConfigChange={() => {}}
        onApply={() => {}}
      />,
    );
    const card = screen.getByTestId("builder-preview-setup-rail");
    expect(card).toHaveTextContent("Send Message");
    expect(card).not.toHaveTextContent("slack:send_message");
  });

  it("defers an async optionsSource field (not in supported metadata) to 'Choose after Apply'", () => {
    render(
      <BuilderPreviewSetupCard
        preview={preview(["text", "channel"])}
        setupFieldsByType={setupFieldsByType}
        previewConfig={{}}
        onPreviewConfigChange={() => {}}
        onApply={() => {}}
      />,
    );
    expect(screen.getByTestId("preview-setup-preview-step-2-text")).toBeInTheDocument();
    // `channel` (async resolver) is not faked as a dropdown — it's deferred.
    expect(screen.queryByTestId("preview-setup-preview-step-2-channel")).not.toBeInTheDocument();
    expect(screen.getByTestId("preview-setup-after-apply")).toHaveTextContent("Choose after Apply: channel");
  });

  it("filling a control (incl. a recipient field) calls onPreviewConfigChange only — preview-only", () => {
    const onPreviewConfigChange = jest.fn();
    render(
      <BuilderPreviewSetupCard
        preview={preview(["to"])}
        setupFieldsByType={setupFieldsByType}
        previewConfig={{}}
        onPreviewConfigChange={onPreviewConfigChange}
        onApply={() => {}}
      />,
    );
    fireEvent.change(screen.getByTestId("preview-setup-preview-step-2-to"), {
      target: { value: "team@example.com" },
    });
    expect(onPreviewConfigChange).toHaveBeenCalledWith("preview-step-2", "to", "team@example.com");
  });

  it("clicking Apply to draft calls onApply (the existing explicit apply action)", async () => {
    const user = userEvent.setup();
    const onApply = jest.fn();
    render(
      <BuilderPreviewSetupCard
        preview={preview(["text"])}
        setupFieldsByType={setupFieldsByType}
        previewConfig={{}}
        onPreviewConfigChange={() => {}}
        onApply={onApply}
      />,
    );
    await user.click(screen.getByTestId("builder-preview-setup-apply"));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("shows an apply-only card (no controls) when nothing is missing", () => {
    render(
      <BuilderPreviewSetupCard
        preview={preview([])}
        setupFieldsByType={setupFieldsByType}
        previewConfig={{}}
        onPreviewConfigChange={() => {}}
        onApply={() => {}}
      />,
    );
    expect(screen.getByTestId("builder-preview-setup-rail")).toBeInTheDocument();
    expect(screen.getByTestId("builder-preview-setup-apply")).toBeInTheDocument();
    expect(document.querySelector("[data-testid^='preview-setup-preview-step-']")).toBeNull();
  });

  it("reflects the current previewConfig value in the control", () => {
    render(
      <BuilderPreviewSetupCard
        preview={preview(["text"])}
        setupFieldsByType={setupFieldsByType}
        previewConfig={{ "preview-step-2": { text: "Review new leads" } }}
        onPreviewConfigChange={() => {}}
        onApply={() => {}}
      />,
    );
    expect((screen.getByTestId("preview-setup-preview-step-2-text") as HTMLTextAreaElement).value).toBe(
      "Review new leads",
    );
  });
});

describe("BuilderPreviewSetupCard — async optionsSource dropdown (HERMES-AGENT-GUIDED-PREVIEW-SETUP-ASYNC-OPTIONS)", () => {
  // Slack-channel-like async single-select (recipient + optionsSource). The card loads options via the
  // existing resolver helper (fetchOptionsSource), never Hermes.
  const asyncFields: PreviewSetupFieldsByType = {
    "slack:send_channel_message": [
      { name: "channel", label: "Channel", type: "select-async", required: true, optionsSource: "slack:channels" },
    ],
  };
  // A two-field cascade: tableId depends on baseId (both async).
  const cascadeFields: PreviewSetupFieldsByType = {
    "slack:send_channel_message": [
      { name: "baseId", label: "Base", type: "select-async", required: true, optionsSource: "airtable:bases" },
      { name: "tableId", label: "Table", type: "select-async", required: true, optionsSource: "airtable:tables", dependsOn: ["baseId"] },
    ],
  };
  function asyncPreview(missing: readonly string[]): DraftPreview {
    return {
      version: 1,
      title: "t",
      summary: "s",
      notice: "Preview only — your workflow has not changed.",
      notApplied: true,
      nodes: [
        { previewId: "preview-step-1", role: "action", provider: "slack", type: "send_channel_message", label: "slack:send_channel_message", purpose: "notify", missingInputs: missing, notApplied: true },
      ],
      edges: [],
    };
  }
  function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
  }

  it("renders an async field as a dropdown populated through the resolver helper (not Hermes)", async () => {
    mockFetchOptionsSource.mockResolvedValue({ ok: true, source: "slack:channels", items: [{ value: "C1", label: "#general" }, { value: "C2", label: "#leads" }], hasMore: false });
    render(
      <BuilderPreviewSetupCard
        preview={asyncPreview(["channel"])}
        setupFieldsByType={asyncFields}
        previewConfig={{}}
        onPreviewConfigChange={() => {}}
        onApply={() => {}}
        workflowId="wf-9"
      />,
    );
    const select = await screen.findByTestId("preview-setup-preview-step-1-channel");
    await waitFor(() => expect(select.querySelectorAll("option").length).toBe(3)); // placeholder + 2
    expect(select).toHaveTextContent("#general");
    expect(select).toHaveTextContent("#leads");
    // Loaded through the existing options helper with the right source + workflow provenance — NOT Hermes.
    expect(mockFetchOptionsSource).toHaveBeenCalled();
    expect(mockFetchOptionsSource.mock.calls[0]![0]).toBe("slack:channels");
    expect(mockFetchOptionsSource.mock.calls[0]![1]).toMatchObject({ workflowId: "wf-9" });
  });

  it("renders a loading state while options load", async () => {
    const d = deferred<unknown>();
    mockFetchOptionsSource.mockReturnValue(d.promise);
    render(
      <BuilderPreviewSetupCard preview={asyncPreview(["channel"])} setupFieldsByType={asyncFields} previewConfig={{}} onPreviewConfigChange={() => {}} onApply={() => {}} />,
    );
    const select = screen.getByTestId("preview-setup-preview-step-1-channel") as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(select).toHaveTextContent("Loading…");
    d.resolve({ ok: true, source: "slack:channels", items: [{ value: "C1", label: "#general" }], hasMore: false });
    await waitFor(() => expect(select.disabled).toBe(false));
  });

  // REACT-AGENT-RESOLVER-RECOVERY-1 — "the account has none of this resource" is a DIFFERENT
  // situation from "the request failed", and it is still recoverable (the user may know the id).
  it("renders an empty state distinctly from a failure, with recovery actions", async () => {
    mockFetchOptionsSource.mockResolvedValue({ ok: true, source: "slack:channels", items: [], hasMore: false });
    render(
      <BuilderPreviewSetupCard preview={asyncPreview(["channel"])} setupFieldsByType={asyncFields} previewConfig={{}} onPreviewConfigChange={() => {}} onApply={() => {}} />,
    );
    const box = await screen.findByTestId("preview-setup-preview-step-1-channel-error");
    expect(box).toHaveAttribute("data-recovery-kind", "no-results");
    expect(box).toHaveTextContent(/No channels found in your Slack account/i);
    // Distinct from a request failure — and still actionable.
    expect(screen.getByTestId("preview-setup-preview-step-1-channel-retry")).toBeInTheDocument();
    expect(screen.getByTestId("preview-setup-preview-step-1-channel-manual-toggle")).toBeInTheDocument();
  });

  it("renders an error state with retry safely (does not crash) when the resolver fails", async () => {
    mockFetchOptionsSource.mockResolvedValue({ ok: false, source: "slack:channels", code: "PROVIDER_ERROR", message: "boom" });
    render(
      <BuilderPreviewSetupCard preview={asyncPreview(["channel"])} setupFieldsByType={asyncFields} previewConfig={{}} onPreviewConfigChange={() => {}} onApply={() => {}} />,
    );
    expect(await screen.findByTestId("preview-setup-preview-step-1-channel-error")).toBeInTheDocument();
    expect(screen.getByTestId("preview-setup-preview-step-1-channel-retry")).toBeInTheDocument();
    // The raw provider detail is never surfaced.
    expect(screen.getByTestId("preview-setup-preview-step-1-channel-error").textContent ?? "").not.toMatch(/boom/);
  });

  it("selecting an async option updates previewConfig only (no Hermes, no graph mutation)", async () => {
    const onPreviewConfigChange = jest.fn();
    mockFetchOptionsSource.mockResolvedValue({ ok: true, source: "slack:channels", items: [{ value: "C2", label: "#leads" }], hasMore: false });
    render(
      <BuilderPreviewSetupCard preview={asyncPreview(["channel"])} setupFieldsByType={asyncFields} previewConfig={{}} onPreviewConfigChange={onPreviewConfigChange} onApply={() => {}} />,
    );
    const select = await screen.findByTestId("preview-setup-preview-step-1-channel");
    await waitFor(() => expect(select.querySelectorAll("option").length).toBe(2));
    fireEvent.change(select, { target: { value: "C2" } });
    expect(onPreviewConfigChange).toHaveBeenCalledWith("preview-step-1", "channel", "C2");
  });

  it("defers an async field whose dependsOn parent is missing ('Choose … first', no fetch)", () => {
    // The parent (baseId) is itself async and DOES fetch; the gated child (tableId) must not.
    mockFetchOptionsSource.mockResolvedValue({ ok: true, source: "airtable:bases", items: [], hasMore: false });
    render(
      <BuilderPreviewSetupCard
        preview={asyncPreview(["baseId", "tableId"])}
        setupFieldsByType={cascadeFields}
        previewConfig={{}}
        onPreviewConfigChange={() => {}}
        onApply={() => {}}
      />,
    );
    const tableSelect = screen.getByTestId("preview-setup-preview-step-1-tableId") as HTMLSelectElement;
    expect(tableSelect.disabled).toBe(true);
    expect(tableSelect).toHaveTextContent("Choose baseId first");
    // Only the parent (baseId) fetched; the gated child made no resolver call.
    expect(mockFetchOptionsSource.mock.calls.every((c) => c[0] !== "airtable:tables")).toBe(true);
  });

  it("passes available dependsOn values to the resolver when the parent is filled", async () => {
    mockFetchOptionsSource.mockResolvedValue({ ok: true, source: "airtable:tables", items: [{ value: "tbl1", label: "Tasks" }], hasMore: false });
    render(
      <BuilderPreviewSetupCard
        preview={asyncPreview(["baseId", "tableId"])}
        setupFieldsByType={cascadeFields}
        previewConfig={{ "preview-step-1": { baseId: "appXYZ" } }}
        onPreviewConfigChange={() => {}}
        onApply={() => {}}
      />,
    );
    await screen.findByTestId("preview-setup-preview-step-1-tableId");
    await waitFor(() => {
      const tablesCall = mockFetchOptionsSource.mock.calls.find((c) => c[0] === "airtable:tables");
      expect(tablesCall).toBeDefined();
      expect(tablesCall![1]).toMatchObject({ deps: { baseId: "appXYZ" } });
    });
  });
});
