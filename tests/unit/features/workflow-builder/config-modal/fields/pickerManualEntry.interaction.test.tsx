/**
 * PICKER-MANUAL-ENTRY-AUDIT-1 — user-facing behavior of the repaired picker
 * fields, driven through the REAL renderers over REAL shipped provider metadata
 * and the REAL shared config draft.
 *
 * The metadata-level rule lives in
 * `tests/unit/integrations/pickerManualEntryContract.test.ts`; this file proves
 * the rule actually buys the user something, for each distinct renderer path:
 *
 *   - a repaired, ungated picker  → google-drive:move_file.newParentFolderId
 *   - a repaired, PARENT-GATED picker → dropbox:download_file.path
 *   - an intentionally picker-only field → hubspot:add_contact_to_list.listId
 *
 * Only the external provider-resource call (`useOptionsSource`) and the upstream
 * variable source are stubbed. SchemaForm, ComboboxField, VariablePickerButton /
 * Popover, configSlice and the canonical commit path are all real.
 */
const mockUseOptionsSource = jest.fn();
jest.mock("@/features/workflow-builder/hooks/useOptionsSource", () => ({
  __esModule: true,
  useOptionsSource: (...a: unknown[]) => mockUseOptionsSource(...a),
}));

const mockUpstream = jest.fn();
jest.mock("@/features/workflow-builder/hooks/useActiveNodeUpstreamVariables", () => ({
  __esModule: true,
  useActiveNodeUpstreamVariables: () => mockUpstream(),
}));

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { SchemaForm } from "@/features/workflow-builder/config-modal/SchemaForm";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { commitNodeConfigDraft } from "@/features/workflow-builder/state/commitConfigDraft";
import { googleDriveMoveFileMeta } from "@/integrations/google-drive/actions/moveFile.meta";
import { dropboxDownloadFileMeta } from "@/integrations/dropbox/actions/downloadFile.meta";
import { hubspotAddContactToListMeta } from "@/integrations/hubspot/actions/meta/addContactToList.meta";
import { MoveFileConfigSchema } from "@/integrations/google-drive/actions/moveFile.schema";

const NODE_ID = "n1";

/** Upstream source the variable picker offers. */
const SOURCES = [
  {
    sourceId: "trigger",
    label: "Trigger",
    outputs: [{ name: "folderId", type: "string", description: "A folder id." }],
  },
];

/**
 * Renders a node's real field list bound to the REAL configSlice draft — the
 * same wiring the config panel and the Document Guided Stop both use.
 */
function renderFields(fields: readonly FieldMeta[], initial: Record<string, unknown> = {}) {
  act(() => {
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        {
          id: NODE_ID,
          kind: "action",
          provider: "p",
          type: "t",
          config: initial,
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });
    useConfigSlice.getState().openNode({ nodeId: NODE_ID, initialValues: initial });
  });

  function Harness() {
    const values = useConfigSlice((s) => s.drafts[NODE_ID]?.values ?? {});
    const updateField = useConfigSlice((s) => s.updateField);
    return (
      <SchemaForm
        fields={fields}
        values={values}
        onChange={(name, value) => updateField({ nodeId: NODE_ID, name, value })}
      />
    );
  }
  return render(<Harness />);
}

const draftValues = () => useConfigSlice.getState().drafts[NODE_ID]!.values;
const savedConfig = () =>
  useGraphSlice.getState().pendingNodes.find((n) => n.id === NODE_ID)!.config;

