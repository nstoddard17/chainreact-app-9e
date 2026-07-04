/**
 * @jest-environment node
 *
 * Write smoke harness — GitHub write batch (6 actions).
 *
 * Drives each fixture through the pure `runWriteSmoke` orchestrator over a FAKE
 * boundary. Protects the contracts that matter:
 *   - every verify goes through the github per-resource state seams (GitHub
 *     registers NO read actions);
 *   - CONTAINMENT: every repo-scoped fixture targets ONLY the staged shared repo
 *     via {{env.SMOKE_GITHUB_REPO}} (never a hardcoded/discovered repo), and no
 *     fixture text references a discovered repo owner/name;
 *   - each action PASSes with a marker read-back and leaves an honest artifact
 *     (no registered deletes; no delete_repo scope);
 *   - add_comment seeds its own issue (setup) then proves the comment via an
 *     independent comments-list read;
 *   - visibility consent is explicit (repo private, gist SECRET);
 *   - a wrong/absent read-back is VERIFY_FAILED; a missing repo target is
 *     BLOCKED_ENV (never a mutation); create_repository/create_gist need no repo.
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import {
  runWriteSmoke,
  type StepRunOutcome,
  type WriteHarnessDeps,
} from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const MARKER = "crsmoke-T1-";
const REPO = "octo/crsmoke-T1-shared";
const PR_HEAD = "crsmoke-T1-prhead";

const env = (n: string): string | undefined =>
  n === "SMOKE_GITHUB_CONNECTED"
    ? "true"
    : n === "SMOKE_GITHUB_REPO"
      ? REPO
      : n === "SMOKE_GITHUB_PR_HEAD"
        ? PR_HEAD
        : undefined;

const GITHUB_KEYS = [
  "github:create_repository",
  "github:create_issue",
  "github:add_comment",
  "github:create_branch",
  "github:create_pull_request",
  "github:create_gist",
] as const;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

function depsWith(reads: Record<string, Record<string, unknown>> = {}): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input): Promise<StepRunOutcome> {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      switch (input.action) {
        case "create_repository":
          return { ok: true, output: { repositoryId: 1, name: input.config.name, fullName: "octo/crsmoke-T1-repo", private: true, defaultBranch: "main" }, reason: null };
        case "create_issue":
          return { ok: true, output: { issueId: 10, issueNumber: 42, title: input.config.title, state: "open" }, reason: null };
        case "add_comment":
          return { ok: true, output: { commentId: 55, body: input.config.body, issueNumber: input.config.issueNumber }, reason: null };
        case "create_branch":
          return { ok: true, output: { ref: `refs/heads/${input.config.branchName}`, branchName: input.config.branchName, sha: "abc123" }, reason: null };
        case "create_pull_request":
          return { ok: true, output: { pullRequestId: 70, pullRequestNumber: 7, title: input.config.title, state: "open", head: input.config.head, base: "main" }, reason: null };
        case "create_gist":
          return { ok: true, output: { gistId: "gistabc", description: input.config.description, public: false, files: [input.config.filename] }, reason: null };
        default:
          return { ok: false, output: null, reason: `no plan for ${input.action}` };
      }
    },
    async smokeReadBack(input): Promise<StepRunOutcome> {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (reads[input.action]) return { ok: true, output: reads[input.action]!, reason: null };
      switch (input.action) {
        case "repo_state":
          return { ok: true, output: { found: true, name: `${MARKER}repo`, fullName: "octo/crsmoke-T1-repo", defaultBranch: "main", private: true }, reason: null };
        case "issue_state":
          return { ok: true, output: { found: true, title: `${MARKER}issue`, state: "open", body: `${MARKER}issue body - safe to ignore` }, reason: null };
        case "issue_comments":
          return { ok: true, output: { found: true, comments: [`${MARKER}comment body - safe to ignore`], commentCount: 1 }, reason: null };
        case "branch_state":
          return { ok: true, output: { found: true, ref: `refs/heads/${MARKER}branch`, sha: "abc123" }, reason: null };
        case "pull_request_state":
          return { ok: true, output: { found: true, title: `${MARKER}pr`, state: "open", head: PR_HEAD, base: "main" }, reason: null };
        case "gist_state":
          return { ok: true, output: { found: true, description: `${MARKER}gist - safe to delete`, public: false, files: [`${MARKER}gist.txt`] }, reason: null };
        default:
          return { ok: false, output: null, reason: "no plan" };
      }
    },
  };
}

// ─── Shape + containment ──────────────────────────────────────────────────────

describe("github write batch — shape + containment", () => {
  it("every fixture verifies via a github smoke seam (no registered reads exist)", () => {
    for (const key of GITHUB_KEYS) {
      const f = fixtureFor(key);
      expect(f.writeHarness?.liveClass).toBe("writeSafe");
      expect(f.writeHarness?.verify?.smokeRead).toBe(true);
      expect(f.writeHarness?.verify?.provider).toBe("github");
      // No registered GitHub delete/close action -> no cleanup declared (artifact left).
      expect(f.writeHarness?.cleanup).toBeUndefined();
      expect(f.writeHarness?.cleanupEach).toBeUndefined();
      expect(f.writeHarness?.cleanupAll).toBeUndefined();
    }
  });

  it("repo-scoped fixtures target ONLY the staged shared repo via env (containment)", () => {
    for (const key of ["github:create_issue", "github:add_comment", "github:create_branch", "github:create_pull_request"] as const) {
      const f = fixtureFor(key);
      expect(f.config.repository).toBe("{{env.SMOKE_GITHUB_REPO}}");
      expect(f.requiredEnv).toContain("SMOKE_GITHUB_REPO");
      expect(f.writeHarness?.verify?.config.repository).toBe("{{env.SMOKE_GITHUB_REPO}}");
    }
    // create_repository + create_gist take NO repo target (stand alone).
    expect(fixtureFor("github:create_repository").requiredEnv).not.toContain("SMOKE_GITHUB_REPO");
    expect(fixtureFor("github:create_gist").requiredEnv).not.toContain("SMOKE_GITHUB_REPO");
  });

  it("no fixture text references a discovered/pre-existing repo (only crsmoke tokens)", () => {
    const serialized = JSON.stringify(GITHUB_KEYS.map((k) => fixtureFor(k)));
    // The readiness probe surfaced these discovered repos — they must NEVER appear.
    expect(serialized).not.toMatch(/Mleonard12/i);
    expect(serialized).not.toMatch(/TEST-Repository/i);
    // Every repository value flows from an env/ledger token, never a literal owner/repo.
    expect(serialized).not.toMatch(/"repository":"[^{][^"]*\/[^"]*"/);
  });

  it("visibility consent is explicit: repo private, gist SECRET", () => {
    expect(fixtureFor("github:create_repository").config.private).toBe(true);
    expect(fixtureFor("github:create_gist").config.isPublic).toBe(false);
  });
});

// ─── Flows ────────────────────────────────────────────────────────────────────

describe("github write batch — flows", () => {
  it("all six actions PASS with marker read-backs and leave an honest artifact", async () => {
    for (const key of GITHUB_KEYS) {
      const r = await runWriteSmoke(fixtureFor(key), { ...RUN, envLookup: env }, depsWith());
      expect({ key, status: r.status }).toEqual({ key, status: "PASS" });
      expect(r.artifact).toBe("left");
    }
  });

  it("create_repository: created its own repo; repo_state proves the persisted name", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("github:create_repository"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.ledger.created).toBe(1);
    expect(r.ledger.kinds).toContain("repository");
    // verify targets the ledger-captured fullName (the repo THIS run created).
    const verify = deps.calls.find((c) => c.action === "repo_state");
    expect(verify?.config.repository).toBe("octo/crsmoke-T1-repo");
  });

  it("add_comment: seeds its own issue, proves the comment in the comments list", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("github:add_comment"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.ledger.created).toBe(2); // seeded issue + comment
    const setup = deps.calls.find((c) => c.action === "create_issue");
    expect(setup?.config.repository).toBe(REPO);
    const verify = deps.calls.find((c) => c.action === "issue_comments");
    expect(verify?.config.issueNumber).toBe("42"); // the ledger-captured seeded issue
  });

  it("create_pull_request: uses the staged head branch; PR read-back proves the title", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("github:create_pull_request"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    const exec = deps.calls.find((c) => c.action === "create_pull_request");
    expect(exec?.config.head).toBe(PR_HEAD);
    expect(exec?.config.repository).toBe(REPO);
  });

  it("a read-back missing the marker is VERIFY_FAILED (write echo never trusted)", async () => {
    const deps = depsWith({
      issue_state: { found: true, title: "someone elses issue", state: "open", body: "" },
    });
    const r = await runWriteSmoke(fixtureFor("github:create_issue"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("a 404 (found:false) read-back is VERIFY_FAILED", async () => {
    const deps = depsWith({
      gist_state: { found: false, description: "", public: false, files: [] },
    });
    const r = await runWriteSmoke(fixtureFor("github:create_gist"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});

// ─── Gating ───────────────────────────────────────────────────────────────────

describe("github write batch — gating", () => {
  it("repo-scoped fixtures are BLOCKED_ENV without the staged repo (no mutation)", async () => {
    const noRepo = (n: string): string | undefined => (n === "SMOKE_GITHUB_REPO" ? undefined : env(n));
    for (const key of ["github:create_issue", "github:add_comment", "github:create_branch"] as const) {
      const deps = depsWith();
      const r = await runWriteSmoke(fixtureFor(key), { ...RUN, envLookup: noRepo }, deps);
      expect({ key, status: r.status }).toEqual({ key, status: "BLOCKED_ENV" });
      expect(deps.calls).toHaveLength(0);
    }
  });

  it("create_pull_request is BLOCKED_ENV without the staged head branch env", async () => {
    const noHead = (n: string): string | undefined => (n === "SMOKE_GITHUB_PR_HEAD" ? undefined : env(n));
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("github:create_pull_request"), { ...RUN, envLookup: noHead }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0);
  });

  it("create_repository / create_gist run with NO repo target (connected only)", async () => {
    const noRepo = (n: string): string | undefined => (n === "SMOKE_GITHUB_REPO" || n === "SMOKE_GITHUB_PR_HEAD" ? undefined : env(n));
    for (const key of ["github:create_repository", "github:create_gist"] as const) {
      const r = await runWriteSmoke(fixtureFor(key), { ...RUN, envLookup: noRepo }, depsWith());
      expect({ key, status: r.status }).toEqual({ key, status: "PASS" });
    }
  });

  it("write fixtures SKIP without the write opt-in", async () => {
    const r = await runWriteSmoke(fixtureFor("github:create_gist"), { runToken: "T1", envLookup: env }, depsWith());
    expect(r.status).toBe("SKIP");
  });
});
