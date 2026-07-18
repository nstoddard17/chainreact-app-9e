/**
 * Circular progress ring for the minimized checklist pill (5.ONBOARD-1
 * Batch 2) — ported from the design's `Ring` (src/onboarding-app.jsx):
 * 22px, 2.5 stroke, rotated -90° so progress sweeps from 12 o'clock.
 */
export function OnboardingProgressRing({
  fraction,
  size = 22,
}: {
  fraction: number;
  size?: number;
}) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, fraction));
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className="flex-none"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={2.5}
        className="stroke-border"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="stroke-primary transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  );
}
