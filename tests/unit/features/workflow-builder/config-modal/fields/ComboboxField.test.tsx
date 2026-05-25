/**
 * Tests for ComboboxField. Radix Popover + cmdk portal the searchable
 * surface, so tests focus on the closed-state trigger button (selected
 * label, placeholder, multi-select / missing-options guards). Open-state
 * interactions are covered by SchemaForm integration tests.
 *
 * Slice 3.31 extends coverage with the async `optionsSource` branch:
 *   - useOptionsSource is mocked; tests drive the discriminated state
 *     and verify the renderer's per-status UX.
 *   - When the user picks an async option, onChange fires with the
 *     item's `value`.
 *   - The search input updates the `query` arg passed to the hook.
 *   - Static-options behavior is preserved end-to-end.
 */
const mockUseOptionsSource = jest.fn();
const mockRefetch = jest.fn();

jest.mock("@/features/workflow-builder/hooks/useOptionsSource", () => ({
  __esModule: true,
  useOptionsSource: (...args: unknown[]) => mockUseOptionsSource(...args),
}));

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { ComboboxField } from "@/features/workflow-builder/config-modal/fields/ComboboxField";
import type { UseOptionsSourceState } from "@/features/workflow-builder/hooks/useOptionsSource";

function field(overrides: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name: "channelId",
    label: "Channel",
    type: "combobox",
    required: true,
    options: [
      { value: "C1", label: "#general" },
      { value: "C2", label: "#random" },
    ],
    ...overrides,
  } as FieldMeta;
}

function asyncField(overrides: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name: "channelId",
    label: "Channel",
    type: "combobox",
    required: true,
    optionsSource: "slack:channels",
    ...overrides,
  } as FieldMeta;
}

function setHookState(state: UseOptionsSourceState): void {
  mockUseOptionsSource.mockReturnValue({ state, refetch: mockRefetch });
}

beforeEach(() => {
  mockUseOptionsSource.mockReset();
  mockRefetch.mockReset();
});

describe("ComboboxField — static options (Slice 3.1 behavior preserved)", () => {
  it("renders the selected option's label inside the trigger", () => {
    render(
      <ComboboxField field={field()} value="C1" onChange={jest.fn()} />,
    );
    expect(
      screen.getByRole("combobox", { name: "Channel" }),
    ).toHaveTextContent("#general");
  });

  it("renders placeholder text when value is empty", () => {
    render(
      <ComboboxField
        field={field({ placeholder: "Pick a channel" })}
        value=""
        onChange={jest.fn()}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "Channel" }),
    ).toHaveTextContent("Pick a channel");
  });

  it("surfaces 'multi-select not yet implemented' when meta declares multiple", () => {
    render(
      <ComboboxField
        field={field({ multiple: true })}
        value=""
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /Multi-select combobox not yet implemented/i,
    );
  });

  it("surfaces 'No options available' when neither options nor optionsSource is set", () => {
    render(
      <ComboboxField
        field={field({ options: undefined })}
        value=""
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /No options available/,
    );
  });

  it("does NOT invoke the async hook when static options are declared", () => {
    render(
      <ComboboxField field={field()} value="" onChange={jest.fn()} />,
    );
    expect(mockUseOptionsSource).not.toHaveBeenCalled();
  });
});

