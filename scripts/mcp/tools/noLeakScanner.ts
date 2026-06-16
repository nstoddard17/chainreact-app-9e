/**
 * Internal MCP server — no-leak scanner (Phase C-1).
 *
 * A LOCAL dev/test aid: scan a diagnostic DTO (or any sample JSON) for forbidden
 * "leak shapes" — credential keys/values, raw config/output, trigger payloads,
 * stack traces, raw DB errors, connection strings. It helps catch diagnostic-output
 * mistakes WHILE BUILDING new diagnostics; it is NOT a runtime security gate (the
 * real defense is each capability service building its DTO field-by-field).
 *
 * IMPORT FENCE — `node` globals + LOCAL modules only (`../security/redact`,
 * `../registry`). No app code, no DB, no network. The scanner NEVER echoes a
 * sensitive-looking VALUE back — it reports the key/path + a category + reason,
 * and for credential-shaped values reuses the same `redactSecrets` detector the
 * protocol egress uses (so it stays consistent with runtime redaction).
 */
import { redactSecrets } from "../security/redact";
import type { ToolDefinition } from "../registry";

const MAX_INPUT_CHARS = 200_000;
const MAX_NODES = 20_000;
const MAX_VIOLATIONS = 200;
const MAX_VALUE_SCAN = 8_000;

export type Severity = "error" | "warning";
export interface LeakViolation {
  readonly category: string;
  readonly path: string;
  readonly reason: string;
  readonly severity: Severity;
}
export interface ScanResult {
  readonly passed: boolean;
  readonly violations: readonly LeakViolation[];
  readonly truncated: boolean;
}

// Key-name signals (case-insensitive).
const SECRET_KEY = /(access_?token|refresh_?token|id_?token|client_?secret|private_?key|password|passwd|secret|api[_-]?key|apikey|bearer)/i;
const AUTHZ_KEY = /^authorization$/i;
const RAW_CONTENT_KEY = /^(config|raw_?config|output|raw_?output)$/i;
const EVENT_KEY = /(trigger_?event|raw_?payload|^payload$)/i;
const STACK_KEY = /(stack(_?trace)?|traceback)/i;

// Value-shape signals (beyond redactSecrets, which catches the credential shapes).
const STACK_VALUE = /(^|\n)\s*at\s+.+\(?.+:\d+:\d+\)?/;
const DB_ERROR_VALUE =
  /(duplicate key value|relation "[^"]+" does not exist|column "[^"]+" does not exist|SQLSTATE|PG::|syntax error at or near|violates [a-z-]+ constraint|null value in column)/i;
const CONNECTION_STRING = /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"']+/i;

function pushKeyViolation(
  out: LeakViolation[],
  key: string,
  path: string,
  parentKey: string | null,
): void {
  if (out.length >= MAX_VIOLATIONS) return;
  if (SECRET_KEY.test(key) || AUTHZ_KEY.test(key)) {
    out.push({
      category: "credential-key",
      path,
      reason: `key '${key}' indicates a credential/token — raw secret values must never appear in diagnostic output`,
      severity: "error",
    });
  } else if (RAW_CONTENT_KEY.test(key)) {
    out.push({
      category: "raw-config-or-output",
      path,
      reason: `key '${key}' carries raw config/output — surface field NAMES or a humanized summary, never raw values`,
      severity: "error",
    });
  } else if (STACK_KEY.test(key)) {
    out.push({
      category: "stack-trace",
      path,
      reason: `key '${key}' carries a stack trace — never expose stack traces in diagnostic output`,
      severity: "error",
    });
  } else if (parentKey && /^error$/i.test(parentKey) && /^(message|details)$/i.test(key)) {
    out.push({
      category: "raw-error-message",
      path,
      reason: `raw error.${key} — return a humanized errorClassification, never the raw message/details`,
      severity: "error",
    });
  } else if (EVENT_KEY.test(key)) {
    out.push({
      category: "raw-event-payload",
      path,
      reason: `key '${key}' may carry a raw trigger/event payload — never echo raw provider/event bodies`,
      severity: "warning",
    });
  }
}

