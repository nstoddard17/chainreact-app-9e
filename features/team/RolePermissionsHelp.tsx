"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ROLE_COPY, ROLE_SCOPE_NOTE } from "./roleCopy";

/**
 * Role-permissions explainer (Slice 4.TEAM-PAGE-3).
 *
 * Sits near the member table so a first-time user understands the role
 * selector. Always shows the key product truth (roles gate member management,
 * not workspace access); a "What can each role do?" toggle reveals the concise
 * per-role breakdown so the page stays uncluttered by default.
 *
 * Pure presentational — no backend, no per-resource ACLs (none exist). Copy is
 * sourced from `roleCopy.ts` so the invite helper + settings shell stay in sync.
 */
const ROLE_ORDER = ["owner", "admin", "member"] as const;

export function RolePermissionsHelp() {
  const [open, setOpen] = useState(false);

  return (
    <div
      data-testid="team-role-help"
      className="rounded-xl border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl text-xs text-muted-foreground">{ROLE_SCOPE_NOTE}</p>
        <button
          type="button"
          data-testid="team-role-help-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-xs font-medium text-primary hover:underline"
        >
          {open ? "Hide role details" : "What can each role do?"}
        </button>
      </div>

      {open && (
        <ul data-testid="team-role-help-detail" className="mt-3 flex flex-col gap-3">
          {ROLE_ORDER.map((role) => {
            const c = ROLE_COPY[role];
            return (
              <li
                key={role}
                className="rounded-lg border border-border bg-background/40 p-3"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {c.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{c.summary}</span>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <ul className="flex flex-col gap-0.5">
                    {c.can.map((item) => (
                      <li key={item} className="flex gap-1.5 text-xs text-foreground">
                        <span aria-hidden className="text-success">
                          ✓
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <ul className="flex flex-col gap-0.5">
                    {c.cannot.map((item) => (
                      <li
                        key={item}
                        className="flex gap-1.5 text-xs text-muted-foreground"
                      >
                        <span aria-hidden className="text-muted-foreground">
                          —
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
