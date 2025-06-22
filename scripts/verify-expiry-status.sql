-- Verify integration statuses, accounting for potential timezone issues.
-- This script compares the database's current UTC time against the stored expiry dates.

-- Get the current time from the database (in UTC)
SELECT NOW() as current_database_time_utc;

-- Check the status of each integration for your user, comparing against the database's UTC time.
SELECT
    provider,
    status as db_status,
    expires_at,
    -- This is how the status SHOULD be calculated, using pure UTC time.
    CASE
        WHEN status != 'connected' THEN status
        WHEN expires_at IS NULL THEN 'connected' -- No expiry (e.g., API Key, GitHub)
        WHEN expires_at < NOW() THEN 'expired'
        WHEN expires_at < NOW() + INTERVAL '10 minutes' THEN 'expiring'
        ELSE 'connected'
    END as calculated_status,
    -- Show the raw time difference for debugging
    (expires_at - NOW()) as time_until_expiry
FROM
    integrations
WHERE
    user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
ORDER BY
    -- Put potentially problematic ones on top
    CASE
        WHEN expires_at < NOW() + INTERVAL '10 minutes' THEN 1
        ELSE 2
    END,
    provider;

-- Count the calculated statuses to compare with the UI
SELECT
    calculated_status,
    COUNT(*)
FROM (
    SELECT
        CASE
            WHEN status != 'connected' THEN status
            WHEN expires_at IS NULL THEN 'connected'
            WHEN expires_at < NOW() THEN 'expired'
            WHEN expires_at < NOW() + INTERVAL '10 minutes' THEN 'expiring'
            ELSE 'connected'
        END as calculated_status
    FROM
        integrations
    WHERE
        user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
) as status_calc
GROUP BY
    calculated_status;
