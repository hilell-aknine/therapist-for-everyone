-- Verify cron job exists (this is a no-op check migration)
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT count(*) INTO v_count FROM cron.job WHERE jobname = 'capi-queue-process';
    IF v_count = 0 THEN
        RAISE EXCEPTION 'capi-queue-process cron job not found!';
    ELSE
        RAISE NOTICE 'capi-queue-process cron job verified (% job(s) found)', v_count;
    END IF;
END $$;
