import { NextResponse } from "next/server";
import { AI_PROVIDER_ID } from "@/core/integrations/connectionlessProviders";
import { isAiProcessorEnabled } from "@/services/ai/processor/config";
import { listActionMetasForProvider } from "@/services/discovery/_registry";
import { requireUser } from "../../providers/_shared";

/**
 * GET /api/ai/actions — list ChainReact AI action metadata.
 *
 * Mirrors `/api/native/actions`: same response shape so the typed client
 * shares its decoder, same auth gate, no database access, no connection
 * lookup, no AI execution, no billing. Read-only metadata.
 *
 * VISIBILITY (AI-PROVIDER-4 CS-4): the AI provider must never look
 * available while its execution path is disabled. `AI_PROCESSOR_ENABLED`
 * is a SERVER-only variable, so the gate lives here — a disabled processor
 * returns an empty catalog and the builder's picker hides the section. The
 * client learns "there is nothing to show", never the env var itself.
 *
 * An empty list is therefore a normal state in CS-4 (no AI actions are
 * registered yet — the handlers land in CS-5/CS-6) AND whenever the
 * processor is off. No placeholder actions are invented to fill it.
 */

export async function GET(): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    provider: AI_PROVIDER_ID,
    actions: isAiProcessorEnabled()
      ? listActionMetasForProvider(AI_PROVIDER_ID)
      : [],
  });
}
