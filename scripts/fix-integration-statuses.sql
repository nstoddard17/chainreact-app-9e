-- Function to fix integration statuses based on recent successful refreshes
CREATE OR REPLACE FUNCTION fix_integration_statuses(threshold_minutes integer DEFAULT 60)
RETURNS TABLE(count bigint) AS $$
BEGIN
  -- Update integrations that have had successful refreshes recently but have incorrect statuses
  WITH updated_rows AS (
    UPDATE integrations
    SET 
      status = 'connected',
      disconnect_reason = NULL
    WHERE 
      -- Has a recent successful refresh
      last_refresh_success IS NOT NULL 
      AND last_refresh_success > NOW() - (threshold_minutes * INTERVAL '1 minute')
      -- But status is not connected
      AND status != 'connected'
      -- And access token is not expired
      AND (expires_at IS NULL OR expires_at > NOW())
    RETURNING id
  )
  SELECT COUNT(*) INTO count FROM updated_rows;
  
  RETURN QUERY SELECT count;
END;
$$ LANGUAGE plpgsql; 