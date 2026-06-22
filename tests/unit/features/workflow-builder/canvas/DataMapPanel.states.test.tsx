/**
 * UI-state tests for features/workflow-builder/canvas/DataMapPanel —
 * Slice 4.BUILDER-DATA-MAP-2.
 *
 * Complements DataMapPanel.test.tsx (real-hook integration) by mocking
 * `useWorkflowDataMap` so each presentational state is exercised
 * deterministically: type badges, sanitized sample value + banner, no-sample
 * banner, sensitive masking, fileRef-as-leaf (no value), truncation note,
 * copy-exact-token + copied feedback, and read-only posture.
 */
import type { UseWorkflowDataMapResult } from "@/features/workflow-builder/hooks/useWorkflowDataMap";

let mockResult: UseWorkflowDataMapResult;
jest.mock("@/features/workflow-builder/hooks/useWorkflowDataMap", () => ({
  useWorkflowDataMap: () => mockResult,
}));

import { render, screen, fireEvent } from "@testing-library/react";
import { DataMapPanel } from "@/features/workflow-builder/canvas/DataMapPanel";
import type {
  DataMapNode,
  DataMapOutput,
} from "@/features/workflow-builder/hooks/useWorkflowDataMap";

function output(over: Partial<DataMapOutput> = {}): DataMapOutput {
  return {
    path: "channel",
    type: "string",
    sensitive: false,
    copyToken: "{{slack_1.channel}}",
    sample: null,
    ...over,
  };
}

function node(over: Partial<DataMapNode> = {}): DataMapNode {
  return {
    nodeId: "slack_1",
    kind: "action",
    displayName: "Send Channel Message",
    provider: "slack",
    providerLabel: "Slack",
    typeLabel: "Send Channel Message",
    category: "messaging",
    metaResolved: true,
    loadingMeta: false,
    configuredFieldLabels: [],
    usesVariables: [],
    expectedOutputs: [output()],
    outputsKnown: true,
    sourceId: "slack_1",
    outputsTruncated: false,
    ...over,
  };
}

function result(
  over: Partial<UseWorkflowDataMapResult> = {},
): UseWorkflowDataMapResult {
  return {
    nodes: [node()],
    loading: false,
    hasActions: true,
    isEmpty: false,
    sampleAvailable: false,
    ...over,
  };
}

const writeText = jest.fn();

beforeEach(() => {
  mockResult = result();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  writeText.mockReset();
});

describe("DataMapPanel states — produced fields", () => {
  it("renders a type badge per produced field", () => {
    mockResult = result({
      nodes: [
        node({
          expectedOutputs: [
            output({ path: "message.text", type: "string", copyToken: "{{slack_1.message.text}}" }),
          ],
        }),
      ],
    });
    render(<DataMapPanel />);
    expect(screen.getByText("message.text")).toBeInTheDocument();
    expect(screen.getByTestId("data-map-type-badge")).toHaveTextContent("string");
  });

  it("renders a sanitized scalar sample value + 'sample from latest test run' banner", () => {
    mockResult = result({
      sampleAvailable: true,
      nodes: [node({ expectedOutputs: [output({ sample: '"Hey"' })] })],
    });
    render(<DataMapPanel />);
    expect(screen.getByTestId("data-map-sample-value")).toHaveTextContent('Example: "Hey"');
    expect(screen.getByTestId("data-map-sample-banner")).toHaveTextContent(
      /sample from latest test run/i,
    );
  });

  it("shows the no-sample prompt when no samples are available", () => {
    render(<DataMapPanel />);
    const banner = screen.getByTestId("data-map-sample-banner");
    expect(banner).toHaveAttribute("data-sample-available", "false");
    expect(banner).toHaveTextContent(/run a test to capture real sample values/i);
  });

  it("labels sensitive fields and never renders a value for them", () => {
    mockResult = result({
      sampleAvailable: true,
      nodes: [
        node({
          expectedOutputs: [
            output({ path: "secrets", type: "object", sensitive: true, sample: null }),
          ],
        }),
      ],
    });
    render(<DataMapPanel />);
    expect(screen.getByTestId("data-map-sensitive-badge")).toBeInTheDocument();
    expect(screen.queryByTestId("data-map-sample-value")).not.toBeInTheDocument();
  });

  it("renders fileRef outputs as a leaf type with no inline value (never bytes/content)", () => {
    mockResult = result({
      nodes: [
        node({
          expectedOutputs: [
            output({ path: "attachment", type: "fileRef", sample: null, copyToken: "{{slack_1.attachment}}" }),
          ],
        }),
      ],
    });
    render(<DataMapPanel />);
    expect(screen.getByTestId("data-map-type-badge")).toHaveTextContent("fileRef");
    expect(screen.queryByTestId("data-map-sample-value")).not.toBeInTheDocument();
  });

  it("shows the truncation note when fields were capped", () => {
    mockResult = result({ nodes: [node({ outputsTruncated: true })] });
    render(<DataMapPanel />);
    expect(screen.getByTestId("data-map-truncated-note")).toBeInTheDocument();
  });
});

describe("DataMapPanel states — copy", () => {
  it("copies the exact variable token to the clipboard", () => {
    mockResult = result({
      nodes: [node({ expectedOutputs: [output({ copyToken: "{{slack_1.message.text}}" })] })],
    });
    render(<DataMapPanel />);
    fireEvent.click(screen.getByTestId("data-map-copy-token"));
    expect(writeText).toHaveBeenCalledWith("{{slack_1.message.text}}");
  });

  it("shows copied feedback after clicking copy", () => {
    render(<DataMapPanel />);
    expect(screen.queryByTestId("data-map-copied")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("data-map-copy-token"));
    expect(screen.getByTestId("data-map-copied")).toBeInTheDocument();
  });
});

describe("DataMapPanel states — safety + read-only", () => {
  it("never renders raw token material; sensitive fields show no value, benign fields show the sanitized sample", () => {
    mockResult = result({
      sampleAvailable: true,
      nodes: [
        node({
          expectedOutputs: [
            output({ path: "accessToken", type: "string", sensitive: true, sample: null }),
            output({ path: "channel", type: "string", sample: '"#general"' }),
          ],
        }),
      ],
    });
    const { container } = render(<DataMapPanel />);
    expect(container.textContent).not.toContain("xoxb-");
    expect(container.textContent).not.toContain("Bearer ");
    expect(screen.getByText("accessToken")).toBeInTheDocument();
    expect(screen.getByTestId("data-map-sample-value")).toHaveTextContent('Example: "#general"');
  });

  it("is read-only: exposes no run / save / activate / publish controls", () => {
    render(<DataMapPanel />);
    expect(
      screen.queryByRole("button", { name: /run|save|activate|publish|delete|test/i }),
    ).toBeNull();
  });
});
