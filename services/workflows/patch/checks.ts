import type { FieldMeta } from "@/contracts/actionMeta";
import type {
  WorkflowDefinition,
  WorkflowNode,
} from "@/contracts/workflowDefinition";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";
import type {
  PatchValidationError,
  PatchValidationWarning,
} from "./types";

/**
 * Structural + registry/config + branch-label checks for a candidate
 * WorkflowDefinition produced by a patch (Slice 4.AI-3). All pure — registry
 * reads are against the frozen, in-memory discovery registry; no DB, no
 * provider calls, no AI.
 *
 * Config validation is FieldMeta-guided, NOT full handler-Zod: V2 has no clean
 * `provider:type → Zod schema` lookup (handler schemas validate at dispatch),
 * so this catches required-field + declared-type errors early and flags
 * undeclared fields as WARNINGS (the handler's strict schema is the
 * authoritative rejecter at apply/run time). Documented gap.
 *
 * Variable-reference checks live in ./variableChecks; risk classification in
 * ./riskClassification.
 */

// ─── Structural checks (clean typed codes the WorkflowDefinitionSchema can't give) ──

export function checkStructure(
  candidate: WorkflowDefinition,
): PatchValidationError[] {
  const errors: PatchValidationError[] = [];
  const nodeIds = new Set<string>();
  for (const n of candidate.nodes) {
    if (nodeIds.has(n.id)) {
      errors.push({
        code: "DUPLICATE_NODE_ID",
        message: `Two nodes share the id '${n.id}'.`,
        nodeId: n.id,
      });
    }
    nodeIds.add(n.id);
  }

  const triggerCount = candidate.nodes.filter((n) => n.kind === "trigger").length;
  if (triggerCount > 1) {
    errors.push({
      code: "MULTIPLE_TRIGGERS",
      message: `A workflow may have at most one trigger node (found ${triggerCount}).`,
    });
  }

  const edgeIds = new Set<string>();
  const edgeKeys = new Set<string>();
  for (const e of candidate.edges) {
    if (edgeIds.has(e.id)) {
      errors.push({
        code: "DUPLICATE_EDGE_ID",
        message: `Two edges share the id '${e.id}'.`,
        edgeId: e.id,
      });
    }
    edgeIds.add(e.id);

    if (e.from === e.to) {
      errors.push({
        code: "INVALID_EDGE",
        message: `Edge '${e.id}' is a self-loop (from === to).`,
        edgeId: e.id,
      });
    }
    if (!nodeIds.has(e.from)) {
      errors.push({
        code: "INVALID_EDGE",
        message: `Edge '${e.id}' references unknown source node '${e.from}'.`,
        edgeId: e.id,
      });
    }
    if (!nodeIds.has(e.to)) {
      errors.push({
        code: "INVALID_EDGE",
        message: `Edge '${e.id}' references unknown target node '${e.to}'.`,
        edgeId: e.id,
      });
    }
    const key = `${e.from}->${e.to}::${e.label ?? ""}`;
    if (edgeKeys.has(key)) {
      errors.push({
        code: "INVALID_EDGE",
        message: e.label
          ? `Duplicate edge from '${e.from}' to '${e.to}' with label '${e.label}'.`
          : `Duplicate edge from '${e.from}' to '${e.to}'.`,
        edgeId: e.id,
      });
    }
    edgeKeys.add(key);
  }
  return errors;
}

// ─── Registry grounding + config (FieldMeta) ─────────────────────────────────

function fieldTypeMatches(field: FieldMeta, value: unknown): boolean {
  // Variable templates / AI_FIELD resolve at runtime — type is unknowable now.
  if (typeof value === "string" && value.includes("{{")) return true;
  if (field.multiple) return Array.isArray(value);
  switch (field.type) {
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "string-array":
      // Multi-recipient / list fields accept either a string[] or a CSV
      // string (the handler routes through parseRecipients, which splits
      // CSV). Accept both rather than false-rejecting a valid CSV value.
      return Array.isArray(value) || typeof value === "string";
    case "file-array":
    case "router-routes":
      return Array.isArray(value);
    case "keyvalue":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "text":
    case "textarea":
    case "select":
    case "combobox":
    case "cron":
    case "file":
      return typeof value === "string";
    default:
      return true;
  }
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * Validate one node's existence in the registry + its config against the
 * action/trigger FieldMeta. Returns typed errors + warnings.
 */
export function checkNodeRegistryAndConfig(node: WorkflowNode): {
  errors: PatchValidationError[];
  warnings: PatchValidationWarning[];
} {
  const errors: PatchValidationError[] = [];
  const warnings: PatchValidationWarning[] = [];
  const key = `${node.provider}:${node.type}`;
  const meta =
    node.kind === "trigger" ? getTriggerMeta(key) : getActionMeta(key);

  if (!meta) {
    errors.push({
      code: node.kind === "trigger" ? "UNKNOWN_TRIGGER" : "UNKNOWN_ACTION",
      message: `'${key}' is not a registered ${node.kind}. The agent cannot use a ${node.kind} that V2 does not expose.`,
      nodeId: node.id,
    });
    return { errors, warnings };
  }

  const fieldByName = new Map(meta.fields.map((f) => [f.name, f]));

  for (const f of meta.fields) {
    if (f.required && isEmpty(node.config[f.name])) {
      errors.push({
        code: "MISSING_REQUIRED_FIELD",
        message: `Required field '${f.name}' is missing on ${key}.`,
        nodeId: node.id,
        path: f.name,
      });
    }
  }

  for (const fieldName of Object.keys(node.config)) {
    const field = fieldByName.get(fieldName);
    if (!field) {
      warnings.push({
        code: "UNKNOWN_CONFIG_FIELD",
        message: `Field '${fieldName}' is not declared in ${key} metadata; the handler's strict schema validates it authoritatively at apply/run time.`,
        nodeId: node.id,
      });
      continue;
    }
    const value = node.config[fieldName];
    if (isEmpty(value)) continue;
    if (!fieldTypeMatches(field, value)) {
      errors.push({
        code: "INVALID_CONFIG",
        message: `Field '${fieldName}' on ${key} expects type '${field.type}'.`,
        nodeId: node.id,
        path: fieldName,
      });
    }
  }

  return { errors, warnings };
}

// ─── Branch-label sanity (route-membership validation deferred) ───────────────

const BRANCHING_TYPES = new Set(["native:router", "native:if_then_condition"]);

export function checkBranchLabels(
  candidate: WorkflowDefinition,
): PatchValidationWarning[] {
  const warnings: PatchValidationWarning[] = [];
  const nodesById = new Map(candidate.nodes.map((n) => [n.id, n]));
  for (const e of candidate.edges) {
    if (e.label === undefined) continue;
    const source = nodesById.get(e.from);
    if (!source) continue; // INVALID_EDGE already covers missing endpoints
    if (!BRANCHING_TYPES.has(`${source.provider}:${source.type}`)) {
      warnings.push({
        code: "SUSPICIOUS_BRANCH_LABEL",
        message: `Edge '${e.id}' has branch label '${e.label}' but its source '${e.from}' is not a branching node (router / if_then_condition). Route-membership validation is a follow-up.`,
        edgeId: e.id,
      });
    }
  }
  return warnings;
}
