/**
 * Internal MCP server — shared types + helpers for the composite doctor tools
 * (Phase C-2). Pure/local (no app import, no I/O). Extracted from `tools/doctors.ts`
 * for file-size hygiene; the doctors compose this with the gated transport +
 * `providerStatics`.
 */

export type DoctorStatus = "healthy" | "warning" | "blocked" | "unknown";
export type SectionStatus = "ok" | "warning" | "blocked" | "unavailable";

export interface Section {
  readonly name: string;
  readonly status: SectionStatus;
  readonly summary: string;
  readonly findings?: readonly string[];
}

export interface DoctorResult {
  readonly overall: DoctorStatus;
  readonly sections: readonly Section[];
  readonly nextSteps: readonly string[];
  readonly sourceTools: readonly string[];
  readonly unavailable: ReadonlyArray<{ section: string; reason: string }>;
}

/** Worst-wins overall status across the available section statuses (pure). */
export function aggregateOverall(statuses: readonly SectionStatus[]): DoctorStatus {
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("warning")) return "warning";
  if (statuses.includes("ok")) return "healthy";
  return "unknown";
}

export function renderDoctor(title: string, r: DoctorResult): string {
  const lines: string[] = [
    title,
    `overall: ${r.overall}`,
    `sources: ${r.sourceTools.join(", ") || "(none)"}`,
    "sections:",
  ];
  for (const s of r.sections) {
    lines.push(`  [${s.status.toUpperCase()}] ${s.name}: ${s.summary}`);
    for (const f of s.findings ?? []) lines.push(`      - ${f}`);
  }
  if (r.unavailable.length) {
    lines.push("unavailable:");
    for (const u of r.unavailable) lines.push(`  - ${u.section}: ${u.reason}`);
  }
  if (r.nextSteps.length) {
    lines.push("nextSteps:");
    r.nextSteps.forEach((n, i) => lines.push(`  ${i + 1}. ${n}`));
  } else {
    lines.push("nextSteps: (none — nothing actionable detected)");
  }
  return lines.join("\n");
}

export const ACCESS_WALL: Record<string, { status: DoctorStatus; reason: string }> = {
  NOT_FOUND: { status: "unknown", reason: "no workflow resolved for this id (it does not exist or is not visible)" },
  NO_ACCOUNT_ACCESS: { status: "blocked", reason: "the subject is not a member of this workflow's account; nothing is revealed" },
};

/** A connection status that means "connected & usable". */
export const CONNECTED = "CONNECTED";

export function dedup(items: readonly string[]): string[] {
  return [...new Set(items)];
}

// ── DTO mirrors of the already-sanitized route responses (no app import) ──

export interface ReadinessDTO {
  access: string;
  runnable?: boolean;
  readinessError?: string | null;
}
export interface GraphFinding {
  kind: string;
  severity: string;
  nodeId?: string;
  displayName?: string;
  edgeId?: string;
  provider?: string;
  nodeType?: string;
  missingFields?: string[];
  token?: string;
}
export interface GraphDTO {
  access: string;
  structurallyValid?: boolean;
  nodeCount?: number;
  edgeCount?: number;
  findings?: GraphFinding[];
}
export interface ConnProvider {
  provider: string;
  name: string | null;
  credentialClass: string;
  status: string;
  ready: boolean;
  nodeCount: number;
}
export interface ConnectionsDTO {
  access: string;
  allRequiredConnected?: boolean;
  providers?: ConnProvider[];
}
export interface RunFailureDTO {
  runId: string;
  visibility: string;
  status?: string;
  firstFailedNodeId?: string | null;
  failedStepCount?: number;
  classificationAvailable?: boolean;
  errorClassification?: { title: string; description: string; action?: string; severity: string } | null;
}
export interface IntegrationConnectionDTO {
  ok: boolean;
  provider: string;
  accountId: string | null;
  status: string;
  activeConnectionCount: number;
  providerEnabled: boolean;
  refreshable: boolean;
  credentialClass: string;
  tokenExpired: boolean | null;
  scopesSatisfied: boolean;
  missingScopeCount: number;
}

/** One-line safe description of a graph finding (ids / labels / field names only). */
export function describeGraphFinding(f: GraphFinding): string {
  const target = f.edgeId
    ? `edge ${f.edgeId}`
    : f.nodeId
      ? `node ${f.nodeId}${f.displayName ? ` (${f.displayName})` : ""}`
      : "(workflow)";
  const extra = f.missingFields?.length ? ` — ${f.missingFields.join(", ")}` : f.token ? ` — ${f.token}` : "";
  return `[${f.severity}] ${f.kind}: ${target}${extra}`;
}

/** Derive actionable next steps from graph findings (safe text only). */
export function graphNextSteps(findings: readonly GraphFinding[]): string[] {
  const out: string[] = [];
  for (const f of findings) {
    if (f.kind === "NO_TRIGGER") out.push("Add a trigger to the workflow.");
    else if (f.kind === "STALE_EDGE") out.push(`Remove the stale connection (${f.edgeId ?? "edge"}) and reconnect the steps.`);
    else if (f.kind === "UNREACHABLE_NODE") out.push(`Connect '${f.displayName ?? f.nodeId}' to the trigger so it runs.`);
    else if (f.kind === "MISSING_REQUIRED_FIELDS") out.push(`Fill required fields on '${f.displayName ?? f.nodeId}': ${(f.missingFields ?? []).join(", ")}.`);
    else if (f.kind === "UNRESOLVED_REFERENCE") out.push(`Fix the broken reference ${f.token ?? ""} on node ${f.nodeId}.`);
    else if (f.kind === "UNSUPPORTED_NODE") out.push(`Replace the unsupported node ${f.nodeId} (${f.provider}:${f.nodeType}).`);
  }
  return out;
}
