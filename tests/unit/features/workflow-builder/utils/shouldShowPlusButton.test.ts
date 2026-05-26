/**
 * Tests for features/workflow-builder/utils/shouldShowPlusButton.
 *
 * Pure visibility policy for the edge insert plus-button. The helper
 * intentionally takes no slice context — these branches are the entire
 * contract.
 */
import { shouldShowPlusButton } from "@/features/workflow-builder/utils/shouldShowPlusButton";

describe("shouldShowPlusButton", () => {
  it("returns true when all signals are absent (defaults to visible)", () => {
    expect(shouldShowPlusButton({})).toBe(true);
  });

  it("returns true when endpoints are resolved and no blocker is set", () => {
    expect(
      shouldShowPlusButton({
        isDragging: false,
        isSaving: false,
        hasResolvedEndpoints: true,
      }),
    ).toBe(true);
  });

  it("returns false while the edge is being dragged", () => {
    expect(shouldShowPlusButton({ isDragging: true })).toBe(false);
  });

  it("returns false while a save is in flight", () => {
    expect(shouldShowPlusButton({ isSaving: true })).toBe(false);
  });

  it("returns false when endpoints are not resolved yet (transient connect shape)", () => {
    expect(shouldShowPlusButton({ hasResolvedEndpoints: false })).toBe(false);
  });

  it("any single blocker wins over default-true", () => {
    expect(
      shouldShowPlusButton({
        isDragging: true,
        isSaving: false,
        hasResolvedEndpoints: true,
      }),
    ).toBe(false);
    expect(
      shouldShowPlusButton({
        isDragging: false,
        isSaving: true,
        hasResolvedEndpoints: true,
      }),
    ).toBe(false);
    expect(
      shouldShowPlusButton({
        isDragging: false,
        isSaving: false,
        hasResolvedEndpoints: false,
      }),
    ).toBe(false);
  });
});
