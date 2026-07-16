/**
 * CONFIG-UX-NODE-SUMMARY-1 — the config panel's at-a-glance overview.
 *
 * User behavior: a configured node explains itself in plain language with
 * RECOGNIZABLE resource names; fixed / per-run / behavior values are visually
 * separated; an id whose name isn't known yet is shown honestly rather than
 * faked.
 */
import * as React from "react";
import { render, screen, within } from "@testing-library/react";
import { NodeConfigOverview } from "@/features/workflow-builder/config-modal/NodeConfigOverview";
import { useResourceLabelCache } from "@/features/workflow-builder/state/resourceLabelCache";
import type { FieldMeta } from "@/contracts/actionMeta";

const fields: FieldMeta[] = [
  {
    name: "channel",
    label: "Channel",
    type: "combobox",
    required: true,
    optionsSource: "slack:channels",
    allowManualEntry: true,
  },
  { name: "message", label: "Message", type: "textarea", required: true },
  {
    name: "importance",
    label: "Importance",
    type: "select",
    required: false,
    options: [
      { value: "low", label: "Low" },
      { value: "high", label: "High" },
    ],
  },
] as FieldMeta[];

beforeEach(() => {
  useResourceLabelCache.getState().reset();
});

describe("NodeConfigOverview", () => {
  it("renders nothing for an unconfigured node (readiness banner owns that story)", () => {
    render(
      <NodeConfigOverview displayName="Send Channel Message" fields={fields} values={{}} />,
    );
    expect(screen.queryByTestId("node-config-overview")).not.toBeInTheDocument();
  });

  it("shows the recognizable channel NAME in the headline once the cache knows it", () => {
    useResourceLabelCache.getState().setLabel("slack:channels", "C123", "#support-alerts");
    render(
      <NodeConfigOverview
        displayName="Send Channel Message"
        fields={fields}
        values={{ channel: "C123", message: "Deploy finished" }}
      />,
    );
    expect(screen.getByTestId("node-config-overview-headline")).toHaveTextContent(
      "Send Channel Message · #support-alerts",
    );
  });

  it("separates per-run (dynamic) values from fixed values and behavior choices", () => {
    useResourceLabelCache.getState().setLabel("slack:channels", "C123", "#support-alerts");
    render(
      <NodeConfigOverview
        displayName="Send Channel Message"
        fields={fields}
        values={{ channel: "C123", message: "{{trigger.subject}}", importance: "high" }}
      />,
    );
    const rows = screen.getAllByTestId("node-config-overview-row");
    const byKind = (kind: string) =>
      rows.filter((r) => r.getAttribute("data-kind") === kind);
    expect(byKind("resource")[0]).toHaveTextContent("Channel: #support-alerts");
    expect(byKind("dynamic")[0]).toHaveTextContent("Message: from the trigger");
    expect(byKind("condition")[0]).toHaveTextContent("Importance: High");
    // The per-run group is explicitly labeled so a reviewer can see what varies.
    expect(screen.getByText(/changes each run/i)).toBeInTheDocument();
  });

  it("shows the saved id honestly (marked) when its name isn't known yet — never invents one", () => {
    render(
      <NodeConfigOverview
        displayName="Send Channel Message"
        fields={fields}
        values={{ channel: "C_UNKNOWN", message: "hi" }}
      />,
    );
    const resourceRow = screen
      .getAllByTestId("node-config-overview-row")
      .find((r) => r.getAttribute("data-kind") === "resource")!;
    expect(resourceRow).toHaveTextContent("C_UNKNOWN");
    expect(
      within(resourceRow).getByTestId("node-config-overview-unresolved"),
    ).toBeInTheDocument();
  });

  it("re-renders with the friendly name as soon as a picker populates the cache", () => {
    const { rerender } = render(
      <NodeConfigOverview
        displayName="Send Channel Message"
        fields={fields}
        values={{ channel: "C123", message: "hi" }}
      />,
    );
    expect(screen.getByTestId("node-config-overview-headline")).toHaveTextContent("C123");
    // A picker loads its page → cache fills → summary upgrades to the name.
    useResourceLabelCache
      .getState()
      .setLabels("slack:channels", [{ value: "C123", label: "#support-alerts" }]);
    rerender(
      <NodeConfigOverview
        displayName="Send Channel Message"
        fields={fields}
        values={{ channel: "C123", message: "hi" }}
      />,
    );
    expect(screen.getByTestId("node-config-overview-headline")).toHaveTextContent(
      "#support-alerts",
    );
  });
});

describe("resourceLabelCache", () => {
  it("is display-only: keyed per source so ids can't collide across providers", () => {
    const s = useResourceLabelCache.getState();
    s.setLabel("slack:channels", "X1", "#general");
    s.setLabel("notion:pages", "X1", "Roadmap");
    expect(useResourceLabelCache.getState().getLabel("slack:channels", "X1")).toBe("#general");
    expect(useResourceLabelCache.getState().getLabel("notion:pages", "X1")).toBe("Roadmap");
  });

  it("ignores empty writes and returns undefined on a miss (callers fall back honestly)", () => {
    const s = useResourceLabelCache.getState();
    s.setLabel("slack:channels", "", "nope");
    s.setLabel("slack:channels", "C1", "");
    expect(useResourceLabelCache.getState().getLabel("slack:channels", "C1")).toBeUndefined();
  });
});
