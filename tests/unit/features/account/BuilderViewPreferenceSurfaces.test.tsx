/**
 * BUILDER-VIEW-DEFAULT-1 — the two settings surfaces for the default view.
 *
 * Pins: the Profile section renders the preference row ONLY while the
 * Document Builder flag is on (flag off ⇒ byte-identical section), and the
 * builder's Settings tab does the same. The control itself is stubbed —
 * its load/save behavior is covered by DefaultBuilderViewControl.test.tsx.
 */
import { render, screen } from "@testing-library/react";

jest.mock("@/features/account/DefaultBuilderViewControl", () => ({
  DefaultBuilderViewControl: () => <div data-testid="mock-view-control" />,
}));

import { ProfileSection } from "@/features/account/ProfileSection";
import { SettingsPanel } from "@/features/workflow-builder/canvas/SettingsPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

describe("ProfileSection — default builder view row", () => {
  it("renders the row when the preference is enabled", () => {
    render(
      <ProfileSection
        email="m@example.com"
        role="owner"
        initialDisplayName={null}
        builderViewPreferenceEnabled
      />,
    );
    expect(screen.getByText("Default builder view")).toBeInTheDocument();
    expect(screen.getByTestId("mock-view-control")).toBeInTheDocument();
  });

  it("renders NO row when the flag is off (section unchanged)", () => {
    render(
      <ProfileSection email="m@example.com" role="owner" initialDisplayName={null} />,
    );
    expect(screen.queryByText("Default builder view")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mock-view-control")).not.toBeInTheDocument();
  });
});

describe("builder SettingsPanel — default builder view row", () => {
  beforeEach(() => {
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
  });

  it("renders the preference section when enabled", () => {
    render(<SettingsPanel builderViewPreferenceEnabled />);
    expect(screen.getByTestId("settings-builder-view-row")).toBeInTheDocument();
    expect(screen.getByTestId("mock-view-control")).toBeInTheDocument();
  });

  it("renders NO preference section when the flag is off", () => {
    render(<SettingsPanel />);
    expect(screen.queryByTestId("settings-builder-view-row")).not.toBeInTheDocument();
  });
});
