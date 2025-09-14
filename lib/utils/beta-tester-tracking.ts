import { createClient } from "@/utils/supabaseClient"

interface TrackingOptions {
  userId: string
  activityType: 'workflow_created' | 'workflow_executed' | 'workflow_deleted' | 'integration_connected' | 'integration_disconnected' | 'login' | 'feedback_submitted' | 'setting_changed'
  activityData?: any
}

/**
 * Track beta tester activity
 * Only tracks if user has beta-pro role
 */
export async function trackBetaTesterActivity(options: TrackingOptions) {
  try {
    const supabase = createClient()

    // First check if user is a beta tester
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, email')
      .eq('id', options.userId)
      .single()

    if (!profile || profile.role !== 'beta-pro') {
      return // Not a beta tester, don't track
    }

    // Check if beta tester record exists
    const { data: betaTester } = await supabase
      .from('beta_testers')
      .select('id')
      .eq('email', profile.email)
      .single()

    if (!betaTester) {
      // Create beta tester record if it doesn't exist
      const { data: newBetaTester, error: createError } = await supabase
        .from('beta_testers')
        .insert({
          email: profile.email,
          status: 'active',
          notes: 'Auto-created from activity tracking'
        })
        .select()
        .single()

      if (createError) {
        console.error('Error creating beta tester record:', createError)
        return
      }

      // Log activity
      await supabase
        .from('beta_tester_activity')
        .insert({
          beta_tester_id: newBetaTester.id,
          user_id: options.userId,
          activity_type: options.activityType,
          activity_data: options.activityData
        })
    } else {
      // Log activity
      await supabase
        .from('beta_tester_activity')
        .insert({
          beta_tester_id: betaTester.id,
          user_id: options.userId,
          activity_type: options.activityType,
          activity_data: options.activityData
        })

      // Update last active timestamp
      await supabase
        .from('beta_testers')
        .update({
          last_active_at: new Date().toISOString()
        })
        .eq('id', betaTester.id)
    }

    // Update usage stats based on activity type
    if (options.activityType === 'workflow_created') {
      await supabase.rpc('increment_beta_tester_stat', {
        tester_email: profile.email,
        stat_name: 'total_workflows_created',
        increment_by: 1
      })
    } else if (options.activityType === 'workflow_executed') {
      await supabase.rpc('increment_beta_tester_stat', {
        tester_email: profile.email,
        stat_name: 'total_executions',
        increment_by: 1
      })
    }
  } catch (error) {
    // Fail silently - we don't want tracking errors to break the app
    console.error('Beta tester activity tracking error:', error)
  }
}

/**
 * Submit feedback from a beta tester
 */
export async function submitBetaTesterFeedback({
  userId,
  feedbackType = 'general',
  subject,
  message,
  rating
}: {
  userId: string
  feedbackType?: string
  subject?: string
  message: string
  rating?: number
}) {
  try {
    const supabase = createClient()

    // Check if user is a beta tester
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, email')
      .eq('id', userId)
      .single()

    if (!profile || profile.role !== 'beta-pro') {
      return { error: 'Not a beta tester' }
    }

    // Get beta tester record
    const { data: betaTester } = await supabase
      .from('beta_testers')
      .select('id')
      .eq('email', profile.email)
      .single()

    if (!betaTester) {
      return { error: 'Beta tester record not found' }
    }

    // Submit feedback
    const { error } = await supabase
      .from('beta_tester_feedback')
      .insert({
        beta_tester_id: betaTester.id,
        user_id: userId,
        feedback_type: feedbackType,
        subject,
        message,
        rating
      })

    if (error) {
      return { error: error.message }
    }

    // Increment feedback count
    await supabase.rpc('increment_beta_tester_stat', {
      tester_email: profile.email,
      stat_name: 'feedback_count',
      increment_by: 1
    })

    // Track the feedback submission as an activity
    await trackBetaTesterActivity({
      userId,
      activityType: 'feedback_submitted',
      activityData: { feedbackType, subject }
    })

    return { success: true }
  } catch (error: any) {
    console.error('Error submitting beta tester feedback:', error)
    return { error: error.message }
  }
}