/**
 * Static ChainReact "Spark Link" mark — the rounded-square outline emitting a
 * detached spark dot. This is the SAME symbol drawn by the homepage / app-shell
 * logo ({@link "@/features/marketing/MarketingBrandLogo"}), minus the GSAP
 * animation, so it's safe to render many times (e.g. one per builder node card).
 *
 * Recolors via the `--logo-brand` CSS var (sky-blue `#0284c7` on light /
 * `#38bdf8` on dark, set in `app/globals.css`), so it reads correctly in both
 * themes. Keep the geometry in sync with `MarketingBrandLogo`'s inline SVG.
 *
 * Decorative by default (`aria-hidden`); pass a `title` only where it needs a
 * standalone accessible name.
 */
export function ChainReactMark({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      style={{ overflow: "visible" }}
    >
      <rect
        x="8"
        y="19"
        width="37"
        height="37"
        rx="13"
        stroke="var(--logo-brand, #0284c7)"
        strokeWidth="7.5"
      />
      <circle cx="51.5" cy="12.5" r="6.5" fill="var(--logo-brand, #0284c7)" />
    </svg>
  );
}
