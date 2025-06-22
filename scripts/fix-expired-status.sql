-- Fix integrations that have expired tokens but still show as 'connected'
-- This script updates the status to 'expired' for integrations where:
-- 1. status = 'connected' 
-- 2. expires_at <= NOW() (token has expired)

-- First, show what will be updated
SELECT 
  id,
  user_id,
  provider,
  status as current_status,
  expires_at,
  expires_at - NOW() as time_since_expiry
FROM integrations 
WHERE status = 'connected' 
  AND expires_at IS NOT NULL 
  AND expires_at <= NOW();

-- Update the status to 'expired' for these integrations
UPDATE integrations 
SET 
  status = 'expired',
  updated_at = NOW()
WHERE status = 'connected' 
  AND expires_at IS NOT NULL 
  AND expires_at <= NOW();

-- Show the results after update
SELECT 
  'Updated to expired' as action,
  COUNT(*) as count,
  STRING_AGG(provider, ', ') as providers
FROM integrations 
WHERE status = 'expired' 
  AND updated_at >= NOW() - INTERVAL '1 minute';

-- Show current health status after fix
SELECT 
  'after_fix' as status,
  COUNT(*) as total_integrations,
  COUNT(*) FILTER (WHERE status = 'connected' AND (expires_at IS NULL OR expires_at > NOW())) as healthy,
  COUNT(*) FILTER (WHERE status = 'connected' AND expires_at <= NOW()) as expired_but_connected,
  COUNT(*) FILTER (WHERE status = 'expired') as expired_status,
  COUNT(*) FILTER (WHERE status = 'disconnected') as disconnected,
  ROUND(
    (COUNT(*) FILTER (WHERE status = 'connected' AND (expires_at IS NULL OR expires_at > NOW()))::numeric / COUNT(*)::numeric) * 100, 
    1
  ) as health_percentage
FROM integrations;
