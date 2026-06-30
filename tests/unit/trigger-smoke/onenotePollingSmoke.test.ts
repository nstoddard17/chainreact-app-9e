/**
 * @jest-environment node
 *
 * Unit tests for the OneNote polling-trigger smoke ORCHESTRATOR (pure, fakes for
 * every seam). Proves baseline-first (first poll 0) + fire-once + page identity +
 * propagation re-poll + cleanup-not-masked + skip-when-no-section, plus the two real
 * specs' build + identity logic. No DB / engine / provider.
 */
import {
  buildOneNoteNewNoteSmokeWorkflow,
  buildOneNoteUpdatedNoteSmokeWorkflow,
  runOneNotePollingSmoke,
  NEW_NOTE_SPEC,
  UPDATED_NOTE_SPEC,
  ONENOTE_POLLING_SMOKE_TRIGGER_NODE_ID,
  type OneNotePollingSmokeDeps,
  type OneNotePollingRun,
} from "@/tests/trigger-smoke/onenotePollingSmoke";
import { TRIGGER_CERTIFICATIONS } from "@/tests/trigger-smoke/triggerCertificationSeed";

function makeFakeDeps(
  opts: { runsAppearAfterNPolls?: number; noSection?: boolean } = {},
  overrides: Partial<OneNotePollingSmokeDeps> = {},
): {
  deps: OneNotePollingSmokeDeps;
  calls: { polls: number; deleted: string[]; cleanedWorkflows: string[]; sleeps: number };
} {
  const appearAfter = opts.runsAppearAfterNPolls ?? 1;
  const calls = { polls: 0, deleted: [] as string[], cleanedWorkflows: [] as string[], sleeps: 0 };
  let armed = false;
  let n = 0;
  let pending: Record<string, unknown> | null = null;
  let pollsSinceChange = 0;
  let runs: OneNotePollingRun[] = [];

  const deps: OneNotePollingSmokeDeps = {
    async discoverSmokeSection() {
      return opts.noSection ? null : { sectionId: "sec-1", notebookId: "nb-1" };
    },
    async createActiveSmokeWorkflow() {
      return { workflowId: "wf-onenote" };
    },
    async createPage() {
      n += 1;
      const pageId = `page-${n}`;
      const titleMarker = `crsmoke-${pageId}-note`;
      // A page created AFTER activation is the new_note change → it will fire.
      if (armed) pending = { changeKind: "created", pageId, title: titleMarker };
      return { pageId, titleMarker };
    },
    async confirmPageVisible() {
      /* no lag in unit */
    },
    async updatePage({ pageId }) {
      if (armed) pending = { changeKind: "updated", pageId, title: "crsmoke-page-1-note" };
    },
    async armPollingTrigger() {
      armed = true;
      return { snapshotPresent: true };
    },
    async poll() {
      calls.polls += 1;
      if (pending && runs.length === 0) {
        pollsSinceChange += 1;
        if (pollsSinceChange >= appearAfter) {
          runs = [{ runId: "run-x", status: "queued", triggerPayload: pending }];
        }
      }
    },
    async listRuns() {
      return runs;
    },
    async drainRun(runId) {
      runs = runs.map((r) => (r.runId === runId ? { ...r, status: "succeeded" } : r));
    },
    async readRun(runId) {
      return runs.find((r) => r.runId === runId) ?? null;
    },
    async deletePage(pageId) {
      calls.deleted.push(pageId);
    },
    async cleanupWorkflow(workflowId) {
      calls.cleanedWorkflows.push(workflowId);
    },
    async sleep() {
      calls.sleeps += 1;
    },
    ...overrides,
  };
  return { deps, calls };
}

describe("build functions", () => {
  it("new_note carries {notebookId, sectionId}; updated_note adds pageId scope", () => {
    const nn = buildOneNoteNewNoteSmokeWorkflow({ sectionId: "s", notebookId: "n" }).definition.nodes.find((x) => x.kind === "trigger")!;
    expect(nn.type).toBe("new_note");
    expect(nn.config).toMatchObject({ notebookId: "n", sectionId: "s" });
    expect(nn.id).toBe(ONENOTE_POLLING_SMOKE_TRIGGER_NODE_ID);

    const un = buildOneNoteUpdatedNoteSmokeWorkflow({ sectionId: "s", notebookId: "n", baselinePageId: "p" }).definition.nodes.find((x) => x.kind === "trigger")!;
    expect(un.type).toBe("updated_note");
    expect(un.config).toMatchObject({ notebookId: "n", sectionId: "s", pageId: "p" });
  });
});

