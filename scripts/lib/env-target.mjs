/**
 * SUPABASE-ENV-PIPELINE-1 — explicit environment-target contract.
 *
 * Extends the relative guard in ./db-target.mjs (app ref == db ref) with an
 * ABSOLUTE notion of which environment a database command is aimed at:
 *
 *   local        — the loopback Docker stack (supabase/config.toml). Always
 *                  safe to reset.
 *   development  — the hosted chainreact-dev project. Reset/seed allowed only
 *                  behind explicit, ref-confirmed guards.
 *   production   — the live project. Dev tooling REFUSES it entirely; only the
 *                  promote-production workflow (owner-approved) may target it,
 *                  and never through the dev commands in this module.
 *
 * Every resolver here FAILS CLOSED: a missing, ambiguous, or contradictory
 * target is an error, never a fallback. Only project REFS are ever surfaced —
 * never keys, passwords, or connection strings.
 */

import { KNOWN_FOREIGN_REFS, parseRefFromPgUrl, parseRefFromSupabaseUrl } from "./db-target.mjs";

/**
 * The live V2 production project. Refs are public identifiers (they appear in
 * every browser bundle), so pinning prod here — like KNOWN_FOREIGN_REFS — is
 * safe, and it makes the denylist independent of whatever .env file happens to
 * be lying around.
 */
export const PRODUCTION_PROJECT_REF = "qcepijemjlkssfkvzlio";

/** Refs that development-scoped commands must never touch, with the reason. */
export const PROTECTED_REFS = {
  [PRODUCTION_PROJECT_REF]: "LIVE PRODUCTION project (chainreact.app)",
  ...KNOWN_FOREIGN_REFS,
};

export const VALID_TARGETS = ["local", "development", "production"];

function fail(reason) {
  return { ok: false, target: null, ref: null, reason };
}

/** True when the URL's host is loopback. */
export function isLoopbackUrl(url) {
  try {
    const h = new URL(url).hostname;
    return h === "127.0.0.1" || h === "localhost" || h === "0.0.0.0" || h === "::1";
  } catch {
    return false;
  }
}

/**
 * Resolve and validate the target environment for a database command.
 *
 * @param {Record<string, string|undefined>} env - process-env-shaped record.
 * @param {{ expectedTarget: "local"|"development", requireConfirm?: boolean }} opts
 *   expectedTarget — the environment the CALLING SCRIPT is built for. The
 *     operator must independently set CHAINREACT_DB_TARGET to the same value;
 *     the two declaring the same intent is the core of the guard.
 *   requireConfirm — destructive dev commands additionally require
 *     DEV_RESET_CONFIRM to equal the dev project ref.
 * @returns {{ ok: boolean, target: string|null, ref: string|null, reason: string }}
 */
export function resolveDbTarget(env, { expectedTarget, requireConfirm = false }) {
  if (!VALID_TARGETS.includes(expectedTarget) || expectedTarget === "production") {
    // Production is deliberately not resolvable through this API — the promote
    // workflow uses the Supabase CLI's own linking plus GitHub Environment
    // gating, not the dev tooling.
    return fail(
      `expectedTarget "${expectedTarget}" is not a dev-tooling target (allowed: local, development).`,
    );
  }

  const declared = env.CHAINREACT_DB_TARGET;
  if (!declared) {
    return fail(
      `CHAINREACT_DB_TARGET is not set. Set CHAINREACT_DB_TARGET=${expectedTarget} to confirm the intended environment — refusing to guess.`,
    );
  }
  if (!VALID_TARGETS.includes(declared)) {
    return fail(`CHAINREACT_DB_TARGET="${declared}" is not a known environment (${VALID_TARGETS.join(", ")}).`);
  }
  if (declared !== expectedTarget) {
    return fail(
      `CHAINREACT_DB_TARGET="${declared}" but this command targets "${expectedTarget}". Refusing an ambiguous run.`,
    );
  }

  if (expectedTarget === "local") {
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    if (url && !isLoopbackUrl(url)) {
      return fail(
        `Target "local" but NEXT_PUBLIC_SUPABASE_URL in this process is not loopback. Unset it or use the loopback stack.`,
      );
    }
    return { ok: true, target: "local", ref: null, reason: "Local loopback stack." };
  }

  // development
  const devRef = env.SUPABASE_DEV_PROJECT_REF;
  if (!devRef) {
    return fail(
      "SUPABASE_DEV_PROJECT_REF is not set. The development project ref must be configured explicitly (see docs/runbooks/supabase-environments.md).",
    );
  }
  if (!/^[a-z0-9]{20}$/.test(devRef)) {
    return fail(`SUPABASE_DEV_PROJECT_REF "${devRef}" is not a valid 20-char project ref.`);
  }
  if (PROTECTED_REFS[devRef]) {
    return fail(
      `SUPABASE_DEV_PROJECT_REF "${devRef}" is ${PROTECTED_REFS[devRef]} — it can NEVER be the development target.`,
    );
  }

  // When a DB URL is provided it must agree with the declared dev ref.
  const dbUrl = env.SUPABASE_DEV_DB_URL;
  if (dbUrl) {
    const urlRef = parseRefFromPgUrl(dbUrl);
    if (!urlRef) {
      return fail("SUPABASE_DEV_DB_URL is set but its project ref is unparseable. Refusing an ambiguous target.");
    }
    if (urlRef !== devRef) {
      const protectedHit = PROTECTED_REFS[urlRef];
      return fail(
        `SUPABASE_DEV_DB_URL targets "${urlRef}"${protectedHit ? ` = ${protectedHit}` : ""}, but SUPABASE_DEV_PROJECT_REF is "${devRef}". Refusing.`,
      );
    }
  }

  // Same agreement check for an app URL when present.
  const appUrl = env.SUPABASE_DEV_URL;
  if (appUrl) {
    const appRef = parseRefFromSupabaseUrl(appUrl);
    if (appRef !== devRef) {
      return fail(
        `SUPABASE_DEV_URL ref "${appRef ?? "(unparseable)"}" does not match SUPABASE_DEV_PROJECT_REF "${devRef}". Refusing.`,
      );
    }
  }

  if (requireConfirm && env.DEV_RESET_CONFIRM !== devRef) {
    return fail(
      `Destructive development command requires DEV_RESET_CONFIRM=<dev project ref> (must equal SUPABASE_DEV_PROJECT_REF). Refusing without explicit confirmation.`,
    );
  }

  return {
    ok: true,
    target: "development",
    ref: devRef,
    reason: `Development project "${devRef}" confirmed.`,
  };
}

/**
 * Guard for scripts that are about to run a linked Supabase CLI command:
 * the CLI's linked ref (supabase/.temp/project-ref) must equal the resolved
 * dev ref — otherwise `--linked` would hit whatever was linked last.
 */
export function validateLinkedRef(linkedRef, devRef) {
  if (!linkedRef) {
    return fail("No linked Supabase project (supabase/.temp/project-ref missing). Run the guarded link step first.");
  }
  const trimmed = linkedRef.trim();
  if (PROTECTED_REFS[trimmed]) {
    return fail(`Linked project "${trimmed}" is ${PROTECTED_REFS[trimmed]} — refusing any linked dev command.`);
  }
  if (trimmed !== devRef) {
    return fail(`Linked project "${trimmed}" does not match the development ref "${devRef}". Re-link first.`);
  }
  return { ok: true, target: "development", ref: trimmed, reason: `Linked to development "${trimmed}".` };
}
