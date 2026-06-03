import type { MembershipRole } from "@/contracts/accounts";

/**
 * Role pill (Slice 4.TEAM-PAGE-4) — ports the design's `RoleBadge` tone
 * treatment to the real ChainReact role set. Owner is given a distinct
 * (violet) tone, Admin the brand accent, Member a muted neutral — so the
 * three roles read at a glance in the roster + roles table.
 *
 * Dark-surface tones (the Team page renders inside `data-app-surface="dark"`).
 */
const TONE: Record<MembershipRole, string> = {
  owner: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  admin: "border-primary/30 bg-primary/10 text-primary",
  member: "border-border bg-muted/40 text-muted-foreground",
};

export function RoleBadge({ role }: { role: MembershipRole }) {
  return (
    <span
      data-testid={`team-role-badge-${role}`}
      className={
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize " +
        TONE[role]
      }
    >
      {role}
    </span>
  );
}