describe("runOneNotePollingSmoke — happy path per spec", () => {
  it("new_note: baseline 0, post-baseline create fires 1, identity matched, succeeded, page cleaned", async () => {
    const { deps, calls } = makeFakeDeps();
    const r = await runOneNotePollingSmoke(deps, NEW_NOTE_SPEC);
    expect(r.outcome).toBe("pass");
    expect(r.baselineRunCount).toBe(0);
    expect(r.afterRunCount).toBe(1);
    expect(r.identityMatched).toBe(true);
    expect(r.terminalStatus).toBe("succeeded");
    expect(r.createdPageCount).toBe(1); // the created note
    expect(r.cleaned).toBe(true);
    expect(calls.deleted).toEqual(["page-1"]);
    expect(calls.cleanedWorkflows).toEqual(["wf-onenote"]);
  });

  it("updated_note: seeds baseline page, baseline 0, update fires 1 (same page, changeKind updated), cleaned", async () => {
    const { deps, calls } = makeFakeDeps();
    const r = await runOneNotePollingSmoke(deps, UPDATED_NOTE_SPEC);
    expect(r.outcome).toBe("pass");
    expect(r.baselineRunCount).toBe(0);
    expect(r.afterRunCount).toBe(1);
    expect(r.changedPageId).toBe("page-1"); // the seeded baseline page, updated in place
    expect(r.identityMatched).toBe(true);
    expect(r.createdPageCount).toBe(1); // baseline page (no new page on update)
    expect(r.cleaned).toBe(true);
    expect(calls.deleted).toEqual(["page-1"]);
  });
});

describe("runOneNotePollingSmoke — skip / invariants / failure modes", () => {
  it("SKIPS when no operator smoke section exists (never writes to a real notebook)", async () => {
    const { deps, calls } = makeFakeDeps({ noSection: true });
    const r = await runOneNotePollingSmoke(deps, NEW_NOTE_SPEC);
    expect(r.outcome).toBe("skip");
    expect(r.reason).toMatch(/no operator-provisioned smoke/);
    expect(calls.deleted).toEqual([]); // nothing created
  });

  it("baseline-first: fails (and cleans up) if the FIRST poll fires from pre-existing state", async () => {
    let runs: OneNotePollingRun[] = [];
    const { deps, calls } = makeFakeDeps({}, {
      async poll() {
        if (runs.length === 0) runs = [{ runId: "early", status: "queued", triggerPayload: { changeKind: "created", pageId: "old", title: "x" } }];
      },
      async listRuns() {
        return runs;
      },
    });
    const r = await runOneNotePollingSmoke(deps, NEW_NOTE_SPEC);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/baseline violation/);
    expect(r.cleaned).toBe(true);
    expect(calls.cleanedWorkflows).toEqual(["wf-onenote"]);
  });

  it("fails when the fired payload does not identify the changed page", async () => {
    let pending: Record<string, unknown> | null = null;
    let runs: OneNotePollingRun[] = [];
    let armed = false;
    const { deps } = makeFakeDeps({}, {
      async armPollingTrigger() {
        armed = true;
        return { snapshotPresent: true };
      },
      async createPage() {
        if (armed) pending = { changeKind: "created", pageId: "RIGHT", title: "crsmoke-x-note" };
        return { pageId: "RIGHT", titleMarker: "crsmoke-x-note" };
      },
      async poll() {
        if (pending && runs.length === 0) runs = [{ runId: "r", status: "queued", triggerPayload: { changeKind: "created", pageId: "WRONG", title: "y" } }];
      },
      async listRuns() {
        return runs;
      },
    });
    const r = await runOneNotePollingSmoke(deps, NEW_NOTE_SPEC);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/did not identify the changed page/);
  });

  it("cleanup is NOT masked: arm throws AFTER the baseline page was seeded → page still deleted", async () => {
    const { deps, calls } = makeFakeDeps({}, {
      async armPollingTrigger() {
        throw new Error("arm boom");
      },
    });
    const r = await runOneNotePollingSmoke(deps, UPDATED_NOTE_SPEC);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toBe("arm boom");
    expect(calls.deleted).toEqual(["page-1"]); // seeded baseline page cleaned despite throw
    expect(calls.cleanedWorkflows).toEqual(["wf-onenote"]);
  });
});

describe("runOneNotePollingSmoke — propagation re-poll", () => {
  it("passes when the run only appears on the 2nd after-poll (bounded re-poll + sleep)", async () => {
    const { deps, calls } = makeFakeDeps({ runsAppearAfterNPolls: 2 });
    const r = await runOneNotePollingSmoke(deps, NEW_NOTE_SPEC, { afterPollAttempts: 4, afterPollSleepMs: 5 });
    expect(r.outcome).toBe("pass");
    expect(calls.sleeps).toBeGreaterThanOrEqual(1);
  });

  it("fails (not hang) when the change never becomes visible within the budget", async () => {
    const { deps } = makeFakeDeps({ runsAppearAfterNPolls: 99 });
    const r = await runOneNotePollingSmoke(deps, NEW_NOTE_SPEC, { afterPollAttempts: 3, afterPollSleepMs: 1 });
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/expected exactly 1 run after the change, got 0/);
  });
});

describe("trigger certification seed — onenote polling family", () => {
  it("has rows for new_note + updated_note (both polling)", () => {
    for (const t of ["new_note", "updated_note"]) {
      const row = TRIGGER_CERTIFICATIONS.find((c) => c.provider === "microsoft-onenote" && c.type === t);
      expect(row?.activation).toBe("polling");
    }
  });
});
