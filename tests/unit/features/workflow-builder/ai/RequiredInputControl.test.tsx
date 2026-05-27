/**
 * Tests for features/workflow-builder/ai/RequiredInputControl (Slice 4.AI-22).
 *
 * Pure-presentational component. The control branches on the server-
 * enriched FieldMeta hints attached to the planner's `requiredUserInput`
 * entry: static `options[]` → native <select>; `optionsSource` →
 * typeable combobox backed by `useOptionsSource`; otherwise → <input
 * type="text"> fallback. Always allows the user's typed answer to win
 * when `allowFreeText` is true.
 *
 * `useOptionsSource` is mocked so we never touch the network. The mocked
 * shape mirrors the hook's discriminated state union.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AiRequiredUserInput } from "@/lib/api/ai";

const mockUseOptionsSource = jest.fn();
jest.mock("@/features/workflow-builder/hooks/useOptionsSource", () => ({
  useOptionsSource: (...a: unknown[]) => mockUseOptionsSource(...a),
}));

import {
  RequiredInputControl,
  requiredInputKey,
  type RequiredInputAnswer,
} from "@/features/workflow-builder/ai/RequiredInputControl";

function defaultProps(input: AiRequiredUserInput) {
  return {
    input,
    inputKey: requiredInputKey(input),
    answer: undefined as RequiredInputAnswer | undefined,
    onChange: jest.fn(),
    stagedAnswers: new Map<string, RequiredInputAnswer>(),
  };
}

beforeEach(() => {
  mockUseOptionsSource.mockReset();
  mockUseOptionsSource.mockReturnValue({
    state: { status: "idle", items: [], hasMore: false },
    refetch: () => undefined,
  });
});

describe("RequiredInputControl — static options (Branch 1)", () => {
  const input: AiRequiredUserInput = {
    label: "Which event?",
    nodeId: "n1",
    field: "eventType",
    kind: "config_value",
    fieldLabel: "Event type",
    fieldType: "select",
    options: [
      { label: "payment_intent.succeeded", value: "payment_intent.succeeded" },
      { label: "payment_intent.payment_failed", value: "payment_intent.payment_failed" },
    ],
  };

  it("renders a <select> with one <option> per static option", () => {
    render(<RequiredInputControl {...defaultProps(input)} />);
    const control = screen.getByTestId("builder-ai-required-input-control");
    expect(control.getAttribute("data-variant")).toBe("static-options");
    const select = screen.getByTestId("builder-ai-required-input-select") as HTMLSelectElement;
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(options).toContain("payment_intent.succeeded");
    expect(options).toContain("payment_intent.payment_failed");
  });

  it("calls onChange with the picked label+value when an option is selected", () => {
    const onChange = jest.fn();
    render(<RequiredInputControl {...defaultProps(input)} onChange={onChange} />);
    const select = screen.getByTestId("builder-ai-required-input-select");
    fireEvent.change(select, { target: { value: "payment_intent.payment_failed" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0]![0] as RequiredInputAnswer;
    expect(arg.value).toBe("payment_intent.payment_failed");
    expect(arg.display).toBe("payment_intent.payment_failed");
    expect(arg.descriptor).toBe(input);
  });

  it("calls onChange(undefined) when the user clears the selection (empty value)", () => {
    const onChange = jest.fn();
    render(
      <RequiredInputControl
        {...defaultProps(input)}
        answer={{
          key: "n1::eventType",
          value: "payment_intent.succeeded",
          display: "payment_intent.succeeded",
          descriptor: input,
        }}
        onChange={onChange}
      />,
    );
    const select = screen.getByTestId("builder-ai-required-input-select");
    fireEvent.change(select, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("never fires the optionsSource hook on the static-options branch", () => {
    render(<RequiredInputControl {...defaultProps(input)} />);
    expect(mockUseOptionsSource).not.toHaveBeenCalled();
  });
});

describe("RequiredInputControl — optionsSource (Branch 2)", () => {
  const input: AiRequiredUserInput = {
    label: "Which Slack channel?",
    nodeId: "n_slack",
    field: "channel",
    kind: "config_value",
    provider: "slack",
    fieldLabel: "Channel",
    fieldType: "combobox",
    optionsSource: "slack:channels",
    allowFreeText: true,
  };

  it("renders a combobox query input + option list when the hook returns ready items", () => {
    mockUseOptionsSource.mockReturnValue({
      state: {
        status: "ready",
        items: [
          { value: "C123", label: "#general" },
          { value: "C456", label: "#announcements" },
        ],
        hasMore: false,
      },
      refetch: () => undefined,
    });
    render(<RequiredInputControl {...defaultProps(input)} />);
    expect(screen.getByTestId("builder-ai-required-input-combobox-query")).toBeInTheDocument();
    const optionList = screen.getByTestId("builder-ai-required-input-option-list");
    expect(optionList).toHaveTextContent("#general");
    expect(optionList).toHaveTextContent("#announcements");
  });

  it("calls onChange with the picked option's {label,value,descriptor} when an option is clicked", async () => {
    const user = userEvent.setup();
    mockUseOptionsSource.mockReturnValue({
      state: {
        status: "ready",
        items: [{ value: "C123", label: "#general" }],
        hasMore: false,
      },
      refetch: () => undefined,
    });
    const onChange = jest.fn();
    render(<RequiredInputControl {...defaultProps(input)} onChange={onChange} />);
    const option = screen.getByTestId("builder-ai-required-input-option");
    await user.click(option);
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0]![0] as RequiredInputAnswer;
    expect(arg.value).toBe("C123");
    expect(arg.display).toBe("#general");
  });

  it("renders a loading state while the hook is fetching", () => {
    mockUseOptionsSource.mockReturnValue({
      state: { status: "loading", items: [], hasMore: false },
      refetch: () => undefined,
    });
    render(<RequiredInputControl {...defaultProps(input)} />);
    expect(screen.getByTestId("builder-ai-required-input-loading")).toBeInTheDocument();
  });

  it("renders a disconnected state when the integration is not connected", () => {
    mockUseOptionsSource.mockReturnValue({
      state: { status: "disconnected", items: [], hasMore: false, provider: "slack", message: "x" },
      refetch: () => undefined,
    });
    render(<RequiredInputControl {...defaultProps(input)} />);
    expect(screen.getByTestId("builder-ai-required-input-disconnected")).toBeInTheDocument();
  });

  it("renders an error state surface when the resolver fails", () => {
    mockUseOptionsSource.mockReturnValue({
      state: {
        status: "error",
        items: [],
        hasMore: false,
        code: "PROVIDER_ERROR",
        message: "Couldn’t load Slack channels. Try again.",
      },
      refetch: () => undefined,
    });
    render(<RequiredInputControl {...defaultProps(input)} />);
    expect(screen.getByTestId("builder-ai-required-input-error")).toBeInTheDocument();
  });

  it("renders an empty state when the resolver returned no items", () => {
    mockUseOptionsSource.mockReturnValue({
      state: { status: "empty", items: [], hasMore: false },
      refetch: () => undefined,
    });
    render(<RequiredInputControl {...defaultProps(input)} />);
    expect(screen.getByTestId("builder-ai-required-input-empty")).toBeInTheDocument();
  });

  it("offers a 'Use … as-is' button when allowFreeText and the user has typed a query the option list doesn't cover", async () => {
    mockUseOptionsSource.mockReturnValue({
      state: {
        status: "ready",
        items: [{ value: "C123", label: "#general" }],
        hasMore: false,
      },
      refetch: () => undefined,
    });
    const onChange = jest.fn();
    render(<RequiredInputControl {...defaultProps(input)} onChange={onChange} />);
    const queryInput = screen.getByTestId(
      "builder-ai-required-input-combobox-query",
    ) as HTMLInputElement;
    fireEvent.change(queryInput, { target: { value: "#custom" } });
    const commitButton = await screen.findByTestId("builder-ai-required-input-commit-typed");
    await userEvent.setup().click(commitButton);
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0]![0] as RequiredInputAnswer;
    expect(arg.display).toBe("#custom");
    expect(arg.value).toBeUndefined();
  });

  it("disables the combobox + surfaces a deps-missing hint when a dependsOn parent isn't staged yet", () => {
    const inputWithDep: AiRequiredUserInput = {
      ...input,
      optionsSource: "discord:channels",
      dependsOn: ["guildId"],
    };
    render(<RequiredInputControl {...defaultProps(inputWithDep)} />);
    const queryInput = screen.getByTestId(
      "builder-ai-required-input-combobox-query",
    ) as HTMLInputElement;
    expect(queryInput).toBeDisabled();
    expect(screen.getByTestId("builder-ai-required-input-deps-missing")).toBeInTheDocument();
    // The hook is invoked with `enabled: false` so no fetch fires.
    const lastCall = mockUseOptionsSource.mock.calls.at(-1);
    expect(lastCall?.[0]?.enabled).toBe(false);
  });

  it("reads dependsOn parents from the stagedAnswers map and passes them to the hook as deps", () => {
    const inputWithDep: AiRequiredUserInput = {
      ...input,
      optionsSource: "discord:channels",
      dependsOn: ["guildId"],
    };
    const stagedAnswers = new Map<string, RequiredInputAnswer>();
    const guildAnswerDescriptor: AiRequiredUserInput = {
      label: "Guild",
      nodeId: "n_slack",
      field: "guildId",
      kind: "config_value",
    };
    stagedAnswers.set("n_slack::guildId", {
      key: "n_slack::guildId",
      value: "G987",
      display: "My guild",
      descriptor: guildAnswerDescriptor,
    });
    render(
      <RequiredInputControl
        {...defaultProps(inputWithDep)}
        stagedAnswers={stagedAnswers}
      />,
    );
    const lastCall = mockUseOptionsSource.mock.calls.at(-1);
    expect(lastCall?.[0]?.deps).toEqual({ guildId: "G987" });
    expect(lastCall?.[0]?.enabled).toBe(true);
  });
});

describe("RequiredInputControl — free-text fallback (Branch 3)", () => {
  const input: AiRequiredUserInput = {
    label: "What should the message say?",
    nodeId: "n_slack",
    field: "text",
    kind: "config_value",
    fieldLabel: "Message",
    fieldType: "textarea",
    allowFreeText: true,
  };

  it("renders a text input when no options + no optionsSource are present", () => {
    render(<RequiredInputControl {...defaultProps(input)} />);
    const control = screen.getByTestId("builder-ai-required-input-control");
    expect(control.getAttribute("data-variant")).toBe("text");
    expect(screen.getByTestId("builder-ai-required-input-text")).toBeInTheDocument();
  });

  it("calls onChange with the typed value when the user enters text", () => {
    // Use fireEvent.change for the controlled-input contract: the
    // component reads `answer?.display ?? ""`. The real panel owns
    // `stagedAnswers` and re-renders with the new answer on each
    // keystroke; this test exercises the contract one event at a time.
    const onChange = jest.fn();
    render(<RequiredInputControl {...defaultProps(input)} onChange={onChange} />);
    const textInput = screen.getByTestId("builder-ai-required-input-text");
    fireEvent.change(textInput, { target: { value: "Hello" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0]![0] as RequiredInputAnswer;
    expect(arg.display).toBe("Hello");
    expect(arg.value).toBeUndefined();
    expect(arg.descriptor).toBe(input);
  });

  it("calls onChange(undefined) when the user clears the text input", () => {
    const onChange = jest.fn();
    render(
      <RequiredInputControl
        {...defaultProps(input)}
        answer={{ key: "n_slack::text", display: "Hello", descriptor: input }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId("builder-ai-required-input-text"), {
      target: { value: "" },
    });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("never fires the optionsSource hook on the free-text branch", () => {
    render(<RequiredInputControl {...defaultProps(input)} />);
    expect(mockUseOptionsSource).not.toHaveBeenCalled();
  });
});

describe("RequiredInputControl — backward compat (pre-AI-22 entry)", () => {
  it("falls through to the free-text branch when no enrichment fields are present", () => {
    const bareInput: AiRequiredUserInput = {
      label: "Which value?",
      kind: "config_value",
    };
    render(<RequiredInputControl {...defaultProps(bareInput)} />);
    const control = screen.getByTestId("builder-ai-required-input-control");
    expect(control.getAttribute("data-variant")).toBe("text");
  });
});

describe("requiredInputKey — stable identifier", () => {
  it("uses `nodeId::field` when both are present", () => {
    expect(
      requiredInputKey({
        label: "x",
        nodeId: "n1",
        field: "channel",
        kind: "config_value",
      }),
    ).toBe("n1::channel");
  });

  it("falls back to `label::<label>` when nodeId or field is missing", () => {
    expect(
      requiredInputKey({ label: "Connect Stripe", kind: "select_integration" }),
    ).toBe("label::Connect Stripe");
  });
});
