/**
 * @jest-environment node
 *
 * GOOGLE-OAUTH-SCOPE-DISCREPANCY-CLOSEOUT-1 — the authoritative Google scope
 * union guard.
 *
 * Google's verification review requires an EXACT match between (a) the scopes
 * the code requests, (b) the scopes declared in Cloud Console → Data Access,
 * and (c) the scopes shown on the OAuth consent screen / verification video.
 * Scope requests originate ONLY from the six Google provider manifests (the
 * dispatcher assembles `required + optional` into one authorize URL), so this
 * file pins the manifests' project-wide union in one place and fails when:
 *
 *   1. any Google manifest introduces a scope outside the pinned union
 *      (accidental widening — a Console discrepancy the reviewer WILL flag);
 *   2. a scope retired by a least-privilege audit is resurrected;
 *   3. the pinned union itself drifts from what the manifests declare
 *      (stale guard — both directions are asserted).
 *
 * The Cloud Console union additionally carries the Supabase
 * "Continue with Google" sign-in identity scopes (same Google client —
 * GOOGLE-OAUTH-FINAL-CONSOLE-RECONCILIATION-1): `openid` +
 * `userinfo.profile`, with `userinfo.email` shared with the integrations.
 * Those are DOCUMENTED here for the Console-union arithmetic; they are not
 * runtime state and no runtime code reads them.
 *
 * Retirement history (never re-add without a fresh least-privilege audit and
 * owner-approved Console/verification update):
 *   - gmail.compose / gmail.readonly / gmail.send — collapsed into
 *     gmail.modify (GOOGLE-OAUTH-SCOPE-MINIMIZATION-1).
 *   - gmail.settings.basic — updateSignature was a V1 orphan; never ported.
 *   - mail.google.com — permanent delete retired; delete_email trashes only.
 *   - calendar (broad) / calendar.readonly — replaced by calendar.events +
 *     calendar.calendarlist.readonly (granular split).
 *   - drive.metadata.readonly (RESTRICTED) — Sheets' old Drive-enumerating
 *     resolver deleted; Picker per-file grants via drive.file replaced it
 *     (GOOGLE-OAUTH-PRODUCTION-SCOPE-CLOSEOUT-2).
 *   - drive.readonly — never a request; listed to keep it that way (it
 *     appears only in analytics-source `scanScopes`, which READ stored
 *     historical grants and never request anything).
 *   - documents / documents.readonly — RETIRED by this closeout: every Docs
 *     API method the surface calls (documents.create/get/batchUpdate)
 *     accepts `drive`, which google-docs independently requires for
 *     share/export/folder placement/picker/watch, so `documents` granted no
 *     capability and only widened consent.
 *   - contacts / contacts.readonly / people.* — Contacts was never ported to
 *     V2; the stale Console justification is deleted, not resurrected.
 */
import { gmailManifest } from "@/integrations/gmail/manifest";
import { googleCalendarManifest } from "@/integrations/google-calendar/manifest";
import { googleDriveManifest } from "@/integrations/google-drive/manifest";
import { googleSheetsManifest } from "@/integrations/google-sheets/manifest";
import { googleDocsManifest } from "@/integrations/google-docs/manifest";
import { googleAnalyticsManifest } from "@/integrations/google-analytics/manifest";

const MANIFESTS = [
  gmailManifest,
  googleCalendarManifest,
  googleDriveManifest,
  googleSheetsManifest,
  googleDocsManifest,
  googleAnalyticsManifest,
] as const;

const A = "https://www.googleapis.com/auth/";

/** The exact project-wide INTEGRATION scope union (9 scopes). */
const EXPECTED_INTEGRATION_UNION = [
  `${A}gmail.modify`,
  `${A}calendar.events`,
  `${A}calendar.calendarlist.readonly`,
  `${A}drive`,
  `${A}spreadsheets`,
  `${A}drive.file`,
  `${A}analytics.readonly`,
  `${A}analytics.edit`,
  `${A}userinfo.email`,
] as const;

