import type {
  AgentWorkflowDiagnosisDTO,
} from "./diagnoseWorkflowForAgent";

/**
 * Allow-list projector for the LLM diagnosis explainer (Slice 4.AI-DIAG-2a).
 *
 * Pure, dependency-free. Maps the (already-sanitized) `AgentWorkflowDiagnosisDTO`
 * to the MINIMAL safe context the LLM is allowed to see. It is defense-in-depth:
 * the DTO is already safe-by-construction, but this projector is the single,
 * explicit allow-list seam — a no-leak test pins exactly which fields leave.
 *
 * INCLUDED (all human-meaningful + already client-visible): readiness booleans,
 * `summaryText`, `nextSteps`, and per finding `code` / `source` / `severity` /
 * `title` / `provider` (public id) / `providerName` (public label) / `missingFields`
 * (NAMES) / `missingScopes` (public constants) / `credentialClass`, plus the latest
 * run's safe humanized classification + status.
 *
 * EXCLUDED — never placed in the model prompt (Q4 / owner constraints): node ids,
 * the workflow id, run ids, `firstFailedNodeId`, `classificationAvailable`, and the
 * entire space of raw config / tokens / integration rows / providerAccountId /
 * provider account labels / account metadata / connectedByUserId / trigger payloads /
 * PII (none reachable from the DTO type anyway).
 */

export interface DiagnosisExplainFinding {
  readonly source: string;
  readonly code: string;
  readonly severity: string;
  readonly title: string;
  readonly provider?: string;
  readonly providerName?: string | null;
  readonly missingFields?: readonly string[];
  readonly missingScopes?: readonly string[];
  readonly credentialClass?: string;
}

export interface DiagnosisExplainLatestRun {
  readonly status: string;
  readonly classification?: {
    readonly title: string;
    readonly description: string;
    readonly hint?: string;
    readonly action?: string;
    readonly severity: string;
  };
}

export interface DiagnosisExplainContext {
  readonly overallReady?: boolean;
  readonly runnable?: boolean;
  readonly allRequiredConnected?: boolean;
  readonly summaryText?: string;
  readonly nextSteps?: readonly string[];
  readonly findings: readonly DiagnosisExplainFinding[];
  readonly latestRun?: DiagnosisExplainLatestRun;
}

/**
 * Project an access==="OK" diagnosis DTO into the safe explain context. (For a
 * non-OK DTO the route returns the access wall and never calls this.) Constructs
 * the output field-by-field — it NEVER spreads the DTO, so an unexpected/extra
 * field on the input can't leak through.
 */
export function buildDiagnosisExplainContext(
  dto: AgentWorkflowDiagnosisDTO,
): DiagnosisExplainContext {
  const findings: DiagnosisExplainFinding[] = (dto.findings ?? []).map((f) => ({
    source: f.source,
    code: f.code,
    severity: f.severity,
    title: f.title,
    ...(f.provider !== undefined ? { provider: f.provider } : {}),
    ...(f.providerName !== undefined ? { providerName: f.providerName } : {}),
    ...(f.missingFields !== undefined ? { missingFields: f.missingFields } : {}),
    ...(f.missingScopes !== undefined ? { missingScopes: f.missingScopes } : {}),
    ...(f.credentialClass !== undefined ? { credentialClass: f.credentialClass } : {}),
  }));

  const cls = dto.latestRun?.errorClassification;
  const latestRun: DiagnosisExplainLatestRun | undefined = dto.latestRun
    ? {
        status: dto.latestRun.status,
        ...(cls
          ? {
              classification: {
                title: cls.title,
                description: cls.description,
                ...(cls.hint !== undefined ? { hint: cls.hint } : {}),
                ...(cls.action !== undefined ? { action: cls.action } : {}),
                severity: cls.severity,
              },
            }
          : {}),
      }
    : undefined;

  return {
    ...(dto.overallReady !== undefined ? { overallReady: dto.overallReady } : {}),
    ...(dto.runnable !== undefined ? { runnable: dto.runnable } : {}),
    ...(dto.allRequiredConnected !== undefined
      ? { allRequiredConnected: dto.allRequiredConnected }
      : {}),
    ...(dto.summaryText !== undefined ? { summaryText: dto.summaryText } : {}),
    ...(dto.nextSteps !== undefined ? { nextSteps: dto.nextSteps } : {}),
    findings,
    ...(latestRun ? { latestRun } : {}),
  };
}