describe("ComboboxField — async optionsSource (Slice 3.31)", () => {
  it("invokes useOptionsSource with the field's optionsSource", () => {
    setHookState({
      status: "idle",
      items: [],
      hasMore: false,
    });
    render(
      <ComboboxField field={asyncField()} value="" onChange={jest.fn()} />,
    );
    expect(mockUseOptionsSource).toHaveBeenCalled();
    const firstCall = mockUseOptionsSource.mock.calls[0]![0];
    expect(firstCall.source).toBe("slack:channels");
  });

  it("renders the trigger with the placeholder when value is empty", () => {
    setHookState({ status: "loading", items: [], hasMore: false });
    render(
      <ComboboxField
        field={asyncField({ placeholder: "Pick channel" })}
        value=""
        onChange={jest.fn()}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "Channel" }),
    ).toHaveTextContent("Pick channel");
  });

  it("falls back to the raw value on the trigger when no items match the saved id", () => {
    // Saved workflow re-opens with a value but the items haven't loaded
    // yet — the trigger shows the value as a fallback rather than going
    // blank.
    setHookState({ status: "loading", items: [], hasMore: false });
    render(
      <ComboboxField
        field={asyncField()}
        value="C-saved"
        onChange={jest.fn()}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "Channel" }),
    ).toHaveTextContent("C-saved");
  });

  it("renders the option's label on the trigger once items load and one matches", () => {
    setHookState({
      status: "ready",
      items: [
        { value: "C-saved", label: "#general" },
        { value: "C-other", label: "#random" },
      ],
      hasMore: false,
    });
    render(
      <ComboboxField
        field={asyncField()}
        value="C-saved"
        onChange={jest.fn()}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "Channel" }),
    ).toHaveTextContent("#general");
  });

  it("loading state renders the spinner row", async () => {
    setHookState({ status: "loading", items: [], hasMore: false });
    const user = userEvent.setup();
    render(
      <ComboboxField field={asyncField()} value="" onChange={jest.fn()} />,
    );
    await user.click(screen.getByRole("combobox", { name: "Channel" }));
    expect(screen.getByRole("status")).toHaveTextContent(/Loading options/i);
  });

  it("ready state renders returned options", async () => {
    setHookState({
      status: "ready",
      items: [
        { value: "C1", label: "#general" },
        { value: "C2", label: "#random" },
      ],
      hasMore: false,
    });
    const user = userEvent.setup();
    render(
      <ComboboxField field={asyncField()} value="" onChange={jest.fn()} />,
    );
    await user.click(screen.getByRole("combobox", { name: "Channel" }));
    expect(await screen.findByText("#general")).toBeInTheDocument();
    expect(screen.getByText("#random")).toBeInTheDocument();
  });

  it("renders the hasMore hint when more items exist beyond the page", async () => {
    setHookState({
      status: "ready",
      items: [{ value: "C1", label: "#general" }],
      hasMore: true,
    });
    const user = userEvent.setup();
    render(
      <ComboboxField field={asyncField()} value="" onChange={jest.fn()} />,
    );
    await user.click(screen.getByRole("combobox", { name: "Channel" }));
    expect(
      await screen.findByText(/Refine search to narrow/i),
    ).toBeInTheDocument();
  });

  it("empty state renders 'No matches.'", async () => {
    setHookState({ status: "empty", items: [], hasMore: false });
    const user = userEvent.setup();
    render(
      <ComboboxField field={asyncField()} value="" onChange={jest.fn()} />,
    );
    await user.click(screen.getByRole("combobox", { name: "Channel" }));
    expect(await screen.findByText(/No matches/i)).toBeInTheDocument();
  });

  it("error state renders the message and a retry button that calls refetch", async () => {
    setHookState({
      status: "error",
      items: [],
      hasMore: false,
      code: "PROVIDER_ERROR",
      message: "Couldn't load Slack channels.",
    });
    const user = userEvent.setup();
    render(
      <ComboboxField field={asyncField()} value="" onChange={jest.fn()} />,
    );
    await user.click(screen.getByRole("combobox", { name: "Channel" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Couldn't load Slack channels/i);
    const retryButton = within(alert).getByRole("button", {
      name: /try again/i,
    });
    await user.click(retryButton);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("disconnected state renders the connect-provider hint", async () => {
    setHookState({
      status: "disconnected",
      items: [],
      hasMore: false,
      provider: "slack",
      message: "No active slack integration.",
    });
    const user = userEvent.setup();
    render(
      <ComboboxField field={asyncField()} value="" onChange={jest.fn()} />,
    );
    await user.click(screen.getByRole("combobox", { name: "Channel" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Connect slack first/i,
    );
  });

  it("typing into the search input updates the query passed to the hook", async () => {
    setHookState({
      status: "ready",
      items: [{ value: "C1", label: "#general" }],
      hasMore: false,
    });
    const user = userEvent.setup();
    render(
      <ComboboxField field={asyncField()} value="" onChange={jest.fn()} />,
    );
    await user.click(screen.getByRole("combobox", { name: "Channel" }));

    const searchbox = await screen.findByPlaceholderText("Search...");
    await user.type(searchbox, "eng");

    // The hook was called multiple times across renders; the LAST call
    // should carry the typed query.
    const lastCall =
      mockUseOptionsSource.mock.calls[
        mockUseOptionsSource.mock.calls.length - 1
      ]![0];
    expect(lastCall.query).toBe("eng");
    expect(lastCall.source).toBe("slack:channels");
  });

  it("selecting an async option invokes onChange with the option value", async () => {
    setHookState({
      status: "ready",
      items: [
        { value: "C1", label: "#general" },
        { value: "C2", label: "#random" },
      ],
      hasMore: false,
    });
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <ComboboxField field={asyncField()} value="" onChange={onChange} />,
    );
    await user.click(screen.getByRole("combobox", { name: "Channel" }));

    const random = await screen.findByText("#random");
    await user.click(random);
    expect(onChange).toHaveBeenCalledWith("C2");
  });

  it("renders inline error from props in async mode", () => {
    setHookState({
      status: "ready",
      items: [{ value: "C1", label: "#general" }],
      hasMore: false,
    });
    render(
      <ComboboxField
        field={asyncField()}
        value=""
        onChange={jest.fn()}
        error="Channel is required."
      />,
    );
    expect(screen.getByText(/Channel is required/i)).toBeInTheDocument();
  });

  it("renders description from field meta in async mode when no error", () => {
    setHookState({
      status: "ready",
      items: [{ value: "C1", label: "#general" }],
      hasMore: false,
    });
    render(
      <ComboboxField
        field={asyncField({ description: "Slack channel to post to." })}
        value=""
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText(/Slack channel to post to/i)).toBeInTheDocument();
  });

  it("required-marker asterisk renders in async mode", () => {
    setHookState({ status: "idle", items: [], hasMore: false });
    render(
      <ComboboxField field={asyncField()} value="" onChange={jest.fn()} />,
    );
    const marker = document.querySelector('[data-required="true"]');
    expect(marker).not.toBeNull();
  });
});

// ─── Slice 3.33 — dependsOn cascade props ──────────────────────────────────

describe("ComboboxField async optionsSource — dependsOn cascade props (Slice 3.33)", () => {
  function dependentField(overrides: Partial<FieldMeta> = {}): FieldMeta {
    return {
      name: "child",
      label: "Child",
      type: "combobox",
      required: true,
      optionsSource: "native:examples",
      dependsOn: "parent",
      ...overrides,
    } as FieldMeta;
  }

  it("renders a passive 'Select <parentLabel> first' trigger when enabled is false and dependsOn is set", () => {
    render(
      <ComboboxField
        field={dependentField()}
        value=""
        onChange={jest.fn()}
        enabled={false}
        parentLabel="Workspace"
      />,
    );
    const passive = screen.getByTestId("combobox-parent-missing");
    expect(passive).toBeInTheDocument();
    expect(passive).toBeDisabled();
    expect(passive).toHaveTextContent(/Select Workspace first/i);
    // The async hook is NOT invoked when enabled=false + dependsOn.
    expect(mockUseOptionsSource).not.toHaveBeenCalled();
  });

  it("falls back to field.dependsOn name when parentLabel is not provided", () => {
    render(
      <ComboboxField
        field={dependentField()}
        value=""
        onChange={jest.fn()}
        enabled={false}
      />,
    );
    expect(screen.getByTestId("combobox-parent-missing")).toHaveTextContent(
      /Select parent first/i,
    );
  });

  it("renders the async body normally (and calls the hook) when enabled is true", () => {
    setHookState({
      status: "ready",
      items: [{ value: "x", label: "X" }],
      hasMore: false,
    });
    render(
      <ComboboxField
        field={dependentField()}
        value=""
        onChange={jest.fn()}
        enabled={true}
        parentLabel="Workspace"
        deps={{ parent: "PV" }}
      />,
    );
    expect(
      screen.queryByTestId("combobox-parent-missing"),
    ).not.toBeInTheDocument();
    expect(mockUseOptionsSource).toHaveBeenCalled();
  });

  it("forwards deps to useOptionsSource when enabled is true", () => {
    setHookState({ status: "ready", items: [], hasMore: false });
    render(
      <ComboboxField
        field={dependentField()}
        value=""
        onChange={jest.fn()}
        enabled={true}
        deps={{ parent: "PV" }}
      />,
    );
    const lastArgs =
      mockUseOptionsSource.mock.calls[
        mockUseOptionsSource.mock.calls.length - 1
      ]![0];
    expect(lastArgs.deps).toEqual({ parent: "PV" });
    expect(lastArgs.source).toBe("native:examples");
  });

  it("falls through to the async body when enabled is false but the field has no dependsOn (no passive UX without a parent to gate on)", () => {
    // Defensive: SchemaForm shouldn't ever set enabled=false without
    // dependsOn, but ComboboxField doesn't render the parent-missing
    // hint without a parent to reference. The async body still mounts
    // and the hook handles the enabled=false state (returns idle).
    setHookState({ status: "idle", items: [], hasMore: false });
    render(
      <ComboboxField
        field={asyncField({ dependsOn: undefined })}
        value=""
        onChange={jest.fn()}
        enabled={false}
      />,
    );
    expect(
      screen.queryByTestId("combobox-parent-missing"),
    ).not.toBeInTheDocument();
    expect(mockUseOptionsSource).toHaveBeenCalled();
  });

  it("static-options path ignores deps/enabled/parentLabel entirely", () => {
    const onChange = jest.fn();
    render(
      <ComboboxField
        field={field()}
        value="C1"
        onChange={onChange}
        enabled={false}
        deps={{ parent: "X" }}
        parentLabel="Workspace"
      />,
    );
    // Static path renders normally — the trigger shows the selected
    // label, NOT the "Select X first" passive trigger.
    expect(
      screen.queryByTestId("combobox-parent-missing"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Channel" }),
    ).toHaveTextContent("#general");
    // No hook invocation on the static path either.
    expect(mockUseOptionsSource).not.toHaveBeenCalled();
  });
});
