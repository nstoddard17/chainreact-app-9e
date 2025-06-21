import { NextResponse } from 'next/server';
import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine';
import { createClient } from '@supabase/supabase-js';

export async function POST(
  request: Request,
  { params }: { params: { workflowId: string } }
) {
  const { workflowId } = params;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('user_id, nodes')
      .eq('id', workflowId)
      .single();

    if (workflowError || !workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }
    
    const triggerNode = workflow.nodes.find((node: any) => node.data.isTrigger && node.data.triggerType === 'webhook');

    if (!triggerNode) {
      return NextResponse.json({ error: 'No webhook trigger found for this workflow' }, { status: 400 });
    }

    const payload = await request.json();

    // TODO: Add payload validation against the `payloadSchema` defined in the trigger node.

    const executionEngine = new AdvancedExecutionEngine();
    const executionSession = await executionEngine.createExecutionSession(
      workflowId,
      workflow.user_id,
      'webhook',
      { inputData: payload }
    );

    // Asynchronously execute the workflow without waiting for it to complete
    executionEngine.executeWorkflowAdvanced(executionSession.id, payload);

    return NextResponse.json({ success: true, sessionId: executionSession.id });
  } catch (error: any) {
    console.error(`Webhook error for workflow ${workflowId}:`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: Request, { params }: { params: { workflowId: string } }) {
  return NextResponse.json({
    message: "Webhook endpoint active",
    workflowId: params.workflowId,
    methods: ["POST"],
  })
}
