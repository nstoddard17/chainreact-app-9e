/**
 * Small presentational glyphs for the conversational guidance rail. Extracted from
 * WorkflowGuidancePanel to keep that container under the file-size budget; pure SVG, no logic.
 */

/** Small sparkle glyph for the "Check workflow" suggested-action pill. Inherits currentColor. */
export function SparkleIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
    </svg>
  );
}
