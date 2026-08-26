-- Organisation billing state from Stripe Checkout / subscriptions.
-- Domain plans live in application code. Stripe secrets never persist here.
-- Application authorization remains mandatory. RLS is defense in depth.

CREATE TABLE IF NOT EXISTS organisation_billing (
  organisation_id TEXT PRIMARY KEY REFERENCES organisations(id),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL,
  price_id TEXT,
  current_period_end TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organisation_billing_customer_idx
  ON organisation_billing (stripe_customer_id);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE organisation_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_organisation_billing ON organisation_billing;
CREATE POLICY tenant_organisation_billing ON organisation_billing
  USING (organisation_id = current_setting('source.organisation_id', true));

-- Webhook idempotency is global. source_app reads/writes only via SECURITY DEFINER helpers.
DROP POLICY IF EXISTS deny_stripe_webhook_events ON stripe_webhook_events;
CREATE POLICY deny_stripe_webhook_events ON stripe_webhook_events
  USING (false);

GRANT SELECT, INSERT, UPDATE, DELETE ON organisation_billing TO source_app;
GRANT SELECT, INSERT ON stripe_webhook_events TO source_app;

CREATE OR REPLACE FUNCTION find_organisation_billing_by_customer(lookup_customer text)
RETURNS SETOF organisation_billing
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM organisation_billing WHERE stripe_customer_id = lookup_customer;
$$;

CREATE OR REPLACE FUNCTION upsert_organisation_billing(
  org_id text,
  customer_id text,
  subscription_id text,
  lookup_plan text,
  lookup_status text,
  lookup_price text,
  period_end timestamptz,
  lookup_updated timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO organisation_billing (
    organisation_id, stripe_customer_id, stripe_subscription_id, plan_id, status, price_id, current_period_end, updated_at
  ) VALUES (
    org_id, customer_id, subscription_id, lookup_plan, lookup_status, lookup_price, period_end, lookup_updated
  )
  ON CONFLICT (organisation_id) DO UPDATE SET
    stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, organisation_billing.stripe_customer_id),
    stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, organisation_billing.stripe_subscription_id),
    plan_id = EXCLUDED.plan_id,
    status = EXCLUDED.status,
    price_id = COALESCE(EXCLUDED.price_id, organisation_billing.price_id),
    current_period_end = COALESCE(EXCLUDED.current_period_end, organisation_billing.current_period_end),
    updated_at = EXCLUDED.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION insert_stripe_webhook_event(lookup_id text, lookup_type text, processed timestamptz)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  INSERT INTO stripe_webhook_events (event_id, event_type, processed_at)
  VALUES (lookup_id, lookup_type, processed)
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

CREATE OR REPLACE FUNCTION delete_stripe_webhook_event(lookup_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM stripe_webhook_events WHERE event_id = lookup_id;
$$;

REVOKE ALL ON FUNCTION find_organisation_billing_by_customer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_organisation_billing_by_customer(text) TO source_app;
REVOKE ALL ON FUNCTION upsert_organisation_billing(text, text, text, text, text, text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_organisation_billing(text, text, text, text, text, text, timestamptz, timestamptz) TO source_app;
REVOKE ALL ON FUNCTION insert_stripe_webhook_event(text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION insert_stripe_webhook_event(text, text, timestamptz) TO source_app;
REVOKE ALL ON FUNCTION delete_stripe_webhook_event(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_stripe_webhook_event(text) TO source_app;
