"use client";

import type { CollaborationTrack } from "@/contracts/collaborationOnboarding";
import { ObIcons } from "../onboardingIcons";

/**
 * Collaboration completion celebration (5.ONBOARD-4).
 *
 * Shown ONCE, and only for a completion the user actually just reached: a
 * silently-latched historical completion has `celebrationPending=false` from the
 * moment it is written, so this card never renders for setup that was already
 * done before the checklist shipped.
 *
 * Copy is per-track and carries no account facts — no member names, no counts, no
 * invitation addresses.
 */
const DONE_COPY: Record<CollaborationTrack, { title: string; body: string }> = {
  team_owner: {
    title: "Your team is set up",
    body: "Your account has teammates, a shared app, and a workflow to build on.",
  },
  team_admin: {
    title: "You're all set",
    body: "You've got what you need to help run this account.",
  },
  team_member: {
    title: "You're up and running",
    body: "You've found your way around your team's workspace.",
  },
};

export function CollaborationSuccessCard({
  track,
  onDone,
}: {
  track: CollaborationTrack;
  onDone: () => void;
}) {
  const copy = DONE_COPY[track];
  return (
    <section
      role="region"
      aria-label="Team setup complete"
      data-testid="collab-success-card"
      data-track={track}
      className="ob-animate-card-in flex w-full max-w-sm flex-col overflow-hidden rounded-[18px] bg-gradient-to-b from-accent/70 to-card p-[18px] shadow-[inset_0_0_0_1px_hsl(var(--border))]"
    >
      <span className="ob-animate-check-pop grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
        <ObIcons.Check size={18} />
      </span>
      <h2 className="mt-3 text-[15px] font-bold tracking-[-0.01em] text-foreground">
        {copy.title}
      </h2>
      <p className="mt-1 text-[12.5px] leading-normal text-muted-foreground">
        {copy.body}
      </p>
      <div className="mt-3.5 flex">
        <button
          type="button"
          onClick={onDone}
          data-testid="collab-success-done"
          className="rounded-[9px] bg-primary px-[13px] py-2 text-[13px] font-semibold text-primary-foreground transition hover:brightness-110 active:translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Got it
        </button>
      </div>
    </section>
  );
}
