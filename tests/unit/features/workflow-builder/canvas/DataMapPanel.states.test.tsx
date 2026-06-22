/**
 * UI-state tests for features/workflow-builder/canvas/DataMapPanel —
 * Slice 4.BUILDER-DATA-MAP-3.
 *
 * Complements DataMapPanel.test.tsx (real-hook integration) by mocking
 * `useWorkflowDataMap`, so each presentational state is exercised
 * deterministically: friendly variable display (no raw UUID by default),
 * token-behind-toggle, clear Copy-variable button + copied feedback, type
 * badges, sanitized sample values + banners, sensitive masking, object-needs-test
 * hint, configured/missing field status, truncation, and read-only posture.
 */
import type { UseWorkflowDataMapResult } from "@/features/workflow-builder/hooks/useWorkflowDataMap";

let mockResult: UseWorkflowDataMapResult;
jest.mock("@/features/workflow-builder/hooks/useWorkflowDataMap", () => ({
  useWorkflowDataMap: () => mockResult,
}));

import { render, screen, fireEvent, within } from "@testing-library/react";
import { DataMapPanel } from "@/features/workflow-builder/canvas/DataMapPanel";
import type {
  DataMapConfiguredField,
  DataMapNode,
  DataMapOutput,
} from "@/features/workflow-builder/hooks/useWorkflowDataMap";

const UUID = "9f1c2a3b-4d5e-6789-abcd-ef0123456789";

function output(over: Partial<DataMapOutput> = {}): DataMapOutput {
  return {
    path: "channel",
    type: "string",
    sensitive: false,
    copyToken: `{{${UUID}.channel}}`,
    sample: null,
    objectNeedsTest: false,
    ...over,
  };
}

function node(over: Partial<DataMapNode> = {}): DataMapNode {
  return {
    nodeId: UUID,
    kind: "action",
    displayName: "Send Channel Message",
    provider: "slack",
    providerLabel: "Slack",
    typeLabel: "Send Channel Message",
    category: "messaging",
    metaResolved: true,
    loadingMeta: false,
    configuredFields: [],
    usesVariables: [],
    expectedOutputs: [output()],
    outputsKnown: true,
    sourceId: UUID,
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

describe("DataMapPanel states — friendly variable display", () => {
  it("shows a friendly step-scoped label, NOT the raw UUID, by default", () => {
    const { container } = render(<DataMapPanel />);
    const friendly = screen.getByTestId("data-map-var-friendly");
    expect(friendly).toHaveTextContent(/→ channel/);
    // The UUID-bearing token is not rendered until the user reveals it.
    expect(container.textContent).not.toContain(UUID);
    expect(screen.queryByTestId("data-map-var-token")).not.toBeInTheDocument();
  });

  it("reveals the real token (with node id) behind the 'Show token' toggle", () => {
    render(<DataMapPanel />);
    fireEvent.click(screen.getByTestId("data-map-token-toggle"));
    expect(screen.getByTestId("data-map-var-token")).toHaveTextContent(`{{${UUID}.channel}}`);
  });

  it("renders a type badge per produced field", () => {
    mockResult = result({
      nodes: [node({ expectedOutputs: [output({ path: "message.text", type: "string" })] })],
    });
    render(<DataMapPanel />);
    expect(screen.getByTestId("data-map-var-friendly")).toHaveTextContent(/→ message\.text/);
    expect(screen.getByTestId("data-map-type-badge")).toHaveTextContent("string");
  });
});

describe("DataMapPanel states — copy", () => {
  it("copies the exact real variable token (clear 'Copy variable' button)", () => {
    mockResult = result({
      nodes: [node({ expectedOutputs: [output({ copyToken: `{{${UUID}.message.text}}` })] })],
    });
    render(<DataMapPanel />);
    const copyBtn = screen.getByTestId("data-map-copy-token");
    expect(copyBtn).toHaveTextContent(/copy variable/i);
    fireEvent.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith(`{{${UUID}.message.text}}`);
  });

  it("shows copied feedback after clicking copy", () => {
    render(<DataMapPanel />);
    expect(screen.queryByTestId("data-map-copied")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("data-map-copy-token"));
    expect(screen.getByTestId("data-map-copied")).toBeInTheDocument();
  });
});

describe("DataMapPanel states — samples + objects", () => {
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
    expect(banner).toHaveTextContent(/run a test, then come back here/i);
  });

  it("shows a 'run a test' hint for an object output without child info", () => {
    mockResult = result({
      nodes: [
        node({
          expectedOutputs: [output({ path: "message", type: "object", objectNeedsTest: true })],
        }),
      ],
    });
    render(<DataMapPanel />);
    expect(screen.getByTestId("data-map-object-hint")).toHaveTextContent(
      /run a test to inspect fields/i,
    );
    expect(screen.queryByTestId("data-map-sample-value")).not.toBeInTheDocument();
  });

  it("labels sensitive fields and never renders a value for them", () => {
    mockResult = result({
      sampleAvailable: true,
      nodes: [
        node({ expectedOutputs: [output({ path: "secrets", type: "object", sensitive: true })] }),
      ],
    });
    render(<DataMapPanel />);
    expect(screen.getByTestId("data-map-sensitive-badge")).toBeInTheDocument();
    expect(screen.queryByTestId("data-map-sample-value")).not.toBeInTheDocument();
  });

  it("renders fileRef outputs as a leaf type with no inline value (never bytes/content)", () => {
    mockResult = result({
      nodes: [node({ expectedOutputs: [output({ path: "attachment", type: "fileRef" })] })],
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

describe("DataMapPanel states — configured fields", () => {
  function configured(over: Partial<DataMapConfiguredField> = {}): DataMapConfiguredField {
    return { label: "Channel", status: "configured", valuePreview: null, ...over };
  }

  it("shows a safe configured value preview and a Missing badge for required-empty fields", () => {
    mockResult = result({
      nodes: [
        node({
          configuredFields: [
            configured({ label: "Channel", status: "configured", valuePreview: "#general" }),
            configured({ label: "Message", status: "missing", valuePreview: null }),
          ],
        }),
      ],
    });
    render(<DataMapPanel />);
    expect(screen.getByText("#general")).toBeInTheDocument();
    const rows = screen.getAllByTestId("data-map-configured-field");
    const missing = rows.find((r) => r.getAttribute("data-status") === "missing")!;
    expect(within(missing).getByTestId("data-map-missing-badge")).toBeInTheDocument();
  });
});

describe("DataMapPanel states — safety + read-only", () => {
  it("never renders raw token material; sensitive fields show no value, benign fields show the sanitized sample", () => {
    mockResult = result({
      sampleAvailable: true,
      nodes: [
        node({
          expectedOutputs: [
            output({ path: "accessToken", type: "string", sensitive: true }),
            output({ path: "channel", type: "string", sample: '"#general"' }),
          ],
        }),
      ],
    });
    const { container } = render(<DataMapPanel />);
    expect(container.textContent).not.toContain("xoxb-");
    expect(container.textContent).not.toContain("Bearer ");
    expect(screen.getByTestId("data-map-sensitive-badge")).toBeInTheDocument();
    expect(screen.getByTestId("data-map-sample-value")).toHaveTextContent('Example: "#general"');
  });

  it("is read-only: exposes no run / save / activate / publish controls", () => {
    render(<DataMapPanel />);
    expect(
      screen.queryByRole("button", { name: /run |save|activate|publish|delete/i }),
    ).toBeNull();
  });
});
