/** @jest-environment node */
/**
 * Stage 2A CS-1 — sanitized smoke artifact + smoke MCP tools.
 *
 * Proves:
 *   - the pure sanitizer never emits a raw error message, URL, absolute path,
 *     token-shaped value, or attachment path (basenames only);
 *   - the two smoke tools read ONLY the sanitized artifact through the allowed
 *     read seam, and degrade gracefully when it's absent;
 *   - `test-results/` and `playwright-report/` remain BLOCKED segments — the
 *     smoke tooling cannot reach raw Playwright artifacts.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
  buildSmokeArtifact,
  classifyError,
  scrubFreeText,
  type RawSmokeInput,
} from "@/tests/smoke/helpers/sanitizeSmokeArtifact";
import { smokeTools } from "@/scripts/mcp/tools/smoke";
import {
  PathNotAllowedError,
  resolveAllowedPath,
} from "@/scripts/mcp/security/paths";

const REPO_ROOT = resolve(__dirname, "../../..");
const ARTIFACT_PATH = resolve(REPO_ROOT, "artifacts/mcp/smoke-latest.json");

const SLACK_TOKEN = ["xoxb", "999999999999", "abcdEFGHijklMNOPqrstuvwx"].join("-");

const HOSTILE: RawSmokeInput = {
  category: "Slack action smoke",
  title: "pick channel by visible name + set message — node and header Ready",
  status: "failed",
  durationMs: 1234.7,
  errorName: "TimeoutError",
  // Everything below must NEVER reach the artifact:
  errorMessage:
    `expect(locator).toContainText: got "#secret-finance" at https://chainreact.app/workflows/abc ` +
    `token=${SLACK_TOKEN} posted "quarterly numbers are $4.2M" path C:\\Users\\marcu\\secret\\trace.zip`,
  stepLabel: "navigate to https://chainreact.app/runs as /Users/marcu/run",
  attachmentPaths: [
    "C:\\Users\\marcu\\source\\repos\\ChainReactV2\\test-results\\slack\\trace.zip",
    "/Users/marcu/repos/ChainReactV2/test-results/slack/test-failed-1.png",
  ],
};

describe("smoke artifact sanitizer (pure)", () => {
  it("classifyError returns a class label and never the raw message", () => {
    expect(classifyError("TimeoutError", "anything")).toBe("TimeoutError");
    // No name → coarse bucket derived from message, never the message itself.
    const cls = classifyError(null, "Timed out waiting for #secret-finance");
    expect(cls).toBe("TimeoutError");
    expect(cls).not.toContain("secret-finance");
    // Hostile name shape is bucketed, not echoed.
    expect(classifyError("Error: leak https://x.y", null)).toBe("Error");
  });

  it("scrubFreeText strips urls, tokens, and absolute paths", () => {
    const out = scrubFreeText(
      `see https://chainreact.app/x token ${SLACK_TOKEN} at C:\\Users\\marcu\\f.txt and /Users/marcu/g`,
    );
    expect(out).not.toContain("https://");
    expect(out).not.toContain(SLACK_TOKEN);
    expect(out).not.toContain("C:\\Users");
    expect(out).not.toContain("/Users/marcu");
  });

  it("buildSmokeArtifact leaks no sensitive substring from a hostile input", () => {
    const artifact = buildSmokeArtifact([HOSTILE], "2026-06-11T00:00:00.000Z");
    const blob = JSON.stringify(artifact);

    // Raw error message + its sensitive fragments are gone.
    expect(blob).not.toContain("quarterly numbers");
    expect(blob).not.toContain("4.2M");
    expect(blob).not.toContain("#secret-finance");
    expect(blob).not.toContain("expect(locator)");
    // No URLs.
    expect(blob).not.toContain("https://");
    expect(blob).not.toContain("chainreact.app");
    // No tokens.
    expect(blob).not.toContain(SLACK_TOKEN);
    expect(blob).not.toContain("xoxb-");
    // No absolute paths / blocked-artifact dirs / binary path.
    expect(blob).not.toContain("C:\\Users");
    expect(blob).not.toContain("/Users/marcu");
    expect(blob).not.toContain("test-results");

    const rec = artifact.records[0]!;
    // Kept, safe fields.
    expect(rec.errorClass).toBe("TimeoutError");
    expect(rec.status).toBe("failed");
    expect(rec.durationMs).toBe(1235);
    // Attachments reduced to basenames only.
    expect(rec.attachmentBasenames.sort()).toEqual(["test-failed-1.png", "trace.zip"]);
    expect(artifact.totals.failed).toBe(1);
  });

  it("attachment basenames are host-OS-independent — Windows, Unix, and mixed hostile paths all reduce", () => {
    // The sanitizer may run on ANY OS against paths produced on ANY OS
    // (a Linux CI runner sanitizing a Windows-produced path leaked the whole
    // path through path.basename). Every shape must reduce to a bare filename.
    const artifact = buildSmokeArtifact(
      [
        {
          ...HOSTILE,
          attachmentPaths: [
            "C:\\Users\\marcu\\source\\repos\\ChainReactV2\\test-results\\a\\win.zip",
            "/home/runner/work/chainreact/test-results/b/unix.png",
            "C:\\Users\\marcu/mixed\\separators/deep\\mixed.webm",
            "\\\\fileserver\\share\\users\\marcu\\unc.txt",
            "C:\\Users\\marcu\\trailing\\", // trailing separator → parent must not leak
            "C:", // bare drive designator is a location, not a filename
          ],
        },
      ],
      "2026-06-11T00:00:00.000Z",
    );
    const rec = artifact.records[0]!;
    expect(rec.attachmentBasenames.sort()).toEqual([
      "mixed.webm",
      "trailing",
      "unc.txt",
      "unix.png",
      "win.zip",
    ]);

    const blob = JSON.stringify(artifact);
    // Usernames, parents, drive letters, absolute roots — none may survive.
    for (const leak of [
      "marcu",
      "C:",
      "C\\\\", // escaped backslash form a drive prefix would take in JSON
      "/home/runner",
      "fileserver",
      "test-results",
      "source",
      "repos",
    ]) {
      expect(blob).not.toContain(leak);
    }
  });
});

describe("smoke MCP tools read only the sanitized artifact via the allowed seam", () => {
  const list = smokeTools.find((t) => t.name === "list_recent_smoke_failures")!;
  const read = smokeTools.find((t) => t.name === "read_smoke_failure_context")!;
  let backup: string | null = null;
  let dirCreated = false;

  beforeAll(() => {
    if (existsSync(ARTIFACT_PATH)) {
      backup = readFileSync(ARTIFACT_PATH, "utf8");
    } else if (!existsSync(dirname(ARTIFACT_PATH))) {
      mkdirSync(dirname(ARTIFACT_PATH), { recursive: true });
      dirCreated = true;
    }
    const artifact = buildSmokeArtifact(
      [
        HOSTILE,
        {
          category: "Public smoke",
          title: "home page renders",
          status: "passed",
          durationMs: 200,
        },
      ],
      "2026-06-11T00:00:00.000Z",
    );
    writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  });

  afterAll(() => {
    if (backup !== null) writeFileSync(ARTIFACT_PATH, backup, "utf8");
    else if (dirCreated) rmSync(dirname(ARTIFACT_PATH), { recursive: true, force: true });
    else rmSync(ARTIFACT_PATH, { force: true });
  });

  it("list_recent_smoke_failures surfaces the failing test, not the passing one", async () => {
    const out = String(await list.handler({}));
    expect(out).toContain("Slack action smoke");
    expect(out).toContain("TimeoutError");
    expect(out).not.toContain("home page renders"); // passed → not a failure
    // Still no sensitive content even through the tool path.
    expect(out).not.toContain("https://");
    expect(out).not.toContain(SLACK_TOKEN);
  });

  it("read_smoke_failure_context returns sanitized detail by title substring", async () => {
    const out = String(await read.handler({ title: "pick channel" }));
    expect(out).toContain("errorClass: TimeoutError");
    expect(out).toContain("trace.zip");
    expect(out).not.toContain("quarterly numbers");
    expect(out).not.toContain("test-results");
  });

  it("read_smoke_failure_context requires a title", async () => {
    expect(String(await read.handler({}))).toContain("'title' is required");
  });
});

describe("raw Playwright artifact dirs stay blocked", () => {
  it("test-results/ and playwright-report/ are refused even if passed as an allowed root", () => {
    for (const p of [
      "test-results/slack/trace.zip",
      "playwright-report/smoke/index.html",
      "test-results/x.json",
    ]) {
      // Passing the blocked dir itself as the allowed root must still throw —
      // BLOCKED_SEGMENTS wins over the whitelist.
      expect(() => resolveAllowedPath(p, [p.split("/")[0]!])).toThrow(
        PathNotAllowedError,
      );
    }
  });

  it("the sanitized artifact path IS reachable (control)", () => {
    expect(() =>
      resolveAllowedPath("artifacts/mcp/smoke-latest.json", ["artifacts/mcp"]),
    ).not.toThrow();
  });
});
