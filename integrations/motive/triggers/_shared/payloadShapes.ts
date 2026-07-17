import type { OutputMeta } from "@/contracts/triggerMeta";

/**
 * Shared base payload fields present on every Motive webhook trigger — MOTIVE-1.
 * Spread into each trigger's `payloadShape` before its type-specific fields.
 * Motive events are compact — chain a Get/List action for full detail.
 */
export const MOTIVE_BASE_TRIGGER_PAYLOAD: readonly OutputMeta[] = [
  {
    name: "changeKind",
    type: "string",
    description: "The V2 trigger type (e.g. 'new_inspection_report').",
  },
  {
    name: "action",
    type: "string",
    description: "The raw Motive event action string.",
    nullable: true,
  },
  {
    name: "companyId",
    type: "string",
    description: "The Motive company the event belongs to.",
  },
  {
    name: "occurredAt",
    type: "string",
    description: "When the event occurred (or receipt time when absent).",
  },
];
