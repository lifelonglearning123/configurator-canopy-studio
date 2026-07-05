-- =============================================================
-- GoHighLevel contact capture for the pre-configuration lead gate.
--
-- The gate (name/email/phone before the configurator unlocks) pushes a
-- contact straight into the tenant's GHL location via the LeadConnector
-- API v2, which needs a Location ID (column already exists) plus a
-- private-integration auth token. Full quote requests keep using the
-- generic inbound webhook (ghl_webhook_url) as before.
-- =============================================================

alter table tenants add column if not exists ghl_api_token text;
