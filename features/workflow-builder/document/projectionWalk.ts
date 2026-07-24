import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import type { BranchWiringIssue } from "@/core/workflows/branchWiring";
import type { DocumentBlock, ProjectionMeta } from "./documentModel";

/**
 * Document Builder — shared traversal types (5.DUAL-BUILDER-1 CS-2).
 *
 * Extracted so `projection.ts` (segment walk) and `projectionFork.ts` (fork
 * walk) can reference one another's contracts without a cycle.
 */

export interface WalkContext {
  readonly byId: ReadonlyMap<string, WorkflowNode>;
  readonly outgoing: ReadonlyMap<string, WorkflowEdge[]>;
  readonly indegree: ReadonlyMap<string, number>;
  readonly visited: Set<string>;
  readonly visitOrder: string[];
  readonly meta: ProjectionMeta;
  readonly wiringIssuesByNode: ReadonlyMap<string, readonly BranchWiringIssue[]>;
}

export interface SegmentResult {
  readonly blocks: DocumentBlock[];
  /**
   * The join node this segment stopped BEFORE (not emitted, not visited) —
   * bubbled up so the enclosing fork can prove a single rejoin. Null when the
   * segment is terminal (path ends or degraded into a complex region).
   */
  readonly exit: string | null;
}

export interface ForkResult {
  readonly blocks: DocumentBlock[];
  /** Rejoin node to continue the enclosing segment at (proven safe to visit next). */
  readonly continueAt: string | null;
  /** Bubbled join when the rejoin belongs to an enclosing fork. */
  readonly exit: string | null;
}
