import { NextRequest, NextResponse } from "next/server"
import { createClient } from '@supabase/supabase-js'

import { logger } from '@/lib/utils/logger'

// Initialize Supabase with service role for admin access
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    // TODO: Add proper admin authentication check here

    const body = await request.json()
    const { user_id, action, amount } = body

    if (!user_id || !action) {
      return errorResponse("Missing required parameters" , 400)
    }

    // Get current month dates
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    if (action === 'reset') {
      // Delete all current month records for the user
      const { error: deleteError } = await supabase
        .from('ai_cost_logs')
        .delete()
        .eq('user_id', user_id)
        .gte('created_at', startOfMonth.toISOString())
        .lte('created_at', endOfMonth.toISOString())

      if (deleteError) {
        logger.error('Error resetting balance:', deleteError)
        return errorResponse('Failed to reset balance' , 500)
      }

      return jsonResponse({
        success: true,
        message: 'Balance reset to $0.00',
        new_balance: 0
      })

    } else if (action === 'set' && amount !== undefined) {
      // First, get the current balance
      const { data: currentRecords, error: fetchError } = await supabase
        .from('ai_cost_logs')
        .select('cost')
        .eq('user_id', user_id)
        .gte('created_at', startOfMonth.toISOString())
        .lte('created_at', endOfMonth.toISOString())

      if (fetchError) {
        logger.error('Error fetching current balance:', fetchError)
        return errorResponse('Failed to fetch current balance' , 500)
      }

      const currentBalance = currentRecords?.reduce((sum, record) => sum + (parseFloat(record.cost) || 0), 0) || 0
      const difference = amount - currentBalance

      if (Math.abs(difference) < 0.000001) {
        // Balance is already at the target amount
        return jsonResponse({
          success: true,
          message: 'Balance already at target amount',
          new_balance: amount
        })
      }

      // Add an adjustment record to reach the target balance
      const { error: insertError } = await supabase
        .from('ai_cost_logs')
        .insert({
          user_id,
          model: 'adjustment',
          feature: 'admin_balance_adjustment',
          input_tokens: 0,
          output_tokens: 0,
          cost: difference.toFixed(6),
          calculated_cost: difference.toFixed(6),
          metadata: {
            adjustment_type: difference > 0 ? 'increase' : 'decrease',
            target_balance: amount,
            previous_balance: currentBalance,
            adjusted_by: 'admin',
            timestamp: new Date().toISOString()
          }
        })

      if (insertError) {
        logger.error('Error adjusting balance:', insertError)
        return errorResponse('Failed to adjust balance' , 500)
      }

      return jsonResponse({
        success: true,
        message: `Balance adjusted to $${amount.toFixed(2)}`,
        new_balance: amount,
        adjustment: difference
      })

    } 
      return errorResponse("Invalid action or missing amount" , 400)
    

  } catch (error) {
    logger.error("Error managing AI usage balance:", error)
    return errorResponse("Internal server error" , 500)
  }
}