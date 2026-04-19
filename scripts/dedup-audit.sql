-- ============================================================================
-- Dedup Audit Script — Same-Table Duplicates Only
-- Run manually via Supabase SQL Editor. DO NOT use as a migration.
--
-- Cross-table "duplicates" are LEGITIMATE (same person can be a patient,
-- learner, and training lead). This script only flags same phone appearing
-- 2+ times in the SAME table.
-- ============================================================================

-- ============================================================================
-- STEP 1: AUDIT — Show all same-table duplicates (review before deleting)
-- ============================================================================

-- === patients ===
SELECT '=== patients duplicates ===' AS section;
SELECT phone, COUNT(*) AS cnt,
       array_agg(id ORDER BY created_at) AS ids,
       array_agg(full_name ORDER BY created_at) AS names,
       array_agg(created_at ORDER BY created_at) AS dates,
       array_agg(status ORDER BY created_at) AS statuses
FROM patients
WHERE phone IS NOT NULL AND phone != ''
GROUP BY phone
HAVING COUNT(*) > 1
ORDER BY cnt DESC;

-- === therapists ===
SELECT '=== therapists duplicates ===' AS section;
SELECT phone, COUNT(*) AS cnt,
       array_agg(id ORDER BY created_at) AS ids,
       array_agg(full_name ORDER BY created_at) AS names,
       array_agg(created_at ORDER BY created_at) AS dates,
       array_agg(status ORDER BY created_at) AS statuses
FROM therapists
WHERE phone IS NOT NULL AND phone != ''
GROUP BY phone
HAVING COUNT(*) > 1
ORDER BY cnt DESC;

-- === contact_requests ===
SELECT '=== contact_requests duplicates ===' AS section;
SELECT phone, COUNT(*) AS cnt,
       array_agg(id ORDER BY created_at) AS ids,
       array_agg(full_name ORDER BY created_at) AS names,
       array_agg(created_at ORDER BY created_at) AS dates,
       array_agg(status ORDER BY created_at) AS statuses
FROM contact_requests
WHERE phone IS NOT NULL AND phone != ''
GROUP BY phone
HAVING COUNT(*) > 1
ORDER BY cnt DESC;

-- === sales_leads ===
SELECT '=== sales_leads duplicates ===' AS section;
SELECT phone, COUNT(*) AS cnt,
       array_agg(id ORDER BY created_at) AS ids,
       array_agg(full_name ORDER BY created_at) AS names,
       array_agg(created_at ORDER BY created_at) AS dates,
       array_agg(stage ORDER BY created_at) AS stages
FROM sales_leads
WHERE phone IS NOT NULL AND phone != ''
GROUP BY phone
HAVING COUNT(*) > 1
ORDER BY cnt DESC;

-- === SUMMARY ===
SELECT '=== SUMMARY ===' AS section;
SELECT 'patients' AS table_name, COUNT(*) AS duplicate_groups,
       SUM(cnt - 1) AS rows_to_remove
FROM (SELECT phone, COUNT(*) AS cnt FROM patients WHERE phone IS NOT NULL AND phone != '' GROUP BY phone HAVING COUNT(*) > 1) sub
UNION ALL
SELECT 'therapists', COUNT(*), SUM(cnt - 1)
FROM (SELECT phone, COUNT(*) AS cnt FROM therapists WHERE phone IS NOT NULL AND phone != '' GROUP BY phone HAVING COUNT(*) > 1) sub
UNION ALL
SELECT 'contact_requests', COUNT(*), SUM(cnt - 1)
FROM (SELECT phone, COUNT(*) AS cnt FROM contact_requests WHERE phone IS NOT NULL AND phone != '' GROUP BY phone HAVING COUNT(*) > 1) sub
UNION ALL
SELECT 'sales_leads', COUNT(*), SUM(cnt - 1)
FROM (SELECT phone, COUNT(*) AS cnt FROM sales_leads WHERE phone IS NOT NULL AND phone != '' GROUP BY phone HAVING COUNT(*) > 1) sub;


-- ============================================================================
-- STEP 2: CLEANUP — Run ONLY after reviewing Step 1 results with Hillel
-- Keeps the FIRST record per phone (oldest created_at), deletes the rest.
-- Also cleans up orphaned lead_attribution rows.
-- ============================================================================

/*
-- Uncomment this block after Hillel approves the audit results above.

-- Delete duplicate patients (keep oldest)
DELETE FROM patients
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at ASC) AS rn
        FROM patients
        WHERE phone IS NOT NULL AND phone != ''
    ) ranked
    WHERE rn > 1
);

-- Delete duplicate therapists (keep oldest)
DELETE FROM therapists
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at ASC) AS rn
        FROM therapists
        WHERE phone IS NOT NULL AND phone != ''
    ) ranked
    WHERE rn > 1
);

-- Delete duplicate contact_requests (keep oldest)
DELETE FROM contact_requests
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at ASC) AS rn
        FROM contact_requests
        WHERE phone IS NOT NULL AND phone != ''
    ) ranked
    WHERE rn > 1
);

-- Delete duplicate sales_leads (keep oldest)
DELETE FROM sales_leads
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at ASC) AS rn
        FROM sales_leads
        WHERE phone IS NOT NULL AND phone != ''
    ) ranked
    WHERE rn > 1
);

-- Clean orphaned lead_attribution rows (linked to deleted records)
DELETE FROM lead_attribution
WHERE linked_id IS NOT NULL
  AND linked_table IN ('patients', 'therapists', 'contact_requests', 'sales_leads')
  AND NOT EXISTS (
    SELECT 1 FROM patients WHERE patients.id = lead_attribution.linked_id AND lead_attribution.linked_table = 'patients'
    UNION ALL
    SELECT 1 FROM therapists WHERE therapists.id = lead_attribution.linked_id AND lead_attribution.linked_table = 'therapists'
    UNION ALL
    SELECT 1 FROM contact_requests WHERE contact_requests.id = lead_attribution.linked_id AND lead_attribution.linked_table = 'contact_requests'
    UNION ALL
    SELECT 1 FROM sales_leads WHERE sales_leads.id = lead_attribution.linked_id AND lead_attribution.linked_table = 'sales_leads'
  );

-- Verify cleanup
SELECT 'POST-CLEANUP VERIFICATION' AS section;
SELECT 'patients' AS t, COUNT(*) AS dupes FROM (SELECT phone FROM patients WHERE phone IS NOT NULL AND phone != '' GROUP BY phone HAVING COUNT(*) > 1) x
UNION ALL SELECT 'therapists', COUNT(*) FROM (SELECT phone FROM therapists WHERE phone IS NOT NULL AND phone != '' GROUP BY phone HAVING COUNT(*) > 1) x
UNION ALL SELECT 'contact_requests', COUNT(*) FROM (SELECT phone FROM contact_requests WHERE phone IS NOT NULL AND phone != '' GROUP BY phone HAVING COUNT(*) > 1) x
UNION ALL SELECT 'sales_leads', COUNT(*) FROM (SELECT phone FROM sales_leads WHERE phone IS NOT NULL AND phone != '' GROUP BY phone HAVING COUNT(*) > 1) x;
*/
