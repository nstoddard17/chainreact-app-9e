/**
 * @jest-environment node
 *
 * WORKFLOW-CHANGED-ELSEWHERE-CONFLICT-PROTECTION-1 — optimistic concurrency on
 * the ordinary builder save, against the REAL development database
 * (chainreact-dev), through the REAL repository functions and the REAL PATCH
 * route handler (route → service → repository → Postgres).
 *
 * Phase 1 reproduction (run against the pre-fix tree, 2026-08-04): two sessions
 * loaded revision 2026-08-05T02:40:03.918364+00:00 of the same workflow;
 * session A saved (row → …04.269207); session B then saved its stale edit with
 * plain `.eq("id")` semantics and NO revision anywhere in the request — HTTP
 * 200, row → …04.335853, change A silently erased. The unguarded repository
 * writer is now deleted; this suite pins the fixed contract on the same real
 * boundary.
 *
 * SAFETY: uses ONLY `.env.development.local` (SUPABASE_DEV_URL /
 * SUPABASE_DEV_SERVICE_ROLE_KEY). Hard-refuses the production project ref.
 * DESTRUCTIVE + OPT-IN: creates a throwaway @chainreact.test user + workflow,
 * cleaned up in afterAll. Set ALLOW_DB_INTEGRATION_TESTS=true to run.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupFixtures,
  createFixtureTracker,
  createTrackedUser,
  type TrackedUser,
} from "@/tests/helpers/dbFixtureCleanup";
import type { WorkflowDefinition } from "@/contracts/workflow";

/** LIVE PRODUCTION ref (mirrors scripts/lib/env-target.mjs). NEVER touch it here. */
const PRODUCTION_PROJECT_REF = "qcepijemjlkssfkvzlio";

function loadDevEnv(): void {
  const p = resolve(process.cwd(), ".env.development.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key]) continue;
    let v = m[2]!.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[key] = v;
  }
}
loadDevEnv();

const ALLOW = process.env.ALLOW_DB_INTEGRATION_TESTS === "true";
const DEV_URL = process.env.SUPABASE_DEV_URL;
const DEV_SERVICE_KEY = process.env.SUPABASE_DEV_SERVICE_ROLE_KEY;
const DEV_REF = process.env.SUPABASE_DEV_PROJECT_REF;

const SAFE =
  !!DEV_URL &&
  !!DEV_SERVICE_KEY &&
  !!DEV_REF &&
  DEV_URL.includes(DEV_REF) &&
  !DEV_URL.includes(PRODUCTION_PROJECT_REF) &&
  DEV_REF !== PRODUCTION_PROJECT_REF;

const RUN = ALLOW && SAFE;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP workflow-save-revision-conflict dev suite — requires ALLOW_DB_INTEGRATION_TESTS=true and .env.development.local (SUPABASE_DEV_URL + SUPABASE_DEV_SERVICE_ROLE_KEY, non-production ref).",
  );
}

/**
 * The repositories under test build their queries through the SSR client from
 * `@/utils/supabase/server`. Point that at the dev service-role client so the
 * REAL repository code paths (exact predicates) run against the REAL dev DB.
 * `auth.getUser` resolves to the current fixture user so route handlers
 * (requireUser) authenticate as the session's member.
 */
let admin: SupabaseClient | null = null;
let currentUser: TrackedUser | null = null;

jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => {
    if (!admin) throw new Error("admin client not initialized");
    return new Proxy(admin, {
      get(target, prop, receiver) {
        if (prop === "auth") {
          return {
            getUser: async () =>
              currentUser
                ? { data: { user: { id: currentUser.userId } }, error: null }
                : { data: { user: null }, error: new Error("no fixture user") },
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  },
}));

// Imported AFTER the mock so the repo/route modules bind to the mocked client.
import * as workflowsRepo from "@/repositories/workflows";
import { PATCH } from "@/app/api/workflows/[id]/route";

function def(marker: string): WorkflowDefinition {
  return {
    nodes: [
      {
        id: "trigger-1",
        kind: "trigger",
        provider: "native",
        type: "manual.run",
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        id: "action-1",
        kind: "action",
        provider: "native",
        type: "delay",
        config: { marker },
        position: { x: 0, y: 160 },
      },
    ],
    edges: [{ id: "edge-1", from: "trigger-1", to: "action-1" }],
  } as unknown as WorkflowDefinition;
}

function markerOf(d: WorkflowDefinition): string | undefined {
  const action = d.nodes.find((n) => n.id === "action-1");
  return (action?.config as { marker?: string } | undefined)?.marker;
}

async function patchDraft(
  workflowId: string,
  definition: WorkflowDefinition,
  expectedRevision?: string,
): Promise<Response> {
  const request = new Request(`http://localhost/api/workflows/${workflowId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      draftDefinition: definition,
      ...(expectedRevision !== undefined ? { expectedRevision } : {}),
    }),
  });
  return PATCH(request, { params: Promise.resolve({ id: workflowId }) });
}

describeDb("workflow save optimistic concurrency (dev DB, real route + repository)", () => {
  const tracker = createFixtureTracker();
  let accountId: string;
  let workflowId: string;

  jest.setTimeout(120_000);

  beforeAll(async () => {
    admin = createSupabaseClient(DEV_URL!, DEV_SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    currentUser = await createTrackedUser(admin, tracker, "revconf");
    // The personal account is created by a DB trigger on user insert.
    const { data: account, error } = await admin
      .from("accounts")
      .select("id")
      .eq("owner_user_id", currentUser.userId)
      .single<{ id: string }>();
    if (error || !account) throw new Error(`no personal account: ${error?.message}`);
    accountId = account.id;

    const created = await workflowsRepo.create({
      accountId,
      createdByUserId: currentUser.userId,
      name: "revision-conflict suite",
      draftDefinition: def("baseline"),
    });
    workflowId = created.id;
  });

  afterAll(async () => {
    await cleanupFixtures(admin, tracker);
  });

  it("saves via PATCH when expectedRevision matches, and advances the revision", async () => {
    const loaded = await workflowsRepo.getById(workflowId);
    const res = await patchDraft(workflowId, def("route-A"), loaded!.updatedAt);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { updatedAt: string };
    expect(body.updatedAt).not.toBe(loaded!.updatedAt);
  });

  it("rejects a stale PATCH with typed 409, leaving the newer definition unchanged (two-session reproduction, fixed)", async () => {
    // Both sessions load the same revision.
    const loadedA = await workflowsRepo.getById(workflowId);
    const loadedB = await workflowsRepo.getById(workflowId);
    expect(loadedA!.updatedAt).toBe(loadedB!.updatedAt);

    // Session A saves.
    const resA = await patchDraft(workflowId, def("session-A"), loadedA!.updatedAt);
    expect(resA.status).toBe(200);

    // Session B attempts its save from the OLD revision — typed conflict, no write.
    const resB = await patchDraft(workflowId, def("session-B"), loadedB!.updatedAt);
    expect(resB.status).toBe(409);
    const body = (await resB.json()) as {
      code: string;
      latestRevision?: string;
      error: string;
    };
    expect(body.code).toBe("WORKFLOW_REVISION_CONFLICT");
    expect(typeof body.latestRevision).toBe("string");
    expect(JSON.stringify(body)).not.toContain("draftDefinition");

    // Session A's save is intact; B's stale content never landed.
    const final = await workflowsRepo.getById(workflowId);
    expect(markerOf(final!.draftDefinition)).toBe("session-A");
  });

  it("requires expectedRevision for interactive builder saves (400, nothing written)", async () => {
    const before = await workflowsRepo.getById(workflowId);
    const res = await patchDraft(workflowId, def("no-revision"));
    expect(res.status).toBe(400);
    const after = await workflowsRepo.getById(workflowId);
    expect(after!.updatedAt).toBe(before!.updatedAt);
    expect(markerOf(after!.draftDefinition)).not.toBe("no-revision");
  });

  it("guarded repository write rejects a stale revision (returns null, newer row untouched)", async () => {
    const loaded = await workflowsRepo.getById(workflowId);
    const staleToken = loaded!.updatedAt;

    const savedA = await workflowsRepo.updateDraftDefinitionIfRevisionMatches({
      accountId,
      workflowId,
      draftDefinition: def("guarded-A"),
      expectedUpdatedAt: staleToken,
    });
    expect(savedA).not.toBeNull();

    const savedB = await workflowsRepo.updateDraftDefinitionIfRevisionMatches({
      accountId,
      workflowId,
      draftDefinition: def("guarded-B"),
      expectedUpdatedAt: staleToken,
    });
    expect(savedB).toBeNull();

    const final = await workflowsRepo.getById(workflowId);
    expect(markerOf(final!.draftDefinition)).toBe("guarded-A");
  });

  it("compare-and-swap is atomic: concurrent guarded saves from one base revision produce exactly one winner", async () => {
    const loaded = await workflowsRepo.getById(workflowId);
    const base = loaded!.updatedAt;

    const attempts = await Promise.all(
      ["cas-1", "cas-2", "cas-3", "cas-4"].map((m) =>
        workflowsRepo.updateDraftDefinitionIfRevisionMatches({
          accountId,
          workflowId,
          draftDefinition: def(m),
          expectedUpdatedAt: base,
        }),
      ),
    );
    const winners = attempts.filter((r) => r !== null);
    expect(winners).toHaveLength(1);

    const final = await workflowsRepo.getById(workflowId);
    expect(markerOf(final!.draftDefinition)).toBe(markerOf(winners[0]!.draftDefinition));
  });

  it("concurrent PATCH saves from one base revision: exactly one 200, the rest typed 409 (no partial writes)", async () => {
    const loaded = await workflowsRepo.getById(workflowId);
    const base = loaded!.updatedAt;

    const responses = await Promise.all(
      ["race-1", "race-2", "race-3"].map((m) => patchDraft(workflowId, def(m), base)),
    );
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409, 409]);

    const final = await workflowsRepo.getById(workflowId);
    expect(["race-1", "race-2", "race-3"]).toContain(markerOf(final!.draftDefinition));
  });
});