/**
 * Identity scopes the Supabase "Continue with Google" sign-in adds on the
 * SAME Google client (no scope override in code — Supabase's OIDC default).
 * Documented for Console arithmetic only.
 */
const SIGN_IN_IDENTITY_SCOPES = [
  "openid",
  `${A}userinfo.email`, // shared with the integrations
  `${A}userinfo.profile`,
] as const;

/** Exact expected Cloud Console → Data Access union (11 scopes). */
const EXPECTED_CONSOLE_UNION = [
  ...new Set([...EXPECTED_INTEGRATION_UNION, ...SIGN_IN_IDENTITY_SCOPES]),
] as const;

/** Scopes that must NEVER reappear in any manifest field. Exact strings. */
const RETIRED_SCOPES = [
  `${A}gmail.compose`,
  `${A}gmail.readonly`,
  `${A}gmail.send`,
  `${A}gmail.settings.basic`,
  "https://mail.google.com/",
  `${A}calendar`, // broad calendar — exact match; calendar.events is fine
  `${A}calendar.readonly`,
  `${A}drive.metadata.readonly`,
  `${A}drive.readonly`,
  `${A}documents`,
  `${A}documents.readonly`,
  `${A}contacts`,
  `${A}contacts.readonly`,
  `${A}contacts.other.readonly`,
] as const;

const declaredUnion = (): Set<string> =>
  new Set(
    MANIFESTS.flatMap((m) => [
      ...m.scopes.required,
      ...m.scopes.optional,
      ...m.scopes.deprecated,
    ]),
  );

describe("Google project scope union (authoritative guard)", () => {
  it("the six manifests declare EXACTLY the pinned integration union — no widening, no drift", () => {
    const declared = declaredUnion();
    const expected = new Set<string>(EXPECTED_INTEGRATION_UNION);
    expect([...declared].filter((s) => !expected.has(s)).sort()).toEqual([]);
    expect([...expected].filter((s) => !declared.has(s)).sort()).toEqual([]);
  });

  it.each(RETIRED_SCOPES.map((s) => [s] as const))(
    "retired scope is never requested by any manifest: %s",
    (scope) => {
      for (const m of MANIFESTS) {
        expect(m.scopes.required).not.toContain(scope);
        expect(m.scopes.optional).not.toContain(scope);
        expect(m.scopes.deprecated).not.toContain(scope);
      }
    },
  );

  it("the Cloud Console union is the integration union plus openid + userinfo.profile (11 scopes)", () => {
    expect(EXPECTED_CONSOLE_UNION).toHaveLength(11);
    const console_ = new Set<string>(EXPECTED_CONSOLE_UNION);
    for (const s of declaredUnion()) expect(console_.has(s)).toBe(true);
    // The two sign-in-only additions, exactly:
    const signInOnly = EXPECTED_CONSOLE_UNION.filter(
      (s) => !new Set<string>(EXPECTED_INTEGRATION_UNION).has(s),
    );
    expect(signInOnly.sort()).toEqual(["openid", `${A}userinfo.profile`].sort());
  });

  it("per-provider request sets stay exact (dispatcher sends required + optional)", () => {
    const byId = Object.fromEntries(
      MANIFESTS.map((m) => [m.id, [...m.scopes.required, ...m.scopes.optional].sort()]),
    );
    expect(byId).toEqual({
      gmail: [`${A}gmail.modify`],
      "google-calendar": [
        `${A}calendar.calendarlist.readonly`,
        `${A}calendar.events`,
        `${A}userinfo.email`,
      ].sort(),
      "google-drive": [`${A}drive`, `${A}userinfo.email`].sort(),
      "google-sheets": [`${A}drive.file`, `${A}spreadsheets`, `${A}userinfo.email`].sort(),
      "google-docs": [`${A}drive`, `${A}userinfo.email`].sort(),
      "google-analytics": [
        `${A}analytics.edit`,
        `${A}analytics.readonly`,
        `${A}userinfo.email`,
      ].sort(),
    });
  });
});
