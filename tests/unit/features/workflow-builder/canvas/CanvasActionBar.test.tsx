/**
 * AGENT-CHANGE-HISTORY-1 — the builder top-tab bar includes a "History" tab.
 *
 * Business rules under test:
 *   - The tab bar renders History between Data Map and Settings.
 *   - Selecting it fires onSelectTab("history"); the active tab is marked selected.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CanvasActionBar } from "@/features/workflow-builder/canvas/CanvasActionBar";

describe("CanvasActionBar — History tab", () => {
  it("renders Builder | Runs | Data Map | History | Settings in order", () => {
    render(<CanvasActionBar nodeCountText="2 nodes" activeTab="builder" onSelectTab={jest.fn()} />);
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Builder", "Runs", "Data Map", "History", "Settings"]);
  });

  it("fires onSelectTab('history') when History is clicked", async () => {
    const user = userEvent.setup();
    const onSelectTab = jest.fn();
    render(<CanvasActionBar nodeCountText="2 nodes" activeTab="builder" onSelectTab={onSelectTab} />);
    await user.click(screen.getByRole("tab", { name: "History" }));
    expect(onSelectTab).toHaveBeenCalledWith("history");
  });

  it("marks the History tab selected when active", () => {
    render(<CanvasActionBar nodeCountText="2 nodes" activeTab="history" onSelectTab={jest.fn()} />);
    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
  });
});
