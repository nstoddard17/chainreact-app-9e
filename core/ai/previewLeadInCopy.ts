/**
 * REACT-AGENT-PREVIEW-COPY-CLEANUP-1 — the fixed copy React speaks when it hands
 * back a pre-apply preview.
 *
 * The old wording ("Finish the choices in each step's setup below; field
 * mappings fill in as you pick resources") described a card that no longer
 * exists. REACT-AGENT-PREAPPLY-SETUP-UX-1 made the pre-apply card a SUMMARY:
 * there are no setup controls in it, and connecting and configuring both happen
 * AFTER Apply. Copy that points at controls below itself is now an instruction
 * the UI cannot carry out.
 *
 * Lives in `core/` because three separate paths produce the same moment — the
 * registry-first skeleton (route), the deterministic fallback plan, and the
 * timeout-recovered plan — and three hand-maintained copies of one sentence is
 * how they drifted apart in the first place.
 *
 * Constraints this copy has to satisfy at once:
 *   - never imply setup controls are in the pre-apply card,
 *   - say plainly that Connect and Configure come after Apply,
 *   - keep the "nothing saved or activated" reassurance,
 *   - stay short enough to read in a ~360px rail.
 *
 * Fixed strings only — no model text, no user values, no provider names.
 */

/**
 * The standard lead-in for a successful pre-apply preview. Used wherever React
 * produced a plan it is confident enough to show.
 */
export const PREVIEW_LEAD_IN =
  "Here's the workflow I sketched. Review the steps, then apply it to your draft. " +
  "After applying, I'll guide you through connecting the apps and completing setup. " +
  "Nothing has been saved or activated yet.";

/**
 * The same guidance, minus the opening sentence, for paths that must first say
 * something honest about HOW the sketch came about (e.g. the assistant timed
 * out). Keeping the tail shared is the point: the journey it describes is
 * identical no matter which path produced the plan.
 */
export const PREVIEW_LEAD_IN_TAIL =
  "Review the steps, then apply it to your draft. " +
  "After applying, I'll guide you through connecting the apps and completing setup. " +
  "Nothing has been saved or activated yet.";

/**
 * The plan SUMMARY carried on a deterministically-inferred skeleton. Shown on
 * the canvas preview card rather than in the transcript, so it stays a single
 * short sentence — but it must not describe the old flow either.
 */
export const INFERRED_PLAN_SUMMARY =
  "The workflow you described, sketched from the apps you named. Nothing has been filled in for you.";
