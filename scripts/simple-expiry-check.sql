-- Simple expired integration check
-- Shows 'good' or 'bad' status for each integration

SELECT 
  id,
  provider,
  status,
  expires_at,
  CASE 
    WHEN expires_at IS NULL THEN 'good'
    WHEN expires_at <= NOW() THEN 'bad'
    ELSE 'good'
  END as expiry_status
FROM integrations 
WHERE status = 'connected'
ORDER BY 
  CASE 
    WHEN expires_at IS NULL THEN 1
    WHEN expires_at <= NOW() THEN 0
    ELSE 2
  END,
  expires_at ASC;

-- Quick count of good vs bad
SELECT 
  CASE 
    WHEN expires_at IS NULL THEN 'good'
    WHEN expires_at <= NOW() THEN 'bad'
    ELSE 'good'
  END as status,
  COUNT(*) as count
FROM integrations 
WHERE status = 'connected'
GROUP BY 
  CASE 
    WHEN expires_at IS NULL THEN 'good'
    WHEN expires_at <= NOW() THEN 'bad'
    ELSE 'good'
  END; 