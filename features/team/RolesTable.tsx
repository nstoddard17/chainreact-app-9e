import type { MembershipRole } from "@/contracts/accounts";
import { Panel } from "./Panel";
import { RoleBadge } from "./RoleBadge";
import { ROLE_SCOPE_NOTE } from "./roleCopy";

/**
 * Roles & access table (Slice 4.TEAM-PAGE-4) — ports the design's `RolesSection`
 * matrix, but with the REAL ChainReact roles (Owner / Admin / Member) and only
 * capabilities the backend actually enforces.
 *
 * Honesty rules baked in:
 *   - "Use workflows & apps" is ✓ for ALL roles — roles do NOT gate workspace
 *     access (the single most important truth; reinforced in the footer note).
 *   - Admin manages MEMBERS only (✓*) — not owners or other admins.
 *   - Owner-only controls (billing / delete / ownership transfer) aren't
 *     implemented yet, so they render as "Later", never as an active ✓.
 *
 * Pure presentational — no per-resource ACLs are introduced (none exist).
 */
type Cell = "yes" | "no" | "members" | "later";

interface Capability {
  key: string;
  label: string;
  cells: Record<MembershipRole, Cell>;
}

const CAPABILITIES: readonly Capability[] = [
  {
    key: "use",
    label: "Use workflows & apps",
    cells: { owner: "yes", admin: "yes", member: "yes" },
  },
  {
    key: "invite",
    label: "Invite people",
    cells: { owner: "yes", admin: "yes", member: "no" },
  },
  {
    key: "manage",
    label: "Manage members",
    cells: { owner: "yes", admin: "members", member: "no" },
  },
  {
    key: "roles",
    label: "Change member roles",
    cells: { owner: "yes", admin: "members", member: "no" },
  },
  {
    key: "owner",
    label: "Billing, delete & ownership",
    cells: { owner: "later", admin: "no", member: "no" },
  },
];

const ROLES: readonly MembershipRole[] = ["owner", "admin", "member"];

function CellMark({ cell }: { cell: Cell }) {
  if (cell === "later") {
    return (
      <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
        Later
      </span>
    );
  }
  if (cell === "no") {
    return (
      <span
        aria-label="No"
        className="flex h-6 w-6 items-center justify-center rounded-md bg-muted/40 text-muted-foreground"
      >
        —
      </span>
    );
  }
  // yes / members → check; "members" adds an asterisk explained in the footnote.
  return (
    <span
      aria-label={cell === "members" ? "Members only" : "Yes"}
      className="flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-md bg-success/15 px-1 text-success"
    >
      ✓{cell === "members" && <sup className="text-[10px]">*</sup>}
    </span>
  );
}

export function RolesTable() {
  return (
    <div data-testid="team-roles-table" className="flex flex-col gap-3">
      <Panel flush>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            {/* Header */}
            <div className="grid grid-cols-[1.4fr_repeat(3,1fr)] gap-3 border-b border-border bg-background/40 px-5 py-3 text-xs font-semibold text-muted-foreground">
              <span>Capability</span>
              {ROLES.map((r) => (
                <span key={r} className="flex justify-center">
                  <RoleBadge role={r} />
                </span>
              ))}
            </div>
            {/* Rows */}
            {CAPABILITIES.map((cap) => (
              <div
                key={cap.key}
                data-testid={`team-cap-${cap.key}`}
                className="grid grid-cols-[1.4fr_repeat(3,1fr)] items-center gap-3 border-b border-border px-5 py-3 last:border-b-0"
              >
                <span className="text-sm text-foreground">{cap.label}</span>
                {ROLES.map((r) => (
                  <span key={r} className="flex justify-center">
                    <CellMark cell={cap.cells[r]} />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">{ROLE_SCOPE_NOTE}</p>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">*</span> Admins act on
          Members only — they can&apos;t manage Owners or other Admins.
        </p>
        <p className="text-xs text-muted-foreground">
          Owner-only controls (billing, deleting the team, transferring ownership)
          are coming later.
        </p>
      </div>
    </div>
  );
}