beforeEach(() => {
  mockUseOptionsSource.mockReset();
  mockUseOptionsSource.mockReturnValue({
    state: {
      status: "ready",
      items: [{ value: "FOLDER_A", label: "Quarterly Reports" }],
      hasMore: false,
    },
    refetch: jest.fn(),
  });
  mockUpstream.mockReset();
  mockUpstream.mockReturnValue({ sources: SOURCES, latestValuesBySource: {} });
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

describe("a repaired picker field (google-drive:move_file.newParentFolderId)", () => {
  const fields = googleDriveMoveFileMeta.fields;

  it("still loads and displays the provider's resources", async () => {
    const user = userEvent.setup();
    renderFields(fields);
    await user.click(screen.getByRole("combobox", { name: /destination folder/i }));
    expect(await screen.findByText("Quarterly Reports")).toBeInTheDocument();
  });

  it("picking a resource commits the resolver's stable id", async () => {
    const user = userEvent.setup();
    renderFields(fields);
    await user.click(screen.getByRole("combobox", { name: /destination folder/i }));
    await user.click(await screen.findByText("Quarterly Reports"));
    expect(draftValues().newParentFolderId).toBe("FOLDER_A");
  });

  it("accepts a raw id the resolver never returned, and it survives Save", async () => {
    const user = userEvent.setup();
    renderFields(fields);
    await user.click(screen.getByRole("combobox", { name: /destination folder/i }));
    // "root" is a literal Google Drive accepts but no folder list contains it.
    await user.type(await screen.findByPlaceholderText(/pick a destination folder/i), "root");
    await user.click(await screen.findByTestId("combobox-manual-entry"));

    expect(draftValues().newParentFolderId).toBe("root");
    act(() => {
      commitNodeConfigDraft(NODE_ID);
    });
    expect(savedConfig().newParentFolderId).toBe("root");
    // …and the runtime schema accepts what the UI let the user save.
    expect(() =>
      MoveFileConfigSchema.parse({ fileId: "F1", newParentFolderId: "root" }),
    ).not.toThrow();
  });

  it("opens the variable picker and accepts an upstream {{...}} token", async () => {
    const user = userEvent.setup();
    renderFields(fields);

    await user.click(screen.getByTestId("combobox-newParentFolderId-picker-trigger"));
    const popover = await screen.findByTestId("combobox-newParentFolderId-picker-popover");
    await user.click(
      within(popover).getByRole("button", { name: /insert \{\{trigger\.folderId\}\}/i }),
    );

    expect(draftValues().newParentFolderId).toBe("{{trigger.folderId}}");
    act(() => {
      commitNodeConfigDraft(NODE_ID);
    });
    expect(savedConfig().newParentFolderId).toBe("{{trigger.folderId}}");
  });

  it("required-empty is still rejected — the flag does not weaken validation", () => {
    renderFields(fields);
    const field = fields.find((f) => f.name === "newParentFolderId")!;
    expect(field.required).toBe(true);
    // Nothing chosen ⇒ nothing stored, and the runtime schema refuses it.
    expect(draftValues().newParentFolderId).toBeUndefined();
    expect(() => MoveFileConfigSchema.parse({ fileId: "F1" })).toThrow();
    expect(() =>
      MoveFileConfigSchema.parse({ fileId: "F1", newParentFolderId: "" }),
    ).toThrow();
  });

  it("commits through the ONE canonical path — no second save is introduced", async () => {
    const user = userEvent.setup();
    renderFields(fields);
    await user.click(screen.getByRole("combobox", { name: /destination folder/i }));
    await user.click(await screen.findByText("Quarterly Reports"));

    // Selecting a value is draft-only: the canvas graph is untouched until commit.
    expect(savedConfig().newParentFolderId).toBeUndefined();
    expect(useGraphSlice.getState().isDirty).toBe(false);

    act(() => {
      commitNodeConfigDraft(NODE_ID);
    });
    expect(savedConfig().newParentFolderId).toBe("FOLDER_A");
    expect(useConfigSlice.getState().drafts[NODE_ID]!.isDirty).toBe(false);
  });
});

/**
 * The parent-gated variant. `dropbox:download_file.path` declares
 * `dependsOn: "folderPath"`, and ComboboxField short-circuits to a disabled
 * "Select <parent> first" control BEFORE the async body that owns manual entry
 * and the variable picker.
 *
 * So the repair is real but conditional: the copy's "Root-level files must be
 * typed manually" only becomes true once a folder is chosen. Pinned here so the
 * limitation is documented behavior rather than an assumption — changing it
 * would mean altering the shared renderer's gating, which is deliberately out of
 * scope for a metadata audit.
 */
describe("a repaired but PARENT-GATED picker (dropbox:download_file.path)", () => {
  const fields = dropboxDownloadFileMeta.fields;

  it("offers no free-value path while its parent folder is unset", () => {
    renderFields(fields);
    expect(screen.getByTestId("combobox-parent-missing")).toBeInTheDocument();
    expect(screen.queryByTestId("combobox-path-picker-trigger")).not.toBeInTheDocument();
  });

  it("accepts a typed root-level path once the parent folder is set", async () => {
    const user = userEvent.setup();
    renderFields(fields, { folderPath: "/Reports" });

    await user.click(screen.getByRole("combobox", { name: /^file$/i }));
    await user.type(await screen.findByPlaceholderText(/select a folder first/i), "/root-file.pdf");
    await user.click(await screen.findByTestId("combobox-manual-entry"));

    expect(draftValues().path).toBe("/root-file.pdf");
    // The variable picker is available on the same field.
    expect(screen.getByTestId("combobox-path-picker-trigger")).toBeInTheDocument();
  });
});

/**
 * PICKER-ONLY PROTECTION. HubSpot rejects membership writes to DYNAMIC lists
 * with a 400, and the picker carries each list's `processingType` on the option
 * description so the author can avoid them — meaning the SELECTION carries
 * information a raw id cannot. This field must stay closed, so the audit can
 * never drift into "every selector accepts arbitrary text".
 */
describe("an intentionally picker-only field (hubspot:add_contact_to_list.listId)", () => {
  const fields = hubspotAddContactToListMeta.fields;

  it("offers no 'Use this ID' item, even when the typed text matches nothing", async () => {
    const user = userEvent.setup();
    renderFields(fields);
    await user.click(screen.getByRole("combobox", { name: /list/i }));
    await user.type(await screen.findByPlaceholderText(/search hubspot lists/i), "12345");
    // A repaired field would offer "Use this ID: 12345" here. This one must not.
    expect(screen.queryByTestId("combobox-manual-entry")).not.toBeInTheDocument();
  });

  it("offers no variable picker", () => {
    renderFields(fields);
    expect(screen.queryByTestId("combobox-listId-picker-trigger")).not.toBeInTheDocument();
  });

  it("still commits a real picker selection", async () => {
    const user = userEvent.setup();
    renderFields(fields);
    await user.click(screen.getByRole("combobox", { name: /list/i }));
    await user.click(await screen.findByText("Quarterly Reports"));
    expect(draftValues().listId).toBe("FOLDER_A");
  });
});
