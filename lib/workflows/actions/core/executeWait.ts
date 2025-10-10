import { createSupabaseServerClient } from "@/utils/supabase/server"

/**
 * Interface for action results
 */
export interface ActionResult {
  success: boolean
  output?: Record<string, any>
  metadata?: Record<string, any>
  selectedPaths?: string[]
  message?: string
  error?: string
  pauseExecution?: boolean
}

/**
 * Converts a duration to milliseconds based on the unit
 */
export function convertToMilliseconds(duration: number, unit: string): number {
  switch (unit) {
    case "seconds":
      return duration * 1000
    case "minutes":
      return duration * 60 * 1000
    case "hours":
      return duration * 60 * 60 * 1000
    case "days":
      return duration * 24 * 60 * 60 * 1000
    case "weeks":
      return duration * 7 * 24 * 60 * 60 * 1000
    default:
      return duration * 60 * 1000 // Default to minutes
  }
}

/**
 * Calculates the next business day and time based on business hours settings
 */
export function calculateBusinessHoursWait(
  now: Date, 
  startTime: string, 
  endTime: string, 
  businessDays: string[]
): Date {
  const [startHours, startMinutes] = startTime.split(':').map(Number)
  const [endHours, endMinutes] = endTime.split(':').map(Number)
  
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  const businessDayIndices = businessDays.map(day => dayNames.indexOf(day.toLowerCase()))
  
  const checkDate = new Date(now)
  
  // Find the next business day and time
  for (let i = 0; i < 14; i++) { // Check up to 2 weeks ahead
    const dayOfWeek = checkDate.getDay()
    
    if (businessDayIndices.includes(dayOfWeek)) {
      // This is a business day
      const businessStart = new Date(checkDate)
      businessStart.setHours(startHours, startMinutes, 0, 0)
      
      const businessEnd = new Date(checkDate)
      businessEnd.setHours(endHours, endMinutes, 0, 0)
      
      if (checkDate.getTime() === now.getTime()) {
        // Same day as now
        if (now < businessStart) {
          // Before business hours, wait until start
          return businessStart
        } else if (now < businessEnd) {
          // During business hours, continue immediately
          return now
        }
        // After business hours, check next day
      } else {
        // Future business day, wait until business hours start
        return businessStart
      }
    }
    
    // Move to next day
    checkDate.setDate(checkDate.getDate() + 1)
    checkDate.setHours(0, 0, 0, 0)
  }
  
  // Fallback: wait 24 hours
  return new Date(now.getTime() + 24 * 60 * 60 * 1000)
}

/**
 * Executes a wait-for-time action in a workflow
 * Supports different wait types: duration, until, business_hours
 */
export async function executeWaitForTime(
  config: any, 
  userId: string, 
  input: Record<string, any>, 
  context?: any
): Promise<ActionResult> {
  try {
    const waitType = config.waitType || "duration"
    const now = new Date()
    
    let waitUntil: Date
    let waitDurationMinutes = 0
    const targetTimezone = config.timezone || "UTC"
    
    if (waitType === "duration") {
      const duration = Number(config.duration) || 5
      const unit = config.unit || "minutes"
      waitDurationMinutes = unit === "minutes" ? duration : duration * (unit === "hours" ? 60 : unit === "days" ? 1440 : 1)
      waitUntil = new Date(now.getTime() + convertToMilliseconds(duration, unit))
    } 
    else if (waitType === "until") {
      const targetDate = config.date ? new Date(config.date) : new Date()
      const targetTime = config.time || "12:00"
      const [hours, minutes] = targetTime.split(":").map(Number)
      
      targetDate.setHours(hours, minutes, 0, 0)
      
      // If the target time is in the past, move to next day
      if (targetDate <= now) {
        targetDate.setDate(targetDate.getDate() + 1)
      }
      
      waitUntil = targetDate
      waitDurationMinutes = Math.round((waitUntil.getTime() - now.getTime()) / (60 * 1000))
    }
    else if (waitType === "business_hours") {
      const startTime = config.businessStartTime || "09:00"
      const endTime = config.businessEndTime || "17:00"
      const businessDays = config.businessDays || ["monday", "tuesday", "wednesday", "thursday", "friday"]
      
      waitUntil = calculateBusinessHoursWait(now, startTime, endTime, businessDays)
      waitDurationMinutes = Math.round((waitUntil.getTime() - now.getTime()) / (60 * 1000))
    }
    else {
      throw new Error(`Unknown wait type: ${waitType}`)
    }
    
    if (!context?.workflowId) {
      throw new Error("Workflow ID is required for wait actions")
    }
    
    // Create a scheduled execution record
    const supabase = await createSupabaseServerClient()
    
    const { data: scheduled, error } = await supabase
      .from("scheduled_executions")
      .insert({
        user_id: userId,
        workflow_id: context.workflowId,
        node_id: context.nodeId,
        execution_time: waitUntil.toISOString(),
        status: "pending",
        execution_data: {
          input,
          waitType,
          resumeFrom: context.nodeId
        }
      })
      .select()
      .single()
    
    if (error) {
      console.error("Failed to schedule execution:", error)
      throw new Error(`Failed to schedule execution: ${error.message}`)
    }
    
    // If we're in an active execution, update the execution record
    if (context.executionId) {
      await supabase
        .from("workflow_executions")
        .update({
          status: "paused",
          paused_at: new Date().toISOString(),
          paused_reason: "wait",
          paused_data: {
            scheduled_execution_id: scheduled.id,
            wait_until: waitUntil.toISOString(),
            wait_type: waitType
          }
        })
        .eq('id', context.executionId)
    }
    
    return {
      success: true,
      output: {
        ...input,
        waitScheduled: true,
        scheduledExecutionId: scheduled.id,
        waitType,
        waitUntil: waitUntil.toISOString(),
        waitDurationMinutes,
        timezone: targetTimezone,
        scheduledAt: new Date().toISOString()
      },
      message: `Wait scheduled - execution will resume in ${waitDurationMinutes} minutes at ${waitUntil.toLocaleString()}`,
      // Special flag to indicate this execution should pause here
      pauseExecution: true
    }
  } catch (error: any) {
    console.error("Wait for time execution error:", error)
    return { 
      success: false, 
      message: `Wait for time failed: ${error.message}` 
    }
  }
} 
