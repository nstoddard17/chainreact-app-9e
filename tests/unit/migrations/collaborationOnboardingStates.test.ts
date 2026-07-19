/**
 * @jest-environment node
 *
 * Static guards for the collaboration-onboarding migrations (5.ONBOARD-4).
 * Reads the SQL (no DB): per-track key, service-role-only writes, the REVOKE
 * that this project's ALTER DEFAULT PRIVILEGES makes mandatory, and the widened
 * onboarding_events taxonomy.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const strip = (s: string) => s.replace(/--[^\n]*/g, "");

const statesSql = strip(
  readFileSync(
    join(MIGRATIONS, "20260726000000_collaboration_onboarding_states.sql"),
    "utf8",
  ),
);
const eventsSql = strip(
  readFileSync(
    join(MIGRATIONS, "20260726000001_onboarding_events_collaboration_taxonomy.sql"),
    "utf8",
  ),
);

describe("collaboration_onboarding_states", () => {
  it("keys progress per (user, account, TRACK) so roles cannot share a record", () => {
    expect(statesSql).toMatch(
      /PRIMARY\s+KEY\s*\(\s*user_id\s*,\s*account_id\s*,\s*track\s*\)/i,
    );
  });

  it("constrains track to the three shipped identifiers", () => {
    expect(statesSql).toMatch(
      /CHECK\s*\(\s*track\s+IN\s*\([\s\S]*'team_owner'[\s\S]*'team_admin'[\s\S]*'team_member'[\s\S]*\)\s*\)/i,
    );
  });

  it("stores NO per-step completion boolean (completion is always derived)", () => {
    // The honesty contract: a stored "invited ✓" would go stale, and a stored
    // "visited ✓" would become a forgeable completion.
    for (const forbidden of [
      "invite_teammate",
      "teammate_joined",
      "connect_shared_app",
      "explore_workspace",
      "step_complete",
      "steps_completed",
    ]) {
      expect(statesSql).not.toContain(forbidden);
    }
  });

  it("REVOKEs the default-privilege surplus before granting narrowly", () => {
    // This project carries ALTER DEFAULT PRIVILEGES GRANT ALL to anon +
    // authenticated (see 20260725000000), so a new table arrives fully open.
    // Without these REVOKEs the service-role-only write contract is fiction.
    expect(statesSql).toMatch(
      /REVOKE\s+ALL\s+ON\s+public\.collaboration_onboarding_states\s+FROM\s+anon/i,
    );
    expect(statesSql).toMatch(
      /REVOKE\s+ALL\s+ON\s+public\.collaboration_onboarding_states\s+FROM\s+authenticated/i,
    );
    const revokeIdx = statesSql.search(/REVOKE\s+ALL[\s\S]*?FROM\s+anon/i);
    const grantIdx = statesSql.search(/GRANT\s+SELECT\s+ON\s+public\.collaboration/i);
    expect(revokeIdx).toBeGreaterThan(-1);
    expect(revokeIdx).toBeLessThan(grantIdx);
  });

  it("grants authenticated SELECT only; every write is service-role", () => {
    expect(statesSql).toMatch(
      /GRANT\s+SELECT\s+ON\s+public\.collaboration_onboarding_states\s+TO\s+authenticated/i,
    );
    expect(statesSql).toMatch(
      /GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.collaboration_onboarding_states\s+TO\s+service_role/i,
    );
    // No authenticated write grant of any kind.
    expect(statesSql).not.toMatch(
      /GRANT\s+[^;]*(INSERT|UPDATE|DELETE)[^;]*TO\s+authenticated/i,
    );
  });

  it("enables RLS with an own-row AND still-a-member SELECT policy", () => {
    expect(statesSql).toMatch(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(statesSql).toMatch(/user_id\s*=\s*auth\.uid\(\)/i);
    expect(statesSql).toMatch(/FROM\s+public\.account_memberships/i);
    // SELECT-only policy — no write policy exists, so RLS denies writes.
    expect(statesSql).toMatch(/FOR\s+SELECT/i);
    expect(statesSql).not.toMatch(/FOR\s+(INSERT|UPDATE|DELETE|ALL)/i);
  });
});

describe("onboarding_events collaboration taxonomy", () => {
  it("adds the member learning-evidence event types", () => {
    for (const t of [
      "collab_workspace_explored",
      "collab_shared_workflow_opened",
      "collab_apps_viewed",
      "collab_team_viewed",
    ]) {
      expect(eventsSql).toContain(`'${t}'`);
    }
  });

  it("keeps every pre-existing event type valid", () => {
    for (const t of [
      "onboarding_shown",
      "onboarding_step_completed",
      "onboarding_cta_clicked",
      "onboarding_dismissed",
      "onboarding_reopened",
      "onboarding_minimized",
      "onboarding_workflow_switched",
      "onboarding_video_opened",
      "onboarding_video_watched",
      "onboarding_completed",
    ]) {
      expect(eventsSql).toContain(`'${t}'`);
    }
  });

  it("keeps the five first-workflow step keys valid alongside the new ones", () => {
    for (const k of ["create", "connect", "configure", "test", "activate"]) {
      expect(eventsSql).toContain(`'${k}'`);
    }
    for (const k of [
      "invite_teammate",
      "teammate_joined",
      "connect_shared_app",
      "create_shared_workflow",
      "review_team",
      "explore_workspace",
      "open_shared_workflow",
      "use_shared_workflow",
      "explore_directory",
    ]) {
      expect(eventsSql).toContain(`'${k}'`);
    }
  });

  it("changes only CHECK constraints — no grant, policy, or column change", () => {
    expect(eventsSql).not.toMatch(/GRANT\s/i);
    expect(eventsSql).not.toMatch(/CREATE\s+POLICY/i);
    expect(eventsSql).not.toMatch(/DROP\s+POLICY/i);
    expect(eventsSql).not.toMatch(/ADD\s+COLUMN/i);
    expect(eventsSql).not.toMatch(/DROP\s+COLUMN/i);
  });
});