function pushValueViolations(out: LeakViolation[], value: string, path: string): void {
  if (out.length >= MAX_VIOLATIONS) return;
  const v = value.length > MAX_VALUE_SCAN ? value.slice(0, MAX_VALUE_SCAN) : value;
  // Credential-shaped values — reuse the egress redactor. If it changes the
  // string, a credential shape is present; report the [REDACTED:<label>] marker,
  // NEVER the raw value.
  const redacted = redactSecrets(v);
  if (redacted !== v) {
    const label = redacted.match(/\[REDACTED:([a-z-]+)\]/i)?.[1] ?? "secret";
    out.push({
      category: `credential-value:${label}`,
      path,
      reason: `value matches a ${label} credential pattern (raw value withheld)`,
      severity: "error",
    });
    return; // one value → one credential violation is enough
  }
  if (STACK_VALUE.test(v)) {
    out.push({ category: "stack-trace-value", path, reason: "value looks like a stack trace", severity: "error" });
  } else if (DB_ERROR_VALUE.test(v)) {
    out.push({ category: "raw-db-error", path, reason: "value looks like a raw database/Postgres error", severity: "error" });
  } else if (CONNECTION_STRING.test(v)) {
    out.push({ category: "connection-string", path, reason: "value looks like a database connection string", severity: "error" });
  }
}

/** Recursively scan a parsed value for leak shapes (pure; exported for tests). */
export function scanForLeaks(root: unknown): ScanResult {
  const violations: LeakViolation[] = [];
  let visited = 0;
  let truncated = false;

  const walk = (value: unknown, path: string, parentKey: string | null): void => {
    if (visited >= MAX_NODES || violations.length >= MAX_VIOLATIONS) {
      truncated = true;
      return;
    }
    visited += 1;

    if (typeof value === "string") {
      pushValueViolations(violations, value, path);
      return;
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) walk(value[i], `${path}[${i}]`, parentKey);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        const childPath = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}["${key}"]`;
        pushKeyViolation(violations, key, childPath, parentKey);
        walk(child, childPath, key);
      }
    }
  };

  walk(root, "$", null);
  return { passed: violations.length === 0, violations, truncated };
}

function renderScan(result: ScanResult): string {
  const head = `no_leak_scanner: passed=${result.passed} (${result.violations.length} violation(s)${result.truncated ? "; scan truncated" : ""})`;
  if (result.passed) {
    return `${head}\nNo forbidden leak shapes detected. (This is a dev aid, not a runtime guarantee.)`;
  }
  const lines = result.violations.map(
    (v) => `  - [${v.severity.toUpperCase()}] ${v.category} at ${v.path} — ${v.reason}`,
  );
  return [head, ...lines].join("\n");
}

function noLeakScan(args: Record<string, unknown>): string {
  const raw = args.json;
  let parsed: unknown;
  if (typeof raw === "string") {
    if (raw.length === 0) return "Error: 'json' is empty — pass a JSON string or object to scan.";
    if (raw.length > MAX_INPUT_CHARS) return `Error: input too large (> ${MAX_INPUT_CHARS} chars).`;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return "Error: 'json' is a string but not valid JSON. Pass a valid JSON string or an object.";
    }
  } else if (raw && typeof raw === "object") {
    parsed = raw;
  } else if (raw === undefined) {
    return "Error: 'json' is required (a JSON string or object — typically a diagnostic DTO sample).";
  } else {
    parsed = raw; // primitive — scanned as a leaf
  }
  return renderScan(scanForLeaks(parsed));
}

export const noLeakScannerTools: ToolDefinition[] = [
  {
    name: "no_leak_scanner",
    description:
      "DEV AID (not a runtime gate): scan a diagnostic DTO or sample JSON for forbidden leak shapes — credential keys/values (token/secret/password/bearer/api-key/private-key), raw config/output, trigger/event payloads, stack traces, raw DB/Postgres errors, and connection strings. Returns passed + violations[] (category / path / reason / severity). NEVER echoes a sensitive-looking value back — it reports the path + category only (credential values are matched via the same redactor used at egress).",
    inputSchema: {
      type: "object",
      properties: {
        json: {
          description: "A JSON string OR an object to scan (e.g. a diagnostic DTO sample).",
          type: ["string", "object"],
        },
      },
      required: ["json"],
      additionalProperties: false,
    },
    handler: noLeakScan,
  },
];
