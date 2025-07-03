import { createSupabaseServerClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"
import { executeAction } from "@/lib/workflows/executeNode"

// This endpoint processes scheduled workflow executions (wait actions)
// It should be called by a cron job every minute
export async function GET(request: Request) {
  return await POST(request)
}

export async function POST(request: Request) {
  try {
    console.log("🔄 Processing scheduled workflow executions...")
    
    const supabase = await createSupabaseServerClient()
    const now = new Date().toISOString()
    
    // Find all scheduled executions that are ready to be processed
    const { data: scheduledExecutions, error: fetchError } = await supabase
      .from('scheduled_workflow_executions')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
      .limit(50) // Process up to 50 at a time
    
    if (fetchError) {
      console.error("❌ Error fetching scheduled executions:", fetchError)
      return NextResponse.json({ error: "Failed to fetch scheduled executions" }, { status: 500 })
    }
    
    if (!scheduledExecutions || scheduledExecutions.length === 0) {
      console.log("✅ No scheduled executions ready to process")
      return NextResponse.json({ 
        success: true, 
        message: "No scheduled executions ready to process",
        processed: 0 
      })
    }
    
    console.log(`📋 Found ${scheduledExecutions.length} scheduled executions to process`)
    
    let processed = 0
    let failed = 0
    
    // Process each scheduled execution
    for (const scheduledExecution of scheduledExecutions) {
      try {
        console.log(`⏰ Processing scheduled execution ${scheduledExecution.id}`)
        
        // Mark as processing
        await supabase
          .from('scheduled_workflow_executions')
          .update({ 
            status: 'processing',
            processed_at: new Date().toISOString()
          })
          .eq('id', scheduledExecution.id)
        
        // Get the workflow definition
        const { data: workflow, error: workflowError } = await supabase
          .from('workflows')
          .select('*')
          .eq('id', scheduledExecution.workflow_id)
          .single()
        
        if (workflowError || !workflow) {
          throw new Error(`Workflow not found: ${workflowError?.message}`)
        }
        
        // Find the next node to execute after the wait
        const nodes = workflow.nodes || []
        const edges = workflow.edges || []
        
        // Find edges coming from the current (wait) node
        const outgoingEdges = edges.filter((edge: any) => edge.source === scheduledExecution.current_node_id)
        
        if (outgoingEdges.length === 0) {
          console.log(`✅ Wait node ${scheduledExecution.current_node_id} has no outgoing connections - workflow complete`)
          
          // Mark scheduled execution as completed
          await supabase
            .from('scheduled_workflow_executions')
            .update({ 
              status: 'completed',
              completed_at: new Date().toISOString()
            })
            .eq('id', scheduledExecution.id)
          
          // Update main workflow execution as completed
          if (scheduledExecution.workflow_execution_id) {
            await supabase
              .from('workflow_executions')
              .update({ 
                status: 'success',
                completed_at: new Date().toISOString()
              })
              .eq('id', scheduledExecution.workflow_execution_id)
          }
          
          processed++
          continue
        }
        
        // Continue execution from the next node(s)
        let allSuccessful = true
        const executionResults = []
        
        for (const edge of outgoingEdges) {
          const nextNode = nodes.find((n: any) => n.id === edge.target)
          if (!nextNode) {
            console.warn(`⚠️ Next node ${edge.target} not found`)
            continue
          }
          
          console.log(`🚀 Continuing execution with node ${nextNode.id} (${nextNode.data?.type})`)
          
          // Execute the next node with the original input data plus wait results
          const executionResult = await executeAction({
            node: nextNode,
            input: {
              ...scheduledExecution.input_data,
              // Add wait completion data
              waitCompleted: true,
              waitScheduledAt: scheduledExecution.created_at,
              waitCompletedAt: new Date().toISOString(),
              waitConfig: scheduledExecution.wait_config
            },
            userId: scheduledExecution.user_id,
            workflowId: scheduledExecution.workflow_id
          })
          
          executionResults.push(executionResult)
          
          if (!executionResult.success) {
            allSuccessful = false
            console.error(`❌ Node ${nextNode.id} execution failed:`, executionResult.message || executionResult.error)
          } else {
            console.log(`✅ Node ${nextNode.id} executed successfully`)
          }
        }
        
        // Mark scheduled execution as completed
        await supabase
          .from('scheduled_workflow_executions')
          .update({ 
            status: allSuccessful ? 'completed' : 'failed',
            completed_at: new Date().toISOString(),
            error_message: allSuccessful ? null : 'One or more subsequent nodes failed'
          })
          .eq('id', scheduledExecution.id)
        
        // Update main workflow execution status
        if (scheduledExecution.workflow_execution_id) {
          await supabase
            .from('workflow_executions')
            .update({ 
              status: allSuccessful ? 'success' : 'error',
              completed_at: new Date().toISOString(),
              error_message: allSuccessful ? null : 'Workflow execution failed after wait completion'
            })
            .eq('id', scheduledExecution.workflow_execution_id)
        }
        
        processed++
        
      } catch (error) {
        console.error(`❌ Failed to process scheduled execution ${scheduledExecution.id}:`, error)
        failed++
        
        // Mark as failed and increment retry count
        const newRetryCount = (scheduledExecution.retry_count || 0) + 1
        const shouldRetry = newRetryCount <= scheduledExecution.max_retries
        
        await supabase
          .from('scheduled_workflow_executions')
          .update({ 
            status: shouldRetry ? 'scheduled' : 'failed',
            retry_count: newRetryCount,
            error_message: error instanceof Error ? error.message : 'Unknown error',
            // If retrying, schedule for 5 minutes from now
            scheduled_for: shouldRetry 
              ? new Date(Date.now() + 5 * 60 * 1000).toISOString()
              : scheduledExecution.scheduled_for
          })
          .eq('id', scheduledExecution.id)
      }
    }
    
    console.log(`✅ Processed ${processed} scheduled executions (${failed} failed)`)
    
    return NextResponse.json({ 
      success: true, 
      message: `Processed ${processed} scheduled executions`,
      processed,
      failed
    })
    
  } catch (error) {
    console.error("❌ Error processing scheduled executions:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Internal server error" 
    }, { status: 500 })
  }
} 