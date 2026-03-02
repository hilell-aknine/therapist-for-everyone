-- Migration 023: Enable Supabase Realtime for bot_automation_configs
-- Required for config-loader.js to receive instant postgres_changes events.
-- The CRM bot subscribes to INSERT/UPDATE/DELETE on this table for zero-delay sync.

ALTER PUBLICATION supabase_realtime ADD TABLE bot_automation_configs;
