/**
 * Locked (plan-gated) library entries in the action picker (BRANCH-ENT-1 C6).
 *
 * Business rule protected: on a Free plan the advanced-branching nodes stay
 * VISIBLE and searchable in the node library with a "Pro" badge, and every
 * interaction shows an explicit upgrade explanation + CTA instead of adding
 * the node — never a silent no-op, never a hidden or broken-looking entry.
 * Paid accounts keep the normal pick behavior.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionPicker } from "@/features/workflow-builder/panels/ActionPicker";
import { ifThenConditionMeta } from "@/integrations/native/actions/ifThenCondition.meta";
import { routerMeta } from "@/integrations/native/actions/router.meta";
import type { ActionMeta } from "@/contracts/actionMeta";

const delayMeta: ActionMeta = {
  key: "native:delay",
  provider: "native",
  type: "delay",
  displayName: "Delay",
  description: "Wait before the next step.",
  category: "logic",
  requiresIntegration: false,
  fields: [],
  outputs: [],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 1,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};

const LOCKED = new Set(["native:if_then_condition", "native:router"]);

function renderPicker(overrides: Partial<Parameters<typeof ActionPicker>[0]> = {}) {
  const onPickAction = jest.fn();
  render(
    <ActionPicker
      nativeActions={[ifThenConditionMeta, routerMeta, delayMeta]}
      nativeLoading={false}
      nativeError={null}
      actionProviders={[]}
      onPickAction={onPickAction}
      lockedActionKeys={LOCKED}
      {...overrides}
    />,
  );
  return { onPickAction };
}

describe("ActionPicker — locked advanced-branching entries (Free plan)", () => {
  it("locked entries stay visible with a Pro badge and their real description", () => {
    renderPicker();
    expect(screen.getByText("If/Then Condition")).toBeInTheDocument();
    expect(screen.getByText("Router")).toBeInTheDocument();
    expect(screen.getAllByTestId("picker-row-plan-badge")).toHaveLength(2);
    // The unlocked native action has no badge.
    const delayRow = screen.getByRole("button", { name: /Delay/ });
    expect(delayRow.querySelector('[data-testid="picker-row-plan-badge"]')).toBeNull();
  });

  it("clicking a locked entry shows the upgrade explanation + CTA and does NOT add the node", async () => {
    const user = userEvent.setup();
    const { onPickAction } = renderPicker();
    await user.click(screen.getByRole("button", { name: /If\/Then Condition/ }));
    expect(onPickAction).not.toHaveBeenCalled();
    const callout = screen.getByTestId("branching-upgrade-callout");
    expect(callout.textContent).toMatch(/Route your workflow down different paths/);
    expect(callout.textContent).toMatch(/Pro plan and higher/);
    const cta = screen.getByRole("link", { name: "Upgrade to Pro" });
    expect(cta).toHaveAttribute("href", "/account");
  });

  it("keyboard activation (Enter on the focused row) cannot bypass the lock", async () => {
    const user = userEvent.setup();
    const { onPickAction } = renderPicker();
    const row = screen.getByRole("button", { name: /Router/ });
    row.focus();
    await user.keyboard("{Enter}");
    expect(onPickAction).not.toHaveBeenCalled();
    expect(screen.getByTestId("branching-upgrade-callout")).toBeInTheDocument();
  });

  it("search still finds the locked entry, and picking from search results is blocked too", async () => {
    const user = userEvent.setup();
    const { onPickAction } = renderPicker({ searchQuery: "If/Then" });
    const row = screen.getByRole("button", { name: /If\/Then Condition/ });
    await user.click(row);
    expect(onPickAction).not.toHaveBeenCalled();
  });

  it("unlocked native actions pick normally while branching is locked", async () => {
    const user = userEvent.setup();
    const { onPickAction } = renderPicker();
    await user.click(screen.getByRole("button", { name: /Delay/ }));
    expect(onPickAction).toHaveBeenCalledWith(delayMeta);
  });

  it("paid account (no locked keys): branching entries pick normally with no badge or callout", async () => {
    const user = userEvent.setup();
    const onPickAction = jest.fn();
    render(
      <ActionPicker
        nativeActions={[ifThenConditionMeta, routerMeta, delayMeta]}
        nativeLoading={false}
        nativeError={null}
        actionProviders={[]}
        onPickAction={onPickAction}
      />,
    );
    expect(screen.queryByTestId("picker-row-plan-badge")).toBeNull();
    await user.click(screen.getByRole("button", { name: /If\/Then Condition/ }));
    expect(onPickAction).toHaveBeenCalledWith(ifThenConditionMeta);
    expect(screen.queryByTestId("branching-upgrade-callout")).toBeNull();
  });
});
