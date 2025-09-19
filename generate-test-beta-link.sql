-- Quick script to generate a beta tester invite link for testing
-- Replace 'test@example.com' with your test email

DO $$
DECLARE
    v_email TEXT := 'test@example.com';  -- CHANGE THIS to your test email
    v_token TEXT;
    v_signup_url TEXT;
BEGIN
    -- First, ensure the beta tester exists and is active
    INSERT INTO beta_testers (
        email,
        status,
        expires_at,
        max_workflows,
        max_executions_per_month,
        created_at
    ) VALUES (
        v_email,
        'active',
        NOW() + INTERVAL '30 days',
        50,
        5000,
        NOW()
    )
    ON CONFLICT (email) DO UPDATE
    SET
        status = 'active',
        expires_at = NOW() + INTERVAL '30 days',
        conversion_date = NULL,
        conversion_offer_sent_at = NOW();

    -- Generate the token (mimics the Node.js logic)
    v_token := encode(convert_to(v_email || ':' || extract(epoch from NOW())::text, 'UTF8'), 'base64');

    -- Update the beta tester with the token
    UPDATE beta_testers
    SET signup_token = v_token
    WHERE email = v_email;

    -- Generate the signup URL for localhost
    v_signup_url := 'http://localhost:3000/auth/beta-signup?token=' ||
                    v_token ||
                    '&email=' ||
                    replace(v_email, '@', '%40');

    -- Output the URL
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Beta Tester Invite Link Generated!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Email: %', v_email;
    RAISE NOTICE '';
    RAISE NOTICE 'Copy this URL to test the beta signup:';
    RAISE NOTICE '';
    RAISE NOTICE '%', v_signup_url;
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
END $$;