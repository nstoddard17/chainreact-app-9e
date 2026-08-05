/** @jest-environment node */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * RESTORED-EDIT-PROPOSAL-STALE-MISMATCH-1 — the WIRING guard.
 *
 * The defect was never in `reconcilePersistedPreview` itself: that function compared its two
 * inputs correctly. It was in the call site. `WorkflowBuilder` passed `graphSlice.hydratedRevision`
 * — the workflow's `updatedAt` TIMESTAMP — as the value to compare against a proposal's
 * `baseGraphVersion`, which is a `computeEditableGraphVersion` CONTENT FINGERPRINT. The two values
 * are from different spaces and can never be equal, so every restored edit proposal was badged
 * Stale with Apply withdrawn.
 *
 * Unit tests could not catch it: both the pure-function suite and the restored-transcript harness
 * supplied their own matching fixtures, so each agreed with itself while production did not. This
 * static guard pins the one thing those tests structurally cannot see — which value the real
 * builder actually hands to the reconciliation.
 */
const BUILDER = resolve(process.cwd(), "features/workflow-builder/WorkflowBuilder.tsx");
const source = readFileSync(BUILDER, "utf8");

/** The `reconcilePersistedPreview({ ... })` argument object as written in the builder. */
function reconcileCallArgs(): string {
  const start = source.indexOf("reconcilePersistedPreview({");
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("});", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("WorkflowBuilder → reconcilePersistedPreview wiring", () => {
  it("passes a canonical graph FINGERPRINT as the current version", () => {
    expect(reconcileCallArgs()).toMatch(/currentGraphVersion/);
    expect(source).toContain("computeEditableGraphVersion");
  });

  it("does NOT pass the hydrated revision timestamp into the reconciliation", () => {
    const args = reconcileCallArgs();
    expect(args).not.toMatch(/hydratedRevision/);
    // `savedGraphVersion` is the timestamp binding; it must not be handed to the comparison.
    expect(args).not.toMatch(/savedGraphVersion/);
  });

  it("derives the current version from the same function that stamps the proposal's base", () => {
    // One canonical implementation on both sides — no second client-side hashing scheme.
    expect(source).toMatch(
      /currentGraphVersion\s*=\s*useMemo\(\s*\(\)\s*=>\s*computeEditableGraphVersion\(/,
    );
  });

  it("keeps hydratedRevision available for its OWN concept (saved-revision tracking)", () => {
    // The timestamp is not wrong — it is the right token for "did the saved workflow move".
    // This guard is about not conflating the two, not about deleting one.
    expect(source).toMatch(/savedGraphVersion\s*=\s*useGraphSlice\(\(s\)\s*=>\s*s\.hydratedRevision\)/);
  });
});
