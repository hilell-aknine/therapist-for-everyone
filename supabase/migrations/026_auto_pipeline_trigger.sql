-- ============================================================================
-- Migration 026: Auto-create sales_leads from questionnaire_submissions
-- Every new questionnaire submission automatically enters the sales pipeline.
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_pipeline_lead()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO sales_leads (
        questionnaire_id,
        full_name,
        phone,
        email,
        occupation,
        stage,
        call_attempts
    ) VALUES (
        NEW.id,
        NEW.full_name,
        NEW.phone,
        NEW.email,
        NEW.occupation,
        'new_lead',
        0
    )
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_auto_pipeline_on_questionnaire
    AFTER INSERT ON questionnaire_submissions
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_pipeline_lead();

-- Also backfill: create pipeline leads for existing questionnaires that aren't in pipeline yet
INSERT INTO sales_leads (questionnaire_id, full_name, phone, email, occupation, stage, call_attempts)
SELECT q.id, q.full_name, q.phone, q.email, q.occupation, 'new_lead', 0
FROM questionnaire_submissions q
WHERE NOT EXISTS (
    SELECT 1 FROM sales_leads s WHERE s.questionnaire_id = q.id
);
