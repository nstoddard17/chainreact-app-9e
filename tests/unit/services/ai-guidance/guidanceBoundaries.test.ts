/**
 * @jest-environment node
 *
 * Guidance subsystem boundaries (provider-neutral; survives the HERMES-AGENT pivot).
 * Proves the guidance module cannot mutate workflows or reach private data: no source file imports
 * a mutation / repository / service-role / DB path. (The direct-Nous adapter, its config/flag, the
 * model prompt builder, and the OpenAI fallback policy were removed in the pivot — guidance now
 * only sanitizes, validates plans, and emits sanitized skill events; a future Hermes Agent client
 * will sit behind the `WorkflowGuidanceProvider` port.)
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = resolve(process.cwd(), "services/ai-guidance");

const FORBIDDEN = [
  /repositories\//,
  /updateDraftDefinition|applyRepairPatch|executeWorkflowPatch|saveDraftDefinition|createWorkflow/,
  /lifecycleOrchestrator|activateWorkflow|deactivateWorkflow|registerTrigger|runWorkflow/,
  /serviceRoleClient|SUPABASE_SERVICE_ROLE|@\/utils\/supabase|supabase\.from/,
  // Pivot guard: ChainReact must not call a hosted model API directly — that is Hermes Agent's job.
  /nousHermesAdapter|hostedHermesGuidanceProvider|HERMES_API_KEY|chat\/completions|new OpenAI/,
];

describe("ai-guidance — no workflow mutation / DB / service-role / direct-model surface", () => {
  it("no guidance source file imports a mutation, repository, DB, service-role, or direct-model path", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(4);
    for (const f of files) {
      const src = readFileSync(join(DIR, f), "utf8");
      for (const pat of FORBIDDEN) {
        expect({ file: f, matched: pat.test(src) }).toEqual({ file: f, matched: false });
      }
    }
  });
});
