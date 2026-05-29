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

describe("RequiredInputControl — single-line text (text field)", () => {
  const input: AiRequiredUserInput = {
    label: "Recipient user id",
    nodeId: "n_slack",
    field: "userId",
    kind: "config_value",
    fieldLabel: "User id",
    fieldType: "text",
    allowFreeText: true,
  };

  it("renders a text input for a `text` field", () => {
    render(<RequiredInputControl {...defaultProps(input)} />);
    const control = screen.getByTestId("builder-ai-required-input-control");
    expect(control.getAttribute("data-variant")).toBe("text");
    expect(screen.getByTestId("builder-ai-required-input-text")).toBeInTheDocument();
  });

  it("calls onChange with the typed value when the user enters text", () => {
    const onChange = jest.fn();
    render(<RequiredInputControl {...defaultProps(input)} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("builder-ai-required-input-text"), {
      target: { value: "U123" },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0]![0] as RequiredInputAnswer;
    expect(arg.display).toBe("U123");
    expect(arg.value).toBeUndefined();
    expect(arg.descriptor).toBe(input);
  });

  it("calls onChange(undefined) when the user clears the text input", () => {
    const onChange = jest.fn();
    render(
      <RequiredInputControl
        {...defaultProps(input)}
        answer={{ key: "n_slack::userId", display: "U123", descriptor: input }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId("builder-ai-required-input-text"), {
      target: { value: "" },
    });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("never fires the optionsSource hook on the text branch", () => {
    render(<RequiredInputControl {...defaultProps(input)} />);
    expect(mockUseOptionsSource).not.toHaveBeenCalled();
  });
});

describe("RequiredInputControl — multi-line textarea (textarea field)", () => {
  const input: AiRequiredUserInput = {
    label: "What should the message say?",
    nodeId: "n_slack",
    field: "text",
    kind: "config_value",
    fieldLabel: "Message",
    fieldType: "textarea",
    allowFreeText: true,
  };

  it("renders a <textarea> for a `textarea` field", () => {
    render(<RequiredInputControl {...defaultProps(input)} />);
    const control = screen.getByTestId("builder-ai-required-input-control");
    expect(control.getAttribute("data-variant")).toBe("textarea");
    expect(screen.getByTestId("builder-ai-required-input-textarea").tagName).toBe("TEXTAREA");
  });

  it("calls onChange with the typed value", () => {
    const onChange = jest.fn();
    render(<RequiredInputControl {...defaultProps(input)} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("builder-ai-required-input-textarea"), {
      target: { value: "Hello there" },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0]![0] as RequiredInputAnswer;
    expect(arg.display).toBe("Hello there");
    expect(arg.value).toBeUndefined();
  });

  it("never fires the optionsSource hook on the textarea branch", () => {
    render(<RequiredInputControl {...defaultProps(input)} />);
    expect(mockUseOptionsSource).not.toHaveBeenCalled();
  });
});

describe("RequiredInputControl — boolean field", () => {
  const input: AiRequiredUserInput = {
    label: "Notify on completion?",
    nodeId: "n1",
    field: "notify",
    kind: "config_value",
    fieldLabel: "Notify",
    fieldType: "boolean",
  };

  it("renders a checkbox for a `boolean` field", () => {
    render(<RequiredInputControl {...defaultProps(input)} />);
    expect(
      screen.getByTestId("builder-ai-required-input-control").getAttribute("data-variant"),
    ).toBe("boolean");
    const box = screen.getByTestId("builder-ai-required-input-boolean") as HTMLInputElement;
    expect(box.type).toBe("checkbox");
    expect(box.checked).toBe(false);
  });

  it("calls onChange with value 'true'/'false' when toggled", () => {
    const onChange = jest.fn();
    render(<RequiredInputControl {...defaultProps(input)} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("builder-ai-required-input-boolean"));
    const arg = onChange.mock.calls[0]![0] as RequiredInputAnswer;
    expect(arg.value).toBe("true");
    expect(arg.display).toBe("true");
  });

  it("never fires the optionsSource hook on the boolean branch", () => {
    render(<RequiredInputControl {...defaultProps(input)} />);
    expect(mockUseOptionsSource).not.toHaveBeenCalled();
  });
});

describe("RequiredInputControl — number field", () => {
  const input: AiRequiredUserInput = {
    label: "How many?",
    nodeId: "n1",
    field: "count",
    kind: "config_value",
    fieldLabel: "Count",
    fieldType: "number",
  };

  it("renders a number input for a `number` field", () => {
    render(<RequiredInputControl {...defaultProps(input)} />);
    expect(
      screen.getByTestId("builder-ai-required-input-control").getAttribute("data-variant"),
    ).toBe("number");
    const box = screen.getByTestId("builder-ai-required-input-number") as HTMLInputElement;
    expect(box.type).toBe("number");
  });

  it("calls onChange with the typed numeric string as value", () => {
    const onChange = jest.fn();
    render(<RequiredInputControl {...defaultProps(input)} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("builder-ai-required-input-number"), {
      target: { value: "5" },
    });
    const arg = onChange.mock.calls[0]![0] as RequiredInputAnswer;
    expect(arg.value).toBe("5");
    expect(arg.display).toBe("5");
  });
});

describe("RequiredInputControl — multi-select (static options + multiple)", () => {
  const input: AiRequiredUserInput = {
    label: "Which events?",
    nodeId: "n1",
    field: "events",
    kind: "config_value",
    fieldLabel: "Events",
    fieldType: "select",
    multiple: true,
    options: [
      { label: "Created", value: "created" },
      { label: "Updated", value: "updated" },
      { label: "Deleted", value: "deleted" },
    ],
  };

  it("renders one checkbox per option", () => {
    render(<RequiredInputControl {...defaultProps(input)} />);
    expect(
      screen.getByTestId("builder-ai-required-input-control").getAttribute("data-variant"),
    ).toBe("multiselect");
    expect(screen.getAllByTestId("builder-ai-required-input-multiselect-option")).toHaveLength(3);
  });

  it("accumulates selected values + joins labels into display", () => {
    const onChange = jest.fn();
    render(<RequiredInputControl {...defaultProps(input)} onChange={onChange} />);
    const boxes = screen.getAllByTestId("builder-ai-required-input-multiselect-option");
    fireEvent.click(boxes[0]!); // created
    const first = onChange.mock.calls[0]![0] as RequiredInputAnswer;
    expect(first.values).toEqual(["created"]);
    expect(first.display).toBe("Created");
  });

  it("removing the last selection clears the answer", () => {
    const onChange = jest.fn();
    render(
      <RequiredInputControl
        {...defaultProps(input)}
        answer={{ key: "n1::events", values: ["created"], display: "Created", descriptor: input }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getAllByTestId("builder-ai-required-input-multiselect-option")[0]!);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("never fires the optionsSource hook on the multiselect branch", () => {
    render(<RequiredInputControl {...defaultProps(input)} />);
    expect(mockUseOptionsSource).not.toHaveBeenCalled();
  });
});

describe("RequiredInputControl — backward compat (bare config_value)", () => {
  it("renders a text control when no enrichment fields are present (null-patch regression)", () => {
    const bareInput: AiRequiredUserInput = {
      label: "What should the Slack DM say?",
      kind: "config_value",
    };
    render(<RequiredInputControl {...defaultProps(bareInput)} />);
    const control = screen.getByTestId("builder-ai-required-input-control");
    expect(control.getAttribute("data-variant")).toBe("text");
    expect(screen.getByTestId("builder-ai-required-input-text")).toBeInTheDocument();
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
