"use client";

import { createContext, useContext } from "react";

/**
 * Read-only Team-workflow context for the builder (Slice 4.TEAM-WORKFLOWS-6 /
 * TW-3b). Resolved server-side in the builder page and set once at mount; it
 * drives credential-ownership badges + the active-account mismatch banner.
 *
 * Deliberately display-only and id-free: it carries booleans + display-name
 * strings, NEVER raw `accountId` / `createdByUserId`, and NEVER a personal
 * credential label / email / provider-account id (the credential-sharing
 * policy's no-leak invariant). `creatorDisplayName` is a human display name
 * only (never an email) — null when unknown, and consumers fall back to a
 * generic "workflow owner".
 */
export interface BuilderTeamContextValue {
  /** True when the workflow's account is a team / organization (not personal). */
  readonly isTeamWorkflow: boolean;
  /** True when the current viewer created the workflow. */
  readonly isViewerCreator: boolean;
  /** Creator's display name (never an email). Null when unknown. */
  readonly creatorDisplayName: string | null;
  /** The workflow's account display name (for the mismatch banner). */
  readonly workflowAccountName: string | null;
  /** The currently-active account display name (for the mismatch banner). */
  readonly activeAccountName: string | null;
  /** True when the workflow's account differs from the active account. */
  readonly accountMismatch: boolean;
}

const BuilderTeamContext = createContext<BuilderTeamContextValue | null>(null);

export const BuilderTeamProvider = BuilderTeamContext.Provider;

/** Read the builder Team context, or `null` outside a provider / for non-team builds. */
export function useBuilderTeamContext(): BuilderTeamContextValue | null {
  return useContext(BuilderTeamContext);
}
